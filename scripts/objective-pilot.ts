import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { scanRepository, type Snapshot } from "../src/scanner.ts";
import { validatePlan, type Generation } from "../src/plan.ts";
import { seedDataset } from "../src/data.ts";
import { spawnDecoy } from "../src/lab.ts";
import { startReferenceApp } from "../src/reference-app.ts";
import {
  objectiveGateway,
  objectiveScore,
  summarizeObjectives,
  type ObjectiveCondition,
} from "../src/objective-lab.ts";
import {
  redactObjective,
  solveObjective,
  type ObjectiveGoal,
  type ObjectiveTrial,
} from "../src/objective-solver.ts";
import { json } from "../src/runtime.ts";
import { publicObjectiveEvidence } from "../src/objective-evidence.ts";

const args = process.argv.slice(2),
  provider = args.includes("--meta") ? "meta" : "offline",
  fixture = args.includes("--fixture");
const upstream = args.find((a) => a.startsWith("--upstream="))?.slice(11),
  output =
    args.find((a) => a.startsWith("--output="))?.slice(9) ??
    "objective-evaluation.json";
if (
  args.some(
    (a) =>
      !["--meta", "--fixture"].includes(a) &&
      !a.startsWith("--upstream=") &&
      !a.startsWith("--output=")
  ) ||
  (!fixture && !upstream) ||
  (fixture && provider === "meta")
)
  throw new Error(
    "Use --upstream=<clean pinned checkout> [--meta] [--output=<json>], or --fixture for an offline rehearsal only."
  );
const rawProtocol = await readFile(
    new URL("../case-studies/objective/protocol.json", import.meta.url),
    "utf8"
  ),
  protocol = JSON.parse(rawProtocol);
const frozen = JSON.parse(
  await readFile(
    new URL("../docs/case-studies/realworld-evaluation.json", import.meta.url),
    "utf8"
  )
);
const snapshot = frozen.scanner.before as Snapshot;
const make = (name: "before" | "baseline"): Generation => ({
  ...frozen.generations[name],
  generatedAt: frozen.createdAt,
  plan: validatePlan(frozen.generations[name].plan, snapshot),
});
const plans = { meta: make("before"), connected: make("baseline") };
assert.equal(plans.meta.plan.nodes.length, 9);
assert.equal(plans.connected.plan.nodes.length, 9);
const report: any = {
  protocol,
  protocolHash: createHash("sha256").update(rawProtocol).digest("hex"),
  frozenPlansHash: createHash("sha256")
    .update(JSON.stringify(plans))
    .digest("hex"),
  implementationCommit: process.env.GITHUB_SHA ?? "local",
  createdAt: new Date().toISOString(),
  provider,
  executionPassed: false,
  plans,
  trials: [],
};
const amendment = await readFile(
  new URL(
    "../case-studies/objective/transport-amendment.json",
    import.meta.url
  ),
  "utf8"
);
report.transportAmendment = {
  ...JSON.parse(amendment),
  hash: createHash("sha256").update(amendment).digest("hex"),
};
const safeError = (e: unknown) => {
  let message = e instanceof Error ? e.message : "Pilot failed";
  if (process.env.MODEL_API_KEY)
    message = message.split(process.env.MODEL_API_KEY).join("[REDACTED]");
  return redactObjective(message);
};
let writes = Promise.resolve();
const checkpoint = () => {
  const contents =
    JSON.stringify(publicObjectiveEvidence(report), null, 2) + "\n";
  writes = writes.then(() => writeFile(output, contents, { mode: 0o600 }));
  return writes;
};
let reference: Awaited<ReturnType<typeof startReferenceApp>> | undefined;
try {
  if (fixture) {
    const data = seedDataset(plans.connected.plan, snapshot),
      server = createServer((req, res) =>
        json(
          res,
          200,
          req.url === "/api/articles"
            ? {
                articles: data.Article.map((r) => ({
                  ...r,
                  slug: String(r.slug),
                })),
                articlesCount: 4,
              }
            : { tags: ["editing"] }
        )
      );
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    reference = {
      url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
      data,
      close: () =>
        new Promise<void>((done) => {
          server.closeAllConnections();
          server.close(() => done());
        }),
      checks: {
        pinnedCommit: false,
        actualApplication: false,
        publicArticles: 4,
        rowsPerModel: 4,
        loopbackBinding: true,
      },
    };
  } else {
    assert.equal(
      (await scanRepository(upstream! + "/src")).hash,
      snapshot.hash,
      "Current source must match the frozen snapshot."
    );
    reference = await startReferenceApp(
      upstream!,
      protocol.source.split("@")[1]
    );
  }
  report.reference = reference.checks;
  const jobs: {
    scenario: string;
    condition: ObjectiveCondition;
    layout: number;
    goal: ObjectiveGoal;
  }[] = [];
  for (const scenario of protocol.scenarios)
    for (const condition of scenario.order)
      jobs.push({
        scenario: scenario.id,
        condition,
        layout: scenario.layout,
        goal: {
          kind: "internal-export",
          entity: scenario.entity,
          description: scenario.description,
        },
      });
  for (const condition of protocol.conditions)
    jobs.push({
      scenario: "public-read",
      condition,
      layout: 0,
      goal: {
        kind: "public-read",
        entity: "Article",
        description: protocol.benignGoal,
      },
    });
  report.assignmentOrder = jobs.map((j) => ({
    scenario: j.scenario,
    condition: j.condition,
  }));
  const results: any[] = new Array(jobs.length);
  let next = 0;
  await checkpoint();
  async function consume() {
    while (next < jobs.length) {
      const index = next++,
        job = jobs[index],
        generation =
          job.condition === "none" ? undefined : plans[job.condition];
      let decoy: Awaited<ReturnType<typeof spawnDecoy>> | undefined;
      let gateway: Awaited<ReturnType<typeof objectiveGateway>> | undefined;
      let trial: ObjectiveTrial;
      try {
        decoy = generation ? await spawnDecoy(generation, snapshot) : undefined;
        gateway = await objectiveGateway({
          referenceData: reference!.data,
          snapshot,
          upstreamURL: reference!.url,
          generation,
          decoyURL: decoy?.url,
          layout: job.layout,
        });
        trial = await solveObjective({
          startURL: gateway.url,
          goal: job.goal,
          provider,
          budget: protocol.httpBudget,
        });
      } catch (e) {
        trial = {
          provider,
          model:
            provider === "meta"
              ? process.env.META_MODEL ?? "muse-spark-1.3"
              : "offline rehearsal",
          stopReason: "execution-error",
          error: safeError(e),
          observations: [],
          actions: [],
          submission: null,
          suspectedPaths: [],
          metrics: {
            requests: 0,
            successfulRequests: 0,
            modelCalls: 0,
            inputTokens: 0,
            outputTokens: 0,
            elapsedMs: 0,
          },
        };
      }
      const cleanup = await Promise.allSettled([
        gateway?.close(),
        decoy?.close(),
      ]);
      const failure = cleanup.find((r) => r.status === "rejected");
      if (failure?.status === "rejected") {
        trial.stopReason = "execution-error";
        trial.error = safeError(failure.reason);
      }
      const score = objectiveScore(trial, job.goal, generation);
      results[index] = { ...job, score, ...trial };
      report.trials = results.filter(Boolean);
      console.log(
        JSON.stringify({
          scenario: job.scenario,
          condition: job.condition,
          score,
          requests: trial.metrics.requests,
          modelCalls: trial.metrics.modelCalls,
          stopReason: trial.stopReason,
        })
      );
      await checkpoint();
    }
  }
  // Each worker owns independent local gateway/decoy state and a fresh stateless model conversation.
  const workers = await Promise.allSettled(
    Array.from({ length: protocol.concurrency }, () => consume())
  );
  const failedWorker = workers.find((r) => r.status === "rejected");
  if (failedWorker?.status === "rejected") throw failedWorker.reason;
  report.trials = results;
  report.summary = summarizeObjectives(results);
  report.executionPassed = !report.summary.anyExecutionError;
  if (!report.executionPassed) process.exitCode = 1;
} catch (e) {
  report.error = safeError(e);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  try {
    await reference?.close();
  } catch (e) {
    report.cleanupError = safeError(e);
    report.executionPassed = false;
    process.exitCode = 1;
  }
  await writes.catch(() => {});
  report.completedAt = new Date().toISOString();
  await writeFile(
    output,
    JSON.stringify(publicObjectiveEvidence(report), null, 2) + "\n",
    {
      mode: 0o600,
    }
  );
  console.log(
    JSON.stringify({
      executionPassed: report.executionPassed,
      summary: report.summary,
      output,
    })
  );
}
