import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
  runCampaign,
  hash,
  summarizeCampaign,
  assessCandidate,
  type CampaignManifest,
} from "../src/campaign.ts";
import {
  frameworkAssignments,
  evaluateFrontierAssignment,
} from "../src/framework-frontier.ts";
import { metaPreflight } from "../src/meta.ts";
import { startReferenceApp } from "../src/reference-app.ts";
import { scanRepository } from "../src/scanner.ts";
import { validatePlan } from "../src/plan.ts";

const args = process.argv.slice(2),
  value = (k: string) =>
    args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
let reference:
  | Promise<Awaited<ReturnType<typeof startReferenceApp>>>
  | undefined;
try {
  const directory = value("directory"),
    upstream = value("upstream");
  if (
    !directory ||
    (!args.includes("--prepare") && !upstream) ||
    (!args.includes("--prepare") && !args.includes("--meta")) ||
    args.some(
      (a) =>
        !["--prepare", "--meta", "--resume"].includes(a) &&
        !/^--(directory|upstream)=/.test(a)
    )
  )
    throw Error(
      "Use --prepare --directory=<path>, or --meta --upstream=<pinned source> --directory=<path> [--resume]."
    );
  const raw = await readFile(
      "docs/case-studies/realworld-evaluation.json",
      "utf8"
    ),
    digest = (s: string) => createHash("sha256").update(s).digest("hex");
  assert.equal(
    digest(raw),
    "aeb96b40e10c885898e43f61c7828f718d5252961e733ab96b067d7254e8195d"
  );
  const frozen = JSON.parse(raw),
    snapshot = frozen.scanner.before;
  const files = [
    "scripts/framework-live.ts",
    "package.json",
    "package-lock.json",
    ...(await readdir("src", { recursive: true }))
      .filter((p) => p.endsWith(".ts"))
      .map((p) => "src/" + p),
  ].sort();
  const hashes = Object.fromEntries(
    await Promise.all(
      files.map(async (p) => [p, digest(await readFile(p, "utf8"))])
    )
  );
  const manifest: CampaignManifest = {
    version: 2,
    id: "frontier-development-v2",
    phase: "development",
    mode: "meta",
    model: process.env.META_MODEL ?? "muse-spark-1.3",
    candidateHash: hash(hashes),
    sourceHashes: { realworld: snapshot.hash, frozenEvidence: digest(raw) },
    batchSize: 3,
    assignments: frameworkAssignments(),
    attemptPolicy: "one-attempt-per-assignment; resume-unstarted-only",
    targetCatchRate: 0.9,
    maximumBenignDisruption: 0.05,
  };
  if (args.includes("--prepare")) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      { mode: 0o600, flag: "wx" }
    );
    console.log(
      JSON.stringify({
        prepared: true,
        manifestHash: hash(manifest),
        assignments: manifest.assignments.length,
        maximumAgentCalls: manifest.assignments.reduce(
          (n, j) => n + j.budget,
          0
        ),
        maximumInitialPreflights: Math.ceil(
          manifest.assignments.length / manifest.batchSize
        ),
        liveCalls: 0,
      })
    );
  } else {
    const prepared = JSON.parse(
      await readFile(join(directory, "manifest.json"), "utf8")
    );
    if (hash(prepared) !== hash(manifest))
      throw Error("Prepared candidate changed. Use a new protocol/directory.");
    assert.equal(
      (await scanRepository(upstream! + "/src")).hash,
      snapshot.hash
    );
    const generation = {
      ...frozen.generations.before,
      generatedAt: frozen.createdAt,
      plan: validatePlan(frozen.generations.before.plan, snapshot),
    };
    const journal = await runCampaign({
      directory,
      manifest,
      resume: args.includes("--resume"),
      preflight: () =>
        metaPreflight({ timeoutMs: 30000, model: manifest.model }),
      execute: async (job, stopped) => {
        reference ??= startReferenceApp(
          upstream!,
          "30b68e1e881462b2f4164ea09ab4c4f5699c7b0b"
        );
        const app = await reference;
        return evaluateFrontierAssignment(
          job,
          manifest.assignments.findIndex((j) => j.id === job.id),
          {
            upstreamURL: app.url,
            snapshot,
            generation,
            stopped,
            meta: { timeoutMs: 90000, model: manifest.model },
          }
        );
      },
    });
    const summary = summarizeCampaign(journal);
    console.log(
      JSON.stringify({ summary, assessment: assessCandidate(journal) }, null, 2)
    );
    if (!summary.complete || summary.errors) process.exitCode = 1;
  }
} catch {
  console.error(
    "Campaign stopped. Check prepared manifest, provider diagnostics and retained checkpoint; no attempt was retried."
  );
  process.exitCode = 1;
} finally {
  if (reference)
    await reference
      .then((r) => r.close())
      .catch(() => {
        process.exitCode = 1;
      });
}
