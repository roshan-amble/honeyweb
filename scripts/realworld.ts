import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomBytes, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { scanRepository, type Snapshot } from "../src/scanner.ts";
import { offlinePlan, validatePlan, type Generation } from "../src/plan.ts";
import { generateWithMeta } from "../src/meta.ts";
import {
  archiveGeneration,
  labGateway,
  scoreTrial,
  spawnDecoy,
} from "../src/lab.ts";
import { auditHTTP } from "../src/http-auditor.ts";
import { impact } from "../src/data.ts";

const exec = promisify(execFile),
  args = process.argv.slice(2);
const rootArg = args.find((a) => a.startsWith("--upstream="))?.slice(11);
if (
  !rootArg ||
  args.some(
    (a) =>
      !["--meta", "--start-upstream"].includes(a) &&
      !a.startsWith("--upstream=") &&
      !a.startsWith("--output=")
  )
)
  throw new Error(
    "Usage: npm run case:realworld -- --upstream=<disposable pinned checkout> [--meta] [--start-upstream] [--output=<json>]"
  );
const root = resolve(rootArg),
  source = join(root, "src"),
  provider = args.includes("--meta") ? "meta" : "offline",
  liveApp = args.includes("--start-upstream");
const output =
  args.find((a) => a.startsWith("--output="))?.slice(9) ??
  "realworld-evaluation.json";
const manifest = JSON.parse(
  await readFile(
    new URL("../case-studies/realworld/manifest.json", import.meta.url),
    "utf8"
  )
);
const schemaFile = join(source, "prisma/schema.prisma"),
  mapperFile = join(source, "app/routes/article/article.mapper.ts"),
  mainFile = join(source, "main.ts");
const originals = new Map<string, string>();
let app: ChildProcess | undefined, appURL: string | undefined;
// The application and decoys never inherit the model key. Only this orchestrator calls Meta.
const appEnv: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  NODE_ENV: "test",
  JWT_SECRET: randomBytes(32).toString("hex"),
};
const checks: { check: string; passed: boolean }[] = [];
const report: any = {
  createdAt: new Date().toISOString(),
  provider,
  upstream: manifest,
  executionPassed: false,
  trials: [],
};
function check(name: string, condition: boolean) {
  checks.push({ check: name, passed: condition });
  assert.ok(condition, name);
}
async function command(argv: string[]) {
  try {
    return await exec(process.execPath, argv, {
      cwd: root,
      env: appEnv,
      timeout: 120000,
      maxBuffer: 512000,
    });
  } catch (error) {
    const e = error as { stderr?: string; message?: string };
    throw new Error(
      `Upstream subprocess failed: ${(e.stderr ?? e.message ?? "unknown").slice(
        -1600
      )}`
    );
  }
}
async function stopApp() {
  if (!app || app.exitCode !== null) return;
  const child = app;
  await new Promise<void>((done) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
    child.once("exit", () => {
      clearTimeout(timer);
      done();
    });
    child.kill("SIGTERM");
  });
  app = undefined;
}
async function startApp() {
  const socket = createServer();
  await new Promise<void>((done) => socket.listen(0, "127.0.0.1", done));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((done) => socket.close(() => done()));
  appURL = `http://127.0.0.1:${port}`;
  app = spawn(
    process.execPath,
    [resolve("node_modules/tsx/dist/cli.mjs"), join(source, "main.ts")],
    {
      cwd: root,
      env: { ...appEnv, PORT: String(port) },
      stdio: ["ignore", "ignore", "pipe"],
    }
  );
  let errors = "";
  app.stderr?.on("data", (chunk) => {
    errors = (errors + chunk).slice(-1600);
  });
  for (let i = 0; i < 150; i++) {
    if (app.exitCode !== null)
      throw new Error(`Upstream failed to start: ${errors}`);
    try {
      const res = await fetch(appURL + "/", {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Upstream readiness timeout: ${errors}`);
}
async function api(path: string, body?: unknown, token?: string) {
  const response = await fetch(appURL + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      `Upstream ${body ? "POST" : "GET"} ${path} returned ${response.status}`
    );
  return (await response.json()) as any;
}
function connectedBaseline(snapshot: Snapshot, matched: Generation) {
  const baseline = offlinePlan(snapshot),
    exports = new Set(
      matched.plan.nodes.filter((n) => n.kind === "export").map((n) => n.entity)
    );
  baseline.plan.nodes = baseline.plan.nodes.filter(
    (n) => n.kind !== "export" || exports.has(n.entity)
  );
  const ids = new Set(baseline.plan.nodes.map((n) => n.id));
  baseline.plan.edges = baseline.plan.edges.filter(
    (e) => ids.has(e.from) && ids.has(e.to)
  );
  baseline.plan = validatePlan(baseline.plan, snapshot);
  return archiveGeneration(baseline, snapshot);
}
async function runTrial(
  condition: string,
  generation: Generation,
  snapshot: Snapshot,
  index: number
) {
  const worker = await spawnDecoy(generation, snapshot);
  const gateway = await labGateway(worker.url, worker.entryPath, appURL);
  try {
    const trial = await auditHTTP({
      startURL: gateway.url,
      provider,
      budget: 16,
    });
    const score = scoreTrial(trial, generation);
    const result = {
      condition,
      index,
      runtimeChecks: worker.checks,
      score,
      ...trial,
    };
    console.log(
      JSON.stringify({
        condition,
        index,
        score,
        metrics: trial.metrics,
        stopReason: trial.stopReason,
      })
    );
    return result;
  } finally {
    await gateway.close();
    await worker.close();
  }
}
const generationInfo = (g: Generation) => ({
  provider: g.provider,
  model: g.model,
  snapshotHash: g.snapshotHash,
  plan: g.plan,
  latencyMs: g.latencyMs ?? 0,
  usage: g.usage ?? null,
});
try {
  const head = (
    await exec("git", ["rev-parse", "HEAD"], { cwd: root })
  ).stdout.trim();
  check("Pinned upstream commit", head === manifest.commit);
  check(
    "Disposable checkout starts clean",
    (
      await exec("git", ["status", "--porcelain"], { cwd: root })
    ).stdout.trim() === ""
  );
  for (const file of [schemaFile, mapperFile, mainFile])
    originals.set(file, await readFile(file, "utf8"));
  const before = await scanRepository(source);
  const actualRoutes = before.routes.map((r) => `${r.method} ${r.path}`).sort();
  check(
    "20 exact mounted routes",
    JSON.stringify(actualRoutes) ===
      JSON.stringify([...manifest.expectedRoutes].sort())
  );
  check(
    "4 Prisma models",
    JSON.stringify(before.entities.map((e) => e.name).sort()) ===
      JSON.stringify([...manifest.expectedEntities].sort())
  );
  check(
    "3 explicit scalar references",
    JSON.stringify(
      before.relationships
        ?.map((r) => `${r.from}.${r.field}->${r.to}.${r.target}`)
        .sort()
    ) === JSON.stringify([...manifest.expectedRelationships].sort())
  );
  report.scanner = { before, oldCoverage: manifest.preChangeScanner };
  report.protocol = {
    revision: 2,
    revisionNote:
      "Fixed concrete URL contract; retain previously submitted observed credentials across context trimming. Both conditions use the same revised evaluator.",
    budget: 16,
    trialsPerCondition: 2,
    start:
      "Lab-authored homepage /, then /docs; exact decoy entry is not supplied to the evaluator.",
    evaluator:
      "Fresh HTTP-only conversation per trial; raw HTML/JSON/text, observed paths/statuses and previously submitted observed credentials only. No route inventory, graph, suggested paths, source or condition label.",
    baseline:
      "Deterministic connected graph from the same snapshot; same four entities, exports, records, relationship rules, response renderer, gateway and GET budget. Export inventory matched to the generated plan; paths and topology may differ.",
    order:
      "One Meta-graph and one connected-baseline trial per block; randomized order within each of two blocks.",
    scope:
      "Descriptive adapted case study on one reference app, not held-out validation, production security evidence or real-attacker effectiveness. Upstream API runs only with --start-upstream. Offline mode is a scripted text-link rehearsal.",
  };
  let slug: string | undefined;
  if (liveApp) {
    const database = process.env.DATABASE_URL;
    if (!database)
      throw new Error(
        "A disposable loopback honeyweb_case PostgreSQL database is required."
      );
    const url = new URL(database);
    check(
      "Dedicated local test database",
      url.protocol === "postgresql:" &&
        url.hostname === "127.0.0.1" &&
        url.pathname === "/honeyweb_case"
    );
    appEnv.DATABASE_URL = database;
    // Only the disposable checkout is patched: bind its original server to loopback.
    const main = originals.get(mainFile)!;
    check(
      "Expected upstream listener",
      main.includes("app.listen(PORT, () => {")
    );
    await writeFile(
      mainFile,
      main.replace(
        "app.listen(PORT, () => {",
        "app.listen(Number(PORT), '127.0.0.1', () => {"
      )
    );
    const prisma = join(root, "node_modules/prisma/build/index.js");
    await command([prisma, "generate", "--schema", schemaFile]);
    await command([prisma, "migrate", "deploy", "--schema", schemaFile]);
    await startApp();
    const user = (
      await api("/api/users", {
        user: {
          username: "honeyweb_lab",
          email: "honeyweb-lab@example.invalid",
          password: randomBytes(24).toString("hex"),
          image: "/assets/images/demo-avatar.png",
        },
      })
    ).user;
    const article = (
      await api(
        "/api/articles",
        {
          article: {
            title: "Honeyweb controlled case",
            description: "Synthetic integration evidence",
            body: "A disposable article for the local lab.",
            tagList: ["honeyweb-lab"],
          },
        },
        user.token
      )
    ).article;
    slug = article.slug;
    await api(
      `/api/articles/${slug}/comments`,
      { comment: { body: "A synthetic case-study comment." } },
      user.token
    );
    // Upstream hides non-demo authors from public listing. Set only our disposable seeded account to demo.
    await command([
      "-e",
      "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.update({where:{username:'honeyweb_lab'},data:{demo:true}}).finally(()=>p.$disconnect());",
    ]);
    const listing = await api("/api/articles"),
      tags = await api("/api/tags"),
      comments = await api(`/api/articles/${slug}/comments`);
    check(
      "Actual upstream article, tag and comment APIs",
      listing.articlesCount === 1 &&
        tags.tags.includes("honeyweb-lab") &&
        comments.comments.length === 1
    );
    report.application = {
      running: true,
      database: "Disposable PostgreSQL",
      seed: { users: 1, articles: 1, comments: 1, tags: 1 },
      readChecks: {
        articles: listing.articlesCount,
        tags: tags.tags.length,
        comments: comments.comments.length,
      },
      loopbackBindingPatch: true,
    };
  } else
    report.application = {
      running: false,
      note: "Source-only offline rehearsal; /api reads return 404. No claim of running the upstream app.",
    };
  const generate =
    provider === "meta"
      ? generateWithMeta
      : async (s: Snapshot) => offlinePlan(s);
  const generated = archiveGeneration(await generate(before), before),
    baseline = connectedBaseline(before, generated);
  check(
    "Matched node and export inventory",
    generated.plan.nodes.length === baseline.plan.nodes.length &&
      generated.plan.nodes.filter((n) => n.kind === "collection").length === 4
  );
  report.generations = {
    before: generationInfo(generated),
    baseline: generationInfo(baseline),
  };
  for (let block = 0; block < 2; block++)
    for (const condition of randomInt(2)
      ? ["generated", "connectedBaseline"]
      : ["connectedBaseline", "generated"]) {
      report.trials.push(
        await runTrial(
          condition,
          condition === "generated" ? generated : baseline,
          before,
          block + 1
        )
      );
      await writeFile(output, JSON.stringify(report, null, 2) + "\n", {
        mode: 0o600,
      });
    }
  const schema = originals.get(schemaFile)!;
  check("Expected Article model", schema.includes("model Article {"));
  await writeFile(
    schemaFile,
    schema.replace(
      "model Article {",
      'model Article {\n  moderationStatus String @default("pending")'
    )
  );
  const after = await scanRepository(source);
  check("Schema change detected", after.hash !== before.hash);
  const worker = await spawnDecoy(generated, before);
  try {
    const beforeChecks = (
      await worker.call({ operation: "audit", snapshot: after })
    ).checks;
    check(
      "Old Article records fail new schema",
      beforeChecks.some((c: any) => !c.passed && c.check === "schema:Article")
    );
    if (liveApp) {
      await stopApp();
      const mapper = originals.get(mapperFile)!;
      check(
        "Expected Article mapper",
        mapper.includes("  slug: article.slug,")
      );
      await writeFile(
        mapperFile,
        mapper.replace(
          "  slug: article.slug,",
          "  slug: article.slug,\n  moderationStatus: article.moderationStatus,"
        )
      );
      const prisma = join(root, "node_modules/prisma/build/index.js");
      await command([
        prisma,
        "db",
        "push",
        "--skip-generate",
        "--schema",
        schemaFile,
      ]);
      await command([prisma, "generate", "--schema", schemaFile]);
      await startApp();
      const updated = await api(`/api/articles/${slug}`);
      check(
        "Actual API exposes migrated field",
        updated.article.moderationStatus === "pending"
      );
      report.application.afterChange = {
        moderationStatus: updated.article.moderationStatus,
      };
    }
    const regenerated = archiveGeneration(await generate(after), after);
    const deployed = await worker.call({
      operation: "deploy",
      generation: regenerated,
      snapshot: after,
    });
    check(
      "All checks pass after regeneration",
      deployed.checks.every((c: any) => c.passed)
    );
    const gateway = await labGateway(worker.url, deployed.entryPath, appURL);
    try {
      const trial = await auditHTTP({
        startURL: gateway.url,
        provider,
        budget: 16,
      });
      report.regeneration = {
        change:
          'Article.moderationStatus String @default("pending"); upstream response mapper updated in live mode',
        affected: impact(before, after, generated),
        beforeChecks,
        afterChecks: deployed.checks,
        snapshot: after,
        generation: generationInfo(regenerated),
        trial: { ...trial, score: scoreTrial(trial, regenerated) },
      };
    } finally {
      await gateway.close();
    }
  } finally {
    await worker.close();
  }
  // Exploration coverage is an outcome, not an execution-pass criterion. Preserve partial/failed trials.
  report.executionPassed = true;
} catch (error) {
  let message = error instanceof Error ? error.message : "Case study failed";
  const key = process.env.MODEL_API_KEY;
  if (key) message = message.split(key).join("[REDACTED]");
  report.error = message;
  console.error(message);
  process.exitCode = 1;
} finally {
  await stopApp();
  for (const [file, content] of originals) await writeFile(file, content);
  report.executionChecks = checks;
  report.completedAt = new Date().toISOString();
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      executionPassed: report.executionPassed,
      provider,
      upstreamRunning: liveApp,
      trials: report.trials.length,
      output,
    })
  );
}
