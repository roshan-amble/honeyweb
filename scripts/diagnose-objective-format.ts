import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { metaJSON } from "../src/meta.ts";
import {
  objectiveActionSchema,
  redactObjective,
} from "../src/objective-solver.ts";

// Transport diagnosis only: replay one already-public, credential-free failed view.
// Two calls, no HTTP tools, no task scoring and no retries.
const initial = JSON.parse(
  await readFile("docs/case-studies/objective-evaluation-initial.json", "utf8")
);
const trial = initial.trials.find(
  (t: any) => t.scenario === "accounts-a" && t.condition === "none"
);
const source = await readFile("src/objective-solver.ts", "utf8");
const systemMatch = source.match(
  /const result = await metaJSON\(\s*("(?:[^"\\]|\\.)*")/
);
if (!systemMatch)
  throw new Error("Cannot locate the unchanged frozen solver prompt.");
const system = JSON.parse(systemMatch[1]);
const view = {
  goal: trial.goal,
  observations: trial.observations,
  visitedRequests: trial.observations.map((o: any) => ({
    path: o.path,
    status: o.status,
  })),
  observedAuthorizations: [],
  remainingRequests: 8 - trial.metrics.requests,
};
const report: any = {
  purpose: "Two-call format diagnosis, not efficacy evidence",
  implementationCommit: process.env.GITHUB_SHA,
  sourceRun: 41263984834,
  view,
  attempts: [],
};
for (const strictSchema of [false, true]) {
  const attempt: any = { strictSchema };
  try {
    const result = await metaJSON(
      system,
      view,
      "objective_action",
      z.toJSONSchema(objectiveActionSchema),
      {
        strictSchema,
        onInvalidContent: (d) => {
          attempt.invalid = {
            ...d,
            content:
              typeof d.content === "string"
                ? d.content.slice(0, 12000)
                : d.content,
          };
        },
      }
    );
    attempt.value = result.value;
    attempt.usage = result.usage;
    attempt.schemaValid = objectiveActionSchema.safeParse(result.value).success;
  } catch (e) {
    attempt.error = e instanceof Error ? e.message : "Diagnostic failed";
  }
  report.attempts.push(attempt);
}
let text = redactObjective(JSON.stringify(report, null, 2));
if (process.env.MODEL_API_KEY)
  text = text.split(process.env.MODEL_API_KEY).join("[REDACTED]");
await writeFile("objective-format-diagnostic.json", text + "\n", {
  mode: 0o600,
});
console.log(
  JSON.stringify(
    report.attempts.map((a: any) => ({
      strictSchema: a.strictSchema,
      schemaValid: a.schemaValid,
      error: a.error,
      finishReason: a.invalid?.finishReason,
    }))
  )
);
