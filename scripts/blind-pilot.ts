import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { scanRepository, type Snapshot } from "../src/scanner.ts";
import { validatePlan, type Generation } from "../src/plan.ts";
import { spawnDecoy } from "../src/lab.ts";
import { startReferenceApp } from "../src/reference-app.ts";
import {
  blindLab,
  scoreBlind,
  summarizeBlind,
  type BlindScenario,
  type BlindTask,
} from "../src/blind-lab.ts";
import { blindAgent, blindSystem, redactBlind } from "../src/blind-agent.ts";

const args = process.argv.slice(2),
  upstream = args.find((a) => a.startsWith("--upstream="))?.slice(11),
  output =
    args.find((a) => a.startsWith("--output="))?.slice(9) ??
    "blind-evaluation.json";
if (
  !args.includes("--meta") ||
  !upstream ||
  args.some(
    (a) =>
      a !== "--meta" &&
      !a.startsWith("--upstream=") &&
      !a.startsWith("--output=")
  )
)
  throw new Error(
    "Use --meta --upstream=<clean pinned checkout> [--output=<json>]. Local tests use scripted decisions, never a claimed live fallback."
  );
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const rawProtocol = await readFile(
    new URL("../case-studies/blind/protocol.json", import.meta.url),
    "utf8"
  ),
  protocol = JSON.parse(rawProtocol);
const rawFrozen = await readFile(
  new URL("../docs/case-studies/realworld-evaluation.json", import.meta.url),
  "utf8"
);
assert.equal(hash(rawFrozen), protocol.frozenSourceArtifactSHA256);
const frozen = JSON.parse(rawFrozen),
  snapshot = frozen.scanner.before as Snapshot;
const make = (name: "before" | "baseline"): Generation => ({
  ...frozen.generations[name],
  generatedAt: frozen.createdAt,
  plan: validatePlan(frozen.generations[name].plan, snapshot),
});
const plans = { meta: make("before"), connected: make("baseline") };
for (const plan of Object.values(plans))
  assert.equal(plan.plan.nodes.length, 9);
type Job = {
  id: string;
  scenario: BlindScenario;
  condition: "none" | "connected" | "meta";
  variant: number;
  task: BlindTask;
  secure: boolean;
  goal: string;
};
const jobs: Job[] = [];
for (const s of protocol.scenarios)
  for (const condition of s.order)
    jobs.push({
      id: s.id,
      scenario: s.scenario,
      condition,
      variant: s.variant,
      task: "attack",
      secure: false,
      goal: s.goal,
    });
for (const b of protocol.benign)
  for (const condition of protocol.conditions)
    jobs.push({
      id: b.id,
      scenario: "draft-idor",
      condition,
      variant: 0,
      task: b.id,
      secure: false,
      goal: b.goal,
    });
for (const s of protocol.secureControls)
  jobs.push({
    id: `secure-${s.scenario}`,
    scenario: s.scenario,
    condition: "none",
    variant: s.variant,
    task: "attack",
    secure: true,
    goal: s.goal,
  });
assert.equal(jobs.length, protocol.plannedTrials);
assert.equal(jobs.length * protocol.httpBudget, protocol.maxModelCalls);
const report: any = {
  protocol,
  protocolHash: hash(rawProtocol),
  promptHash: hash(blindSystem),
  systemPrompt: blindSystem,
  frozenPlansHash: hash(JSON.stringify(plans)),
  implementationCommit: process.env.GITHUB_SHA ?? "local",
  createdAt: new Date().toISOString(),
  provider: "meta",
  model: process.env.META_MODEL ?? "muse-spark-1.3",
  executionPassed: false,
  assignmentOrder: jobs,
  trials: [],
};
// No free-text provider responses, raw records, POST values, credentials or proof values are persisted.
const serialize = () => redactBlind(JSON.stringify(report, null, 2)) + "\n";
let writes = Promise.resolve();
const checkpoint = () => {
  const contents = serialize();
  writes = writes.then(() => writeFile(output, contents, { mode: 0o600 }));
  return writes;
};
let reference: Awaited<ReturnType<typeof startReferenceApp>> | undefined;
try {
  await checkpoint();
  assert.equal(
    (await scanRepository(upstream + "/src")).hash,
    snapshot.hash,
    "Source differs from the frozen snapshot."
  );
  reference = await startReferenceApp(upstream, protocol.source.split("@")[1]);
  report.reference = reference.checks;
  const results: any[] = new Array(jobs.length);
  let next = 0;
  async function consume() {
    while (next < jobs.length) {
      const index = next++,
        job = jobs[index],
        generation =
          job.condition === "none" ? undefined : plans[job.condition];
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
        },
        workerEvents: any[] = [];
      try {
        worker = generation
          ? await spawnDecoy(generation, snapshot)
          : undefined;
        lab = await blindLab({
          ...job,
          generation,
          decoyURL: worker?.url,
          upstreamURL: reference!.url,
        });
        trial = await blindAgent({
          url: lab.url,
          authorization: lab.authorization,
          goal: job.goal,
          budget: protocol.httpBudget,
          proofMatches: lab.proofMatches,
        });
        if (worker) {
          const raw = (await worker.call({ operation: "events" })).events;
          workerEvents = raw.map((e: any) => ({
            method: e.method,
            path: e.path,
            status: e.status,
          }));
          const proxied = lab.events
            .filter((e) => e.kind.startsWith("decoy"))
            .map((e) => ({
              method: e.method,
              path: new URL(e.path, "http://127.0.0.1").pathname,
              status: e.status,
            }));
          assert.deepEqual(
            workerEvents,
            proxied,
            "Decoy worker and gateway ledgers disagree."
          );
        }
        if (lab.events.some((e) => e.status >= 500))
          trial.error =
            "A lab operation failed; retained as an execution error.";
      } catch {
        trial.error =
          "Trial setup, model operation or ledger verification failed; no retry was performed.";
      }
      const events = lab?.events ?? [];
      const cleanup = await Promise.allSettled([lab?.close(), worker?.close()]);
      if (cleanup.some((r) => r.status === "rejected"))
        trial.error = "Trial cleanup failed.";
      const score = scoreBlind(events);
      results[index] = { ...job, ...trial, events, workerEvents, score };
      report.trials = results.filter(Boolean);
      console.log(
        JSON.stringify({
          id: job.id,
          condition: job.condition,
          secure: job.secure,
          score,
          requests: trial.metrics.requests,
          modelCalls: trial.metrics.modelCalls,
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
    throw new Error("Worker or checkpoint failed.");
  report.trials = results;
  report.summary = summarizeBlind(results);
  report.totals = Object.fromEntries(
    [
      "requests",
      "modelCalls",
      "inputTokens",
      "outputTokens",
      "formatNormalizations",
    ].map((k) => [k, results.reduce((n, t) => n + (t.metrics[k] ?? 0), 0)])
  );
  assert.ok(report.totals.modelCalls <= protocol.maxModelCalls);
  report.executionPassed =
    results.length === protocol.plannedTrials &&
    !report.summary.anyExecutionError;
  if (!report.executionPassed) process.exitCode = 1;
} catch {
  report.error =
    "Pilot setup, bounded execution or checkpoint failed. See workflow step status; partial outcomes are retained.";
  process.exitCode = 1;
} finally {
  try {
    await reference?.close();
  } catch {
    report.cleanupError = "Reference application cleanup failed.";
    report.executionPassed = false;
    process.exitCode = 1;
  }
  await writes.catch(() => {});
  report.completedAt = new Date().toISOString();
  await writeFile(output, serialize(), { mode: 0o600 });
  console.log(
    JSON.stringify({
      executionPassed: report.executionPassed,
      summary: report.summary,
      totals: report.totals,
      output,
    })
  );
}
