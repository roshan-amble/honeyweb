import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "node:http";
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

test("drift identifies renamed routes and changed interfaces", async () => {
  const old = await scanRepository(fixture("v1"));
  const next = await scanRepository(fixture("v2"));
  const result = drift(old, next);
  assert.equal(result.changed, true);
  assert.equal(result.routes.added[0].path, "/api/accounts");
  assert.equal(result.routes.removed[0].path, "/api/customers");
  assert.ok(
    result.entities.added.some(
      (e) => e.name === "Account" && e.fields.some((f) => f.name === "region"),
    ),
  );
  assert.equal(drift(old, old).changed, false);
});

test("plan validation rejects external URLs, execution directives, broken graphs, and unknown entities", async () => {
  const snapshot = await scanRepository(fixture("v1"));
  const { plan } = offlinePlan(snapshot);
  assert.throws(() => validatePlan({ ...plan, entity: "Unknown" }, snapshot));
  assert.throws(() =>
    validatePlan({ ...plan, shell: "echo unsafe" }, snapshot),
  );
  assert.throws(() =>
    validatePlan(
      {
        ...plan,
        nodes: plan.nodes.map((n) => ({ ...n, path: "https://example.com" })),
      },
      snapshot,
    ),
  );
  assert.throws(() =>
    validatePlan(
      { ...plan, nodes: plan.nodes.map((n) => ({ ...n, path: "/same" })) },
      snapshot,
    ),
  );
  assert.throws(() =>
    validatePlan(
      {
        ...plan,
        edges: [
          { from: "entry", to: "export" },
          { from: "entry", to: "export" },
        ],
      },
      snapshot,
    ),
  );
});

test("Meta adapter uses documented structured-output contract and has no silent fallback", async () => {
  const snapshot = await scanRepository(fixture("v1"));
  const { plan } = offlinePlan(snapshot);
  let called = false;
  const fetcher: typeof fetch = async (url, init) => {
    called = true;
    assert.equal(url, "https://api.meta.ai/v1/chat/completions");
    assert.equal(init?.redirect, "error");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer test-only-key",
    );
    const payload = JSON.parse(init?.body as string);
    assert.equal(payload.model, "muse-spark-1.3");
    assert.equal(payload.response_format.type, "json_schema");
    assert.deepEqual(
      JSON.parse(payload.messages[1].content).routes,
      snapshot.routes,
    );
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(plan) } }],
      }),
    );
  };
  const result = await generateWithMeta(snapshot, {
    apiKey: "test-only-key",
    model: "muse-spark-1.3",
    fetcher,
  });
  assert.ok(called);
  assert.equal(result.provider, "meta");
  await assert.rejects(
    generateWithMeta(snapshot, { apiKey: "", fetcher }),
    /missing/,
  );
  await assert.rejects(
    generateWithMeta(snapshot, {
      apiKey: "test",
      fetcher: async () => new Response("", { status: 429 }),
    }),
    /HTTP 429/,
  );
  await assert.rejects(
    generateWithMeta(snapshot, {
      apiKey: "test",
      fetcher: async () => new Response(JSON.stringify({ choices: [] })),
    }),
    /no structured plan/,
  );
});

test("real HTTP traversal is stateful, token-gated, redacted, and separated from admin routes", async (t) => {
  const app = await startWorkspace({ adminPort: 0, decoyPort: 0 });
  t.after(() => app.close());
  const nodes = app.runtime.generation.plan.nodes;
  const path = (id: string) => nodes.find((n) => n.id === id)!.path;
  assert.equal((await fetch(app.decoyURL + "/api/state")).status, 404);
  assert.equal((await fetch(app.decoyURL + path("records"))).status, 401);
  const entry = (await (await fetch(app.decoyURL + path("entry"))).json()) as {
    integration: { token: string };
  };
  const headers = { Authorization: `Bearer ${entry.integration.token}` };
  const collection = (await (
    await fetch(app.decoyURL + path("records"), { headers })
  ).json()) as { records: unknown[]; export: { status: string } };
  assert.equal(collection.export.status, "ready");
  const exported = (await (
    await fetch(app.decoyURL + path("export"), { headers })
  ).json()) as { records: unknown[] };
  assert.deepEqual(exported.records, collection.records);
  const after = (await (
    await fetch(app.decoyURL + path("records"), { headers })
  ).json()) as { export: { status: string } };
  assert.equal(after.export.status, "downloaded");
  assert.equal(
    (await fetch(app.decoyURL + path("export"), { method: "POST", headers }))
      .status,
    405,
  );
  const state = await (await fetch(app.adminURL + "/api/state")).text();
  assert.ok(!state.includes(entry.integration.token));
  assert.doesNotMatch(state, /Authorization/);
  const correlated = app.runtime.events.filter((e) => e.session);
  assert.equal(new Set(correlated.map((e) => e.session)).size, 1);
  assert.ok(correlated.every((e) => !e.demo));
});

test("workspace demo, drift, redeploy, and cross-origin protections work end to end", async (t) => {
  const app = await startWorkspace({ adminPort: 0, decoyPort: 0 });
  t.after(() => app.close());
  const post = (
    path: string,
    data: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(app.adminURL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(data),
    });
  assert.equal(
    (await post("/api/traverse", {}, { Origin: "https://example.com" })).status,
    403,
  );
  const wrongHostStatus = await new Promise<number | undefined>(
    (resolve, reject) => {
      const req = request(
        app.adminURL + "/api/state",
        { headers: { Host: "attacker.invalid" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    },
  );
  assert.equal(wrongHostStatus, 403);
  assert.equal(
    (await fetch(app.adminURL + "/api/traverse", { method: "POST" })).status,
    400,
  );
  assert.equal((await post("/api/traverse", {})).status, 200);
  assert.equal(app.runtime.events.length, 3);
  assert.ok(app.runtime.events.every((e) => e.demo && e.status === 200));
  assert.equal(new Set(app.runtime.events.map((e) => e.session)).size, 1);
  const entryPath = app.runtime.generation.plan.nodes.find(
    (n) => n.id === "entry",
  )!.path;
  const entry = (await (await fetch(app.decoyURL + entryPath)).json()) as {
    integration: { token: string };
  };
  const scan = (await (await post("/api/scan", { fixture: "v2" })).json()) as {
    drift: { changed: boolean };
  };
  assert.ok(scan.drift.changed);
  const deploy = (await (
    await post("/api/generate", { provider: "offline" })
  ).json()) as {
    drift: { changed: boolean };
    generation: { plan: { entity: string } };
  };
  assert.equal(deploy.drift.changed, false);
  assert.equal(deploy.generation.plan.entity, "Account");
  const recordsPath = app.runtime.generation.plan.nodes.find(
    (n) => n.id === "records",
  )!.path;
  assert.equal(
    (
      await fetch(app.decoyURL + recordsPath, {
        headers: { Authorization: `Bearer ${entry.integration.token}` },
      })
    ).status,
    401,
  );
  assert.equal((await post("/api/scan", { fixture: "../../etc" })).status, 400);
});
