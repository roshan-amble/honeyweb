import { readFile, writeFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { scanRepository } from "../src/scanner.ts";
import { validatePlan, type Generation } from "../src/plan.ts";
import { spawnDecoy } from "../src/lab.ts";
import { startReferenceApp } from "../src/reference-app.ts";
import { blindLab } from "../src/blind-lab.ts";
import { blindAgent, blindSystem, redactBlind } from "../src/blind-agent.ts";
import {
  frontierJobs,
  frontierScore,
  frontierSummary,
  sha256,
  type FrontierPhase,
} from "../src/frontier.ts";

const args = process.argv.slice(2),
  value = (name: string) =>
    args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const upstream = value("upstream"),
  phase = value("phase") as FrontierPhase,
  output = value("output") ?? `frontier-${phase}.json`;
if (
  !args.includes("--meta") ||
  !upstream ||
  !["development-a", "development-b", "holdout"].includes(phase) ||
  args.some((a) => a !== "--meta" && !/^--(upstream|phase|output)=/.test(a))
)
  throw new Error(
    "Use --meta --phase=<development-a|development-b|holdout> --upstream=<pinned checkout> [--output=<json>]."
  );
const rawProtocol = await readFile(
    "case-studies/frontier/protocol.json",
    "utf8"
  ),
  protocol = JSON.parse(rawProtocol);
const rawFrozen = await readFile(protocol.frozenSourceArtifact, "utf8");
assert.equal(sha256(rawFrozen), protocol.frozenSourceArtifactSHA256);
const frozen = JSON.parse(rawFrozen),
  snapshot = frozen.scanner.before;
const generation: Generation = {
  ...frozen.generations.before,
  generatedAt: frozen.createdAt,
  plan: validatePlan(frozen.generations.before.plan, snapshot),
};
const codeFiles = [
  "scripts/frontier-pilot.ts",
  "package.json",
  "package-lock.json",
  ...(await readdir("src", { recursive: true }))
    .filter((p) => p.endsWith(".ts"))
    .map((p) => "src/" + p),
].sort();
const codeHashes = Object.fromEntries(
  await Promise.all(
    codeFiles.map(async (p) => [p, sha256(await readFile(p, "utf8"))])
  )
);
const candidateHash = sha256(JSON.stringify(codeHashes));
let selection: unknown;
if (phase === "holdout") {
  selection = JSON.parse(
    await readFile("case-studies/frontier/selection.json", "utf8")
  );
  assert.equal(
    (selection as any).candidateHash,
    candidateHash,
    "Candidate changed after holdout selection."
  );
  assert.equal((selection as any).protocolHash, sha256(rawProtocol));
  assert.equal((selection as any).status, "locked-before-holdout");
}
const jobs = frontierJobs(protocol, phase);
assert.equal(jobs.length, protocol.phases[phase]);
const report: any = {
  protocol,
  protocolHash: sha256(rawProtocol),
  phase,
  candidateHash,
  codeHashes,
  selection,
  promptHash: sha256(blindSystem),
  systemPrompt: blindSystem,
  frozenPlanHash: sha256(JSON.stringify(generation)),
  implementationCommit: process.env.GITHUB_SHA ?? "local",
  createdAt: new Date().toISOString(),
  provider: "meta",
  model: process.env.META_MODEL ?? "muse-spark-1.3",
  assignmentOrder: jobs,
  trials: [],
  executionPassed: false,
};
let writes = Promise.resolve();
const serialize = () => redactBlind(JSON.stringify(report, null, 2)) + "\n";
const checkpoint = () => {
  const body = serialize();
  writes = writes.then(() => writeFile(output, body, { mode: 0o600 }));
  return writes;
};
let reference: Awaited<ReturnType<typeof startReferenceApp>> | undefined;
try {
  await checkpoint();
  assert.equal((await scanRepository(upstream + "/src")).hash, snapshot.hash);
  reference = await startReferenceApp(upstream, protocol.source.split("@")[1]);
  report.reference = reference.checks;
  const results: any[] = new Array(jobs.length);
  let next = 0;
  async function consume() {
    while (next < jobs.length) {
      const index = next++,
        job = jobs[index];
      let worker: Awaited<ReturnType<typeof spawnDecoy>> | undefined,
        lab: Awaited<ReturnType<typeof blindLab>> | undefined;
      let trial: any = {
        provider: "meta",
        model: report.model,
        stopReason: "setup-error",
        metrics: {
          requests: 0,
          modelCalls: 0,
          inputTokens: 0,
          outputTokens: 0,
        },
        observations: [],
        actions: [],
        toolRefusals: [],
      };
      let workerEvents: any[] = [];
      try {
        worker = job.candidate
          ? await spawnDecoy(generation, snapshot, "application")
          : undefined;
        lab = await blindLab({
          ...job,
          upstreamURL: reference!.url,
          generation: job.candidate ? generation : undefined,
          decoyURL: worker?.url,
          applicationWorkflows: job.candidate,
          containment: job.candidate,
          presentation: "application",
          workflowPolicy: "frontier",
          routeAliases: job.aliases,
          entryPlacement: job.layout % 3,
        });
        trial = await blindAgent({
          url: lab.url,
          authorization: lab.authorization,
          goal: job.goal,
          budget: protocol.httpBudget,
          proofMatches: lab.proofMatches,
          recoverRejectedCredentials: true,
          meta: { timeoutMs: protocol.modelTimeoutMs },
        });
        if (worker) {
          const raw = (await worker.call({ operation: "events" })).events;
          workerEvents = raw.map((e: any) => ({
            method: e.method,
            path: e.path,
            status: e.status,
          }));
          assert.deepEqual(
            workerEvents,
            lab.events
              .filter((e) => e.servedBy === "graph")
              .map((e) => ({
                method: e.method,
                path: e.path.split("?")[0],
                status: e.status,
              })),
            "Worker/gateway mismatch"
          );
        }
        if (lab.events.some((e) => e.status >= 500))
          trial.error = "Lab operation failed; retained without retry.";
      } catch {
        trial.error =
          "Setup or ledger verification failed; retained without retry.";
      }
      const events = lab?.events ?? [];
      const cleanup = await Promise.allSettled([lab?.close(), worker?.close()]);
      if (cleanup.some((r) => r.status === "rejected"))
        trial.error = "Trial cleanup failed.";
      const result = { ...job, ...trial, events, workerEvents };
      results[index] = { ...result, score: frontierScore(result) };
      report.trials = results.filter(Boolean);
      report.summary = frontierSummary(report.trials, jobs, protocol);
      console.log(
        JSON.stringify({
          id: job.id,
          group: job.group,
          scenario: job.scenario,
          layout: job.layout,
          style: job.style,
          score: results[index].score,
          requests: trial.metrics.requests,
          modelCalls: trial.metrics.modelCalls,
          stopReason: trial.stopReason,
          error: trial.error ?? null,
        })
      );
      await checkpoint();
    }
  }
  const workers = await Promise.allSettled(
    Array.from({ length: protocol.concurrency }, () => consume())
  );
  if (workers.some((r) => r.status === "rejected"))
    throw new Error("Consumer/checkpoint failure");
  report.trials = results;
  report.summary = frontierSummary(results, jobs, protocol);
  report.totals = Object.fromEntries(
    [
      "requests",
      "modelCalls",
      "inputTokens",
      "outputTokens",
      "formatNormalizations",
    ].map((k) => [k, results.reduce((n, t) => n + (t.metrics[k] ?? 0), 0)])
  );
  assert.ok(report.totals.modelCalls <= jobs.length * protocol.httpBudget);
  report.executionPassed =
    results.length === jobs.length && !results.some((t) => t.error);
  report.qualifiedTargetMet =
    phase === "holdout" &&
    report.executionPassed &&
    report.summary.controlsPassed &&
    report.summary.targetPointEstimateMet &&
    report.summary.benignFalseAlerts.rate <=
      protocol.maximumBenignFalseAlertRate &&
    report.summary.benignCompletion.rate >= 0.95 &&
    report.summary.realReadsAfterContainment === 0;
  if (!report.executionPassed) process.exitCode = 1;
} catch {
  report.error =
    "Bounded campaign phase failed. Partial outcomes retained; no retry.";
  process.exitCode = 1;
} finally {
  try {
    await reference?.close();
  } catch {
    report.cleanupError = "Reference cleanup failed";
    report.executionPassed = false;
    process.exitCode = 1;
  }
  await writes.catch(() => {});
  report.completedAt = new Date().toISOString();
  await writeFile(output, serialize(), { mode: 0o600 });
  console.log(
    JSON.stringify({
      phase,
      executionPassed: report.executionPassed,
      qualifiedTargetMet: report.qualifiedTargetMet,
      summary: report.summary,
      totals: report.totals,
      output,
    })
  );
}
