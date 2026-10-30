import { createServer, type Server, type RequestListener } from "node:http";
import { writeFile } from "node:fs/promises";
import { scanRepository } from "../src/scanner.ts";
import { offlinePlan } from "../src/plan.ts";
import { generateWithMeta } from "../src/meta.ts";
import { DecoyRuntime, json } from "../src/runtime.ts";
import { explore } from "../src/explorer.ts";
import { impact } from "../src/data.ts";

const args = process.argv.slice(2);
const provider = args.includes("--meta") ? "meta" : "offline";
const output = args.find(arg => arg.startsWith("--output="))?.slice(9);
if (args.some(arg => arg !== "--meta" && !arg.startsWith("--output="))) throw new Error("Usage: npm run evaluate -- [--meta] [--output=<path>]");
const servers: Server[] = [];
async function serve(handler: RequestListener) {
  const server = createServer(handler); servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
try {
  const v1 = await scanRepository("./fixtures/acme-v1"), v2 = await scanRepository("./fixtures/acme-v2");
  const generate = provider === "meta" ? generateWithMeta : async (snapshot: typeof v1) => offlinePlan(snapshot);
  const first = await generate(v1), runtime = new DecoyRuntime(first, v1);
  const base = await serve(runtime.handle);
  const run = () => explore({ entryURL: base + runtime.entryPath, provider, budget: 12, marker: () => runtime.createDemoMarker() });
  const beforeExploration = await run();
  const beforeChecks = runtime.audit(v2), affected = impact(v1, v2, first);
  const second = await generate(v2); runtime.deploy(second, v2);
  const afterChecks = runtime.audit(v2), afterExploration = await run();
  const staticBase = await serve((req, res) => req.url === runtime.entryPath
    ? json(res, 200, { kind: "collection", entity: "Record", records: [{ id: "static_001", name: "Generic record" }], links: [] })
    : json(res, 404, { error: "Not found" }));
  const baseline = await explore({ entryURL: staticBase + runtime.entryPath, provider, budget: 12 });
  const success = [beforeExploration, afterExploration].every(r => r.metrics.entities === 3 && r.metrics.exports >= 1 && r.metrics.consistencyChecks >= 3 && r.metrics.consistencyFailures === 0 && r.metrics.successfulRequests === r.metrics.requests) &&
    beforeChecks.some(c => !c.passed) && afterChecks.every(c => c.passed);
  const report = {
    result: success ? "passed" : "failed", createdAt: new Date().toISOString(), provider,
    protocol: "One run per environment; 12 GET budget; same explorer policy. Only a supplied entry URL and observed response links. Generic static baseline has one flat collection. Descriptive fixture simulation, not a real-attacker efficacy benchmark. Tokens are measured; dollar cost is not estimated.",
    generation: [first, second].map(g => ({ snapshotHash: g.snapshotHash, model: g.model, nodes: g.plan.nodes.length, latencyMs: g.latencyMs ?? 0, usage: g.usage ?? null })),
    regeneration: { affected, beforeChecks, afterChecks },
    environments: { before: beforeExploration, after: afterExploration, staticBaseline: baseline },
  };
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(JSON.stringify({ result: report.result, provider, before: beforeExploration.metrics, after: afterExploration.metrics, staticBaseline: baseline.metrics, failingBefore: beforeChecks.filter(c => !c.passed).length, failingAfter: afterChecks.filter(c => !c.passed).length }, null, 2));
  if (!success) process.exitCode = 1;
} catch (error) {
  const message = error instanceof Error ? error.message : "Evaluation failed.";
  const key = process.env.MODEL_API_KEY;
  console.error(key ? message.split(key).join("[REDACTED]") : message); process.exitCode = 1;
} finally {
  for (const server of servers) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
