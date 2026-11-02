import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { scanRepository } from "../src/scanner.ts";
import {
  compileWorkflowPlan,
  planWorkflowsWithMeta,
} from "../src/workflow-plan.ts";
import {
  WorkflowEnvironment,
  serveWorkflowEnvironment,
} from "../src/workflow-environment.ts";
import {
  runCampaign,
  hash,
  summarizeCampaign,
  assessCandidate,
  type Assignment,
  type CampaignManifest,
} from "../src/campaign.ts";
import {
  behavioralPolicies,
  benignPolicies,
  verifyWorkflowCase,
} from "../src/framework-verification.ts";

const [command, ...args] = process.argv.slice(2);
const value = (key: string) =>
  args.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3);
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
try {
  if (command === "plan" || command === "serve") {
    const source = value("source");
    if (!source) throw Error("Use --source=<authorized source directory>.");
    if (args.some((a) => !a.startsWith("--source=") && a !== "--meta"))
      throw Error("Unknown workflow argument.");
    const snapshot = await scanRepository(source);
    const generated = args.includes("--meta")
      ? await planWorkflowsWithMeta(snapshot)
      : { plan: compileWorkflowPlan(snapshot), provider: "deterministic" };
    if (command === "plan") console.log(JSON.stringify(generated, null, 2));
    else {
      const environment = new WorkflowEnvironment(generated.plan, snapshot),
        session = environment.openSession("operator-demo"),
        server = await serveWorkflowEnvironment(environment);
      console.log(
        JSON.stringify({
          url: server.url,
          provider: generated.provider,
          note: "Local fictional workflow service. Session credentials below are disposable; keep them out of shared logs.",
          cookie: session.cookie,
          authorization: session.authorization,
        })
      );
      const close = async () => {
        await server.close();
        process.exit(0);
      };
      process.once("SIGINT", close);
      process.once("SIGTERM", close);
    }
  } else if (command === "verify") {
    if (
      !args.includes("--offline") ||
      args.some(
        (a) =>
          a !== "--offline" &&
          a !== "--resume" &&
          !/^--(directory|output)=/.test(a)
      )
    )
      throw Error(
        "Use verify --offline --directory=<checkpoint directory> [--resume] [--output=<report>]. This command never calls Meta."
      );
    const directory = value("directory");
    if (!directory)
      throw Error("An explicit checkpoint directory is required.");
    const sources = {
      "acme-v1": await scanRepository("fixtures/acme-v1"),
      "acme-v2": await scanRepository("fixtures/acme-v2"),
      realworld: JSON.parse(
        await readFile("docs/case-studies/realworld-evaluation.json", "utf8")
      ).scanner.before,
    };
    const files = [
      "package.json",
      "package-lock.json",
      "scripts/framework.ts",
      ...(await readdir("src", { recursive: true }))
        .filter((p) => p.endsWith(".ts"))
        .map((p) => "src/" + p),
    ].sort();
    const hashes = Object.fromEntries(
      await Promise.all(
        files.map(async (p) => [p, digest(await readFile(p, "utf8"))])
      )
    );
    const assignments: Assignment[] = [];
    for (const fixture of Object.keys(sources))
      for (const budget of [12, 24, 48] as const)
        for (const policy of [...behavioralPolicies, ...benignPolicies])
          assignments.push({
            id: `${fixture}-${budget}-${policy}`,
            fixture,
            policy,
            budget,
            kind:
              policy === "decoy-aware-stop"
                ? "aware-stress"
                : behavioralPolicies.includes(policy)
                ? "attack"
                : "benign",
          });
    const manifest: CampaignManifest = {
      version: 2,
      id: "framework-contracts-v1",
      phase: "development",
      mode: "scripted",
      model: "scripted-http-contracts",
      candidateHash: hash(hashes),
      sourceHashes: Object.fromEntries(
        Object.entries(sources).map(([name, s]) => [name, s.hash])
      ),
      batchSize: 3,
      assignments,
      attemptPolicy: "one-attempt-per-assignment; resume-unstarted-only",
      targetCatchRate: 0.9,
      maximumBenignDisruption: 0.05,
    };
    const journal = await runCampaign({
      directory,
      manifest,
      resume: args.includes("--resume"),
      preflight: async () => ({ ready: true, mode: "scripted-no-provider" }),
      execute: (job) =>
        verifyWorkflowCase(sources[job.fixture as keyof typeof sources], job),
    });
    const summary = summarizeCampaign(journal),
      report = {
        label:
          "Scripted workflow contract verification. Not live model or real-attacker efficacy.",
        summary,
        assessment: assessCandidate(journal),
        journal,
      };
    if (value("output"))
      await writeFile(
        value("output")!,
        JSON.stringify(report, null, 2) + "\n",
        { mode: 0o600 }
      );
    console.log(
      JSON.stringify(
        { label: report.label, summary, assessment: report.assessment },
        null,
        2
      )
    );
    if (!summary.complete || summary.errors || summary.benignDisrupted)
      process.exitCode = 1;
  } else throw Error("Use plan, serve or verify.");
} catch {
  console.error(
    "Framework command failed. Check arguments, plan validity and the retained checkpoint; no provider retry was performed."
  );
  process.exitCode = 1;
}
