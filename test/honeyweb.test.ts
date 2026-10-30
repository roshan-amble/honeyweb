import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { request, createServer } from "node:http";
import { explore } from "../src/explorer.ts";
import { DecoyRuntime } from "../src/runtime.ts";
import { seedDataset, auditDataset } from "../src/data.ts";
import { inferRelationships } from "../src/plan.ts";
import { scanRepository, drift } from "../src/scanner.ts";
import { offlinePlan, validatePlan } from "../src/plan.ts";
import { generateWithMeta } from "../src/meta.ts";
import { startWorkspace } from "../src/server.ts";

const fixture = (version: string) =>
  fileURLToPath(new URL(`../fixtures/acme-${version}`, import.meta.url));

test("scanner extracts routes and interfaces, excludes values, ignores hidden files and symlinks", async () => {
  const temp = await mkdtemp(join(tmpdir(), "honeyweb-test-"));
  try {
    const root = join(temp, "source");
    await mkdir(root);
    await writeFile(
      join(root, "app.ts"),
      `import express from 'express'; const app = express(); const SECRET = 'do-not-export'; interface Customer { id: string; mode: 'private-value' } app.get('/api/customers', () => { throw new Error('never execute') });`,
    );
    await writeFile(
      join(temp, "outside.ts"),
      "interface Secret { secret: string }",
    );
    await writeFile(
      join(root, ".hidden.ts"),
      "interface Hidden { secret: string }",
    );
    await symlink(join(temp, "outside.ts"), join(root, "linked.ts"));
    const snapshot = await scanRepository(root);
    assert.equal(snapshot.files, 1);
    assert.deepEqual(
      snapshot.routes.map((r) => [r.method, r.path]),
      [["GET", "/api/customers"]],
    );
    assert.equal(snapshot.entities[0].fields[1].type, "unknown");
    assert.doesNotMatch(
      JSON.stringify(snapshot),
      /do-not-export|private-value|never execute|outside|Hidden/,
    );
    assert.equal((await scanRepository(root)).hash, snapshot.hash);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});


test("scanner identifies schema drift and conservative foreign-key references", async () => {
  const old = await scanRepository(fixture("v1")), next = await scanRepository(fixture("v2"));
  const result = drift(old, next);
  assert.ok(result.changed);
  assert.ok(result.routes.added.some(r => r.path === "/api/accounts"));
  assert.deepEqual(inferRelationships(old), [
    { from: "Order", field: "customerId", to: "Customer", target: "id" },
    { from: "Invoice", field: "orderId", to: "Order", target: "id" },
  ]);
  assert.ok(inferRelationships(next).some(r => r.field === "accountId"));
});

test("graph validator rejects remote paths, unreachable nodes, invented references and foreign exports", async () => {
  const snapshot = await scanRepository(fixture("v1")), { plan } = offlinePlan(snapshot);
  assert.equal(plan.nodes.length, 7);
  assert.throws(() => validatePlan({ ...plan, shell: "execute" }, snapshot));
  const mutate = (fn: (p: typeof plan) => void) => { const copy = structuredClone(plan); fn(copy); assert.throws(() => validatePlan(copy, snapshot)); };
  mutate(p => { p.nodes[1].path = "https://example.com"; });
  mutate(p => { p.nodes[1].path = "/api//double"; });
  mutate(p => { p.nodes[1].path = p.nodes[0].path; });
  mutate(p => { p.nodes[1].entity = "Unknown"; });
  mutate(p => { p.edges = p.edges.filter(e => e.to !== "records-2"); });
  mutate(p => { p.relationships[0].field = "madeUp"; });
  mutate(p => { p.relationships = []; });
  mutate(p => { p.edges.push({ from: "records-0", to: "export-1" }); });
});

test("Meta generator sends metadata and relationships, validates output, and never silently falls back", async () => {
  const snapshot = await scanRepository(fixture("v1")), { plan } = offlinePlan(snapshot);
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.meta.ai/v1/chat/completions");
    assert.equal(init?.redirect, "error");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-only-key");
    const payload = JSON.parse(init?.body as string);
    assert.equal(payload.response_format.type, "json_schema");
    assert.deepEqual(JSON.parse(payload.messages[1].content).relationships, plan.relationships);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
  };
  const result = await generateWithMeta(snapshot, { apiKey: "test-only-key", fetcher });
  assert.equal(result.provider, "meta"); assert.equal(result.usage?.inputTokens, 100);
  await assert.rejects(generateWithMeta(snapshot, { apiKey: "", fetcher }), /missing/);
  await assert.rejects(generateWithMeta(snapshot, { apiKey: "test", fetcher: async () => new Response("", { status: 429 }) }), /HTTP 429/);
  await assert.rejects(generateWithMeta(snapshot, { apiKey: "test", fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"secret":"sensitive-value"}' } }] })) }), error => error instanceof Error && /validation/.test(error.message) && !error.message.includes("sensitive-value"));
});

test("seeded records have consistent foreign keys and schema drift breaks checks before regeneration", async () => {
  const old = await scanRepository(fixture("v1")), next = await scanRepository(fixture("v2"));
  const generation = offlinePlan(old), data = seedDataset(generation.plan, old);
  assert.ok(auditDataset(generation.plan, old, data).every(c => c.passed));
  assert.equal(data.Order[0].customerId, data.Customer[0].id);
  assert.equal(data.Invoice[0].orderId, data.Order[0].id);
  assert.equal(auditDataset(generation.plan, next, data).filter(c => !c.passed).length, 3);
  data.Order[0].customerId = "missing";
  assert.ok(auditDataset(generation.plan, old, data).some(c => !c.passed && c.check.startsWith("reference:")));
});

const post = (base: string, path: string, data: unknown, headers: Record<string, string> = {}) => fetch(base + path, {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(data),
});

test("HTTP graph preserves data across exports, session state, credential rotation and telemetry redaction", async t => {
  const app = await startWorkspace({ adminPort: 0, decoyPort: 0 }); t.after(() => app.close());
  const nodes = app.runtime.generation.plan.nodes;
  const collection = nodes.find(n => n.kind === "collection")!, exp = nodes.find(n => n.kind === "export" && n.entity === collection.entity)!;
  assert.equal((await fetch(app.decoyURL + "/api/state")).status, 404);
  assert.equal((await fetch(app.decoyURL + collection.path)).status, 401);
  const entry = await (await fetch(app.decoyURL + app.runtime.entryPath)).json() as { integration: { token: string } };
  const headers = { Authorization: `Bearer ${entry.integration.token}` };
  const get = async (path: string) => (await (await fetch(app.decoyURL + path, { headers })).json()) as any;
  const before = await get(collection.path), exported = await get(exp.path), after = await get(collection.path);
  assert.deepEqual(before.records, exported.records); assert.equal(after.exportStatus, "downloaded");
  assert.equal((await fetch(app.decoyURL + exp.path, { method: "POST", headers })).status, 405);
  const publicState = await (await fetch(app.adminURL + "/api/state")).text();
  assert.ok(!publicState.includes(entry.integration.token)); assert.doesNotMatch(publicState, /Authorization/);
  assert.equal(new Set(app.runtime.events.filter(e => e.session).map(e => e.session)).size, 1);
  await post(app.adminURL, "/api/generate", { provider: "offline" });
  assert.equal((await fetch(app.decoyURL + collection.path, { headers })).status, 401);
});

test("independent explorer discovers every fixture node using only the entry and observed links", async t => {
  const app = await startWorkspace({ adminPort: 0, decoyPort: 0 }); t.after(() => app.close());
  const report = await explore({ entryURL: app.decoyURL + app.runtime.entryPath, provider: "offline", marker: () => app.runtime.createDemoMarker() });
  assert.equal(report.metrics.requests, 7); assert.equal(report.metrics.entities, 3);
  assert.equal(report.metrics.exports, 3); assert.equal(report.metrics.maxDepth, 2);
  assert.equal(report.metrics.consistencyChecks, 5); assert.equal(report.metrics.consistencyFailures, 0);
  assert.equal(report.stopReason, "frontier-exhausted");
  assert.ok(app.runtime.events.every(e => e.demo && e.status === 200));
  assert.doesNotMatch(JSON.stringify(report), /hw_decoy_|Authorization/);
});

test("Meta explorer receives only redacted observations and chooses unseen links", async t => {
  const app = await startWorkspace({ adminPort: 0, decoyPort: 0 }); t.after(() => app.close());
  let calls = 0;
  const report = await explore({ entryURL: app.decoyURL + app.runtime.entryPath, provider: "meta", meta: { apiKey: "test", fetcher: async (_, init) => {
    calls++;
    const payload = JSON.parse(init?.body as string), view = JSON.parse(payload.messages[1].content);
    assert.deepEqual(Object.keys(view).sort(), ["candidates", "observations", "remainingRequests"]);
    assert.doesNotMatch(JSON.stringify(view), /hw_decoy_|snapshotHash|rationale/);
    const candidate = view.candidates.at(-1);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ path: candidate.path, reason: "Inspect a response link.", done: false }) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  } } });
  assert.equal(calls, 6); assert.equal(report.metrics.inputTokens, 60); assert.equal(report.metrics.requests, 7);
});

test("explorer enforces budget, observed paths, literal loopback origin and no redirects", async t => {
  const app = await startWorkspace({ adminPort: 0, decoyPort: 0 }); t.after(() => app.close());
  const entryURL = app.decoyURL + app.runtime.entryPath;
  assert.equal((await explore({ entryURL, provider: "offline", budget: 2 })).stopReason, "budget");
  await assert.rejects(explore({ entryURL: "https://example.com/start", provider: "offline" }), /127.0.0.1/);
  await assert.rejects(explore({ entryURL, provider: "offline", decide: async () => ({ path: "/api/state", reason: "Invented path", done: false }) }), /absent from observed links/);
  const redirect = createServer((_, res) => { res.writeHead(302, { Location: app.adminURL + "/api/state" }); res.end(); });
  await new Promise<void>(resolve => redirect.listen(0, "127.0.0.1", resolve)); t.after(() => redirect.close());
  const address = redirect.address() as { port: number };
  await assert.rejects(explore({ entryURL: `http://127.0.0.1:${address.port}/start`, provider: "offline" }));
});

test("regeneration reports failing-before/passing-after checks and keeps prior deployment on failure", async t => {
  const app = await startWorkspace({ adminPort: 0, decoyPort: 0 }); t.after(() => app.close());
  const initial = app.runtime.deploymentId;
  const scan = await (await post(app.adminURL, "/api/scan", { fixture: "v2" })).json() as any;
  assert.ok(scan.drift.changed); assert.equal(scan.checks.filter((c: any) => !c.passed).length, 3);
  assert.ok(scan.affected.nodes.length >= 6);
  const invalid = structuredClone(app.runtime.generation); invalid.plan.relationships = [];
  const old = await scanRepository(fixture("v1"));
  assert.throws(() => app.runtime.deploy(invalid, old)); assert.equal(app.runtime.deploymentId, initial);
  const deployed = await (await post(app.adminURL, "/api/generate", { provider: "offline" })).json() as any;
  assert.equal(deployed.drift.changed, false); assert.ok(deployed.checks.every((c: any) => c.passed));
  assert.equal(deployed.regeneration.before.filter((c: any) => !c.passed).length, 3);
  assert.ok(deployed.regeneration.after.every((c: any) => c.passed));
  const explored = await (await post(app.adminURL, "/api/explore", { provider: "offline" })).json() as any;
  assert.equal(explored.explorer.metrics.consistencyFailures, 0);
});

test("workspace requires same origin and a startup-authorized source root", async t => {
  const temp = await mkdtemp(join(tmpdir(), "honeyweb-custom-")); t.after(() => rm(temp, { recursive: true, force: true }));
  await writeFile(join(temp, "app.ts"), "interface Ticket { id: number; title: string }");
  const app = await startWorkspace({ adminPort: 0, decoyPort: 0, sourceDirectory: temp }); t.after(() => app.close());
  assert.equal(app.runtime.generation.plan.nodes.find(n => n.kind === "collection")!.entity, "Ticket");
  assert.equal((await post(app.adminURL, "/api/explore", { provider: "offline" }, { Origin: "https://example.com" })).status, 403);
  const wrongHost = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(app.adminURL + "/api/state", { headers: { Host: "attacker.invalid" } }, res => { res.resume(); resolve(res.statusCode); }); req.on("error", reject); req.end();
  });
  assert.equal(wrongHost, 403);
  assert.equal((await post(app.adminURL, "/api/scan", { fixture: "../../etc" })).status, 400);
  await writeFile(join(temp, "app.ts"), "interface Ticket { id: number; title: string; priority: number }");
  const scan = await (await post(app.adminURL, "/api/scan", { fixture: "custom" })).json() as any;
  assert.ok(scan.drift.changed);
  assert.equal((await post(app.adminURL, "/api/generate", { provider: "offline" })).status, 200);
  const result = await (await post(app.adminURL, "/api/explore", { provider: "offline" })).json() as any;
  assert.equal(result.explorer.metrics.requests, 3);
});
