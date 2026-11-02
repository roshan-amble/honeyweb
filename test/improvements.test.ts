import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import { readFile } from "node:fs/promises";
import { DecoyRuntime } from "../src/runtime.ts";
import { validatePlan, type Generation } from "../src/plan.ts";
import { blindLab, scoreBlind } from "../src/blind-lab.ts";
import { blindAgent } from "../src/blind-agent.ts";
import { metaJSON, MetaFailure } from "../src/meta.ts";
import { EditorialDecoys } from "../src/workflow-decoys.ts";
import { scanRepository } from "../src/scanner.ts";
import { offlinePlan } from "../src/plan.ts";
import { applicationDataset } from "../src/presentation.ts";
import { auditDataset } from "../src/data.ts";

test("neutral string identifiers preserve every source-derived reference", async () => {
  const source = await scanRepository("fixtures/acme-v1"),
    plan = offlinePlan(source).plan,
    data = applicationDataset(plan, source);
  assert.doesNotMatch(JSON.stringify(data), /syn_/);
  assert.match(String(data.Customer[0].id), /^rec_[a-f0-9]{20}$/);
  assert.equal(data.Order[0].customerId, data.Customer[0].id);
  assert.ok(auditDataset(plan, source, data).every((c) => c.passed));
});

const frozen = JSON.parse(
    await readFile("docs/case-studies/realworld-evaluation.json", "utf8")
  ),
  snapshot = frozen.scanner.before;
const generation: Generation = {
  ...frozen.generations.before,
  generatedAt: frozen.createdAt,
  plan: validatePlan(frozen.generations.before.plan, snapshot),
};
async function server(t: TestContext, handler: RequestListener) {
  const s = createServer(handler);
  await new Promise<void>((done) => s.listen(0, "127.0.0.1", done));
  t.after(() => {
    s.closeAllConnections();
    s.close();
  });
  return `http://127.0.0.1:${(s.address() as { port: number }).port}/`;
}
async function setup(t: TestContext, containment: boolean) {
  let upstreamCalls = 0;
  const upstreamURL = await server(t, (_req, res) => {
    upstreamCalls++;
    res.end('{"articles":[]}');
  });
  const lab = await blindLab({
    scenario: "account-role",
    task: "attack",
    variant: 3,
    upstreamURL,
    applicationWorkflows: true,
    containment,
  });
  t.after(() => lab.close());
  const request = (
    method: string,
    path: string,
    body?: unknown,
    authorization = lab.authorization
  ) =>
    fetch(new URL(path, lab.url), {
      method,
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  return { lab, request, upstreamCalls: () => upstreamCalls };
}

test("application presentation removes operator labels, uses opaque service keys and omits credential fields", async (t) => {
  const runtime = new DecoyRuntime(generation, snapshot),
    url = await server(t, runtime.handle);
  const entry = (await (
    await fetch(new URL(runtime.entryPath, url))
  ).json()) as any;
  assert.doesNotMatch(
    JSON.stringify(entry),
    /synthetic|decoy|honeyweb|honeypot|breadcrumb/i
  );
  assert.match(entry.integration.token, /^svc_[a-f0-9]{48}$/);
  const headers = { Authorization: `Bearer ${entry.integration.token}` };
  const article = generation.plan.nodes.find(
      (n) => n.kind === "collection" && n.entity === "Article"
    )!,
    users = generation.plan.nodes.find(
      (n) => n.kind === "collection" && n.entity === "User"
    )!;
  const articles = (await (
    await fetch(new URL(article.path, url), { headers })
  ).json()) as any;
  assert.equal(articles.records[0].title, "Editorial review schedule");
  assert.ok(articles.records[0].body.length > 80);
  const people = (await (
    await fetch(new URL(users.path, url), { headers })
  ).json()) as any;
  assert.equal(people.records[0].username, "maya.chen");
  assert.ok(!("password" in people.records[0]));
  assert.ok(runtime.audit(snapshot).every((c) => c.passed));
  assert.ok(!JSON.stringify(runtime.events).includes(entry.integration.token));
  const legacy = new DecoyRuntime(generation, snapshot, "legacy"),
    legacyURL = await server(t, legacy.handle);
  const old = (await (
    await fetch(new URL(legacy.entryPath, legacyURL))
  ).json()) as any;
  assert.equal(old.service, generation.plan.title);
  assert.equal(old.kind, "breadcrumb");
  assert.match(old.integration.token, /^hw_decoy_/);
});

test("fictional profile, revision and export state stays coherent and isolated across instances", () => {
  const a = new EditorialDecoys(3101),
    b = new EditorialDecoys(3101);
  assert.equal(
    a.handle("GET", "/api/admin/exports/users", {}, true).status,
    403
  );
  assert.equal(
    a.handle(
      "POST",
      "/api/editor/workspace/profile",
      { role: "admin", bio: "Reviewer" },
      true
    ).changed,
    true
  );
  const profile = a.handle("GET", "/api/editor/workspace/profile", {}, true)
    .body as any;
  assert.equal(profile.role, "admin");
  assert.equal(profile.bio, "Reviewer");
  const exportResult = a.handle(
    "POST",
    "/api/editor/workspace/exports",
    { resource: "users" },
    true
  );
  assert.equal(exportResult.status, 202);
  const job = exportResult.body as any,
    download = a.handle("GET", job.href, {}, true);
  assert.equal(download.status, 200);
  assert.equal(download.protectedRead, true);
  assert.deepEqual(
    (download.body as any).records,
    (a.handle("GET", "/api/admin/exports/users", {}, true).body as any).records
  );
  const draft = a.handle("GET", a.draftPath, {}, true).body as any;
  assert.equal(
    (
      a.handle("GET", `/api/editor/revisions/${a.draftId}`, {}, true)
        .body as any
    ).articleId,
    draft.id
  );
  assert.equal(b.handle("GET", job.href, {}, true).status, 404);
  assert.equal(
    b.handle("GET", "/api/admin/exports/users", {}, true).status,
    403
  );
  assert.equal(a.handle("GET", a.draftPath, {}, false).status, 401);
  for (let i = 0; i < 19; i++)
    assert.equal(
      a.handle(
        "POST",
        "/api/editor/workspace/exports",
        { resource: "users" },
        true
      ).status,
      202
    );
  assert.equal(
    a.handle(
      "POST",
      "/api/editor/workspace/exports",
      { resource: "users" },
      true
    ).status,
    429
  );
});

test("confirmed canary reads quarantine only their session and never forward later requests to a real backend", async (t) => {
  const a = await setup(t, true),
    b = await setup(t, true);
  const entry = (await (
    await a.request("GET", "/api/editor/workspace")
  ).json()) as any;
  assert.equal(scoreBlind(a.lab.events).honeywebDetected, false);
  const draftPath = entry.links.find(
    (l: any) => l.label === "Unpublished review copy"
  ).href;
  await a.request("GET", draftPath);
  assert.equal(scoreBlind(a.lab.events).containmentActivated, true);
  await a.request("POST", "/api/profile", { role: "admin" });
  for (const auth of [
    a.lab.authorization,
    "",
    `Bearer ${entry.integration.token}`,
  ]) {
    const response = (await (
      await a.request("GET", "/api/admin/users", undefined, auth)
    ).json()) as any;
    assert.equal(response.proof, undefined);
    assert.equal(response.records[0].id, 71);
  }
  await a.request("GET", "/api/articles");
  assert.equal(a.upstreamCalls(), 0);
  assert.equal(scoreBlind(a.lab.events).attackSucceeded, false);
  assert.equal(scoreBlind(a.lab.events).realReadsAfterContainment, 0);
  assert.ok(a.lab.events.slice(2).every((e) => e.servedBy === "shadow"));
  await b.request("POST", "/api/profile", { role: "admin" });
  await b.request("GET", "/api/admin/users");
  assert.equal(scoreBlind(b.lab.events).attackSucceeded, true);
  assert.equal(scoreBlind(b.lab.events).containmentActivated, false);
});

test("passive workflow arm retains the same real vulnerability after a catch", async (t) => {
  const a = await setup(t, false);
  const entry = (await (
    await a.request("GET", "/api/editor/workspace")
  ).json()) as any;
  await a.request("GET", entry.links[0].href);
  await a.request("POST", "/api/profile", { role: "admin" });
  await a.request("GET", "/api/admin/users");
  const score = scoreBlind(a.lab.events);
  assert.equal(score.honeywebEarly, true);
  assert.equal(score.attackSucceeded, true);
  assert.equal(score.containmentActivated, false);
});

test("credential reuse on a real route triggers containment before dispatch, while guesses and index reads do not", async (t) => {
  const a = await setup(t, true);
  await a.request(
    "GET",
    "/api/editor/workspace",
    undefined,
    "Bearer guessed_credential"
  );
  assert.equal(scoreBlind(a.lab.events).honeywebDetected, false);
  const entry = (await (
    await a.request("GET", "/api/editor/workspace")
  ).json()) as any;
  assert.equal(scoreBlind(a.lab.events).honeywebDetected, false);
  await a.request(
    "GET",
    "/api/admin/users",
    undefined,
    `Bearer ${entry.integration.token}`
  );
  assert.equal(a.lab.events.at(-1)?.servedBy, "shadow");
  assert.equal(a.lab.events.at(-1)?.containmentActivated, true);
  assert.equal(scoreBlind(a.lab.events).attackSucceeded, false);
});

test("ordinary own-draft and profile tasks, including inspecting the workspace index, produce no canary alert", async (t) => {
  const a = await setup(t, true);
  const me = (await (await a.request("GET", "/api/me")).json()) as any;
  await a.request("GET", `/api/editor/articles/${me.draftIds[0]}`);
  await a.request("GET", "/api/editor/workspace");
  await a.request("POST", "/api/profile", { bio: "Review complete" });
  await a.request("GET", "/api/me");
  assert.equal(scoreBlind(a.lab.events).combinedDetected, false);
  assert.equal(scoreBlind(a.lab.events).containmentActivated, false);
});

test("provider timeout and network failures are distinguishable without retaining response text or secrets", async (t) => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++;
    return await new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener(
        "abort",
        () => reject(init!.signal!.reason),
        { once: true }
      );
    });
  };
  // A real server keeps the event loop live while the provider mock waits for its abort signal.
  const url = await server(t, (_req, res) => res.end("home"));
  await assert.rejects(
    metaJSON(
      "test",
      {},
      "test",
      {},
      { apiKey: "private-test-secret", timeoutMs: 20, fetcher }
    ),
    (e) => e instanceof MetaFailure && e.code === "timeout" && e.elapsedMs >= 15
  );
  const result = await blindAgent({
    url,
    authorization: "Bearer usr_" + "a".repeat(48),
    goal: "Test",
    budget: 2,
    proofMatches: () => false,
    meta: { apiKey: "private-test-secret", timeoutMs: 20, fetcher },
  });
  assert.equal(result.failure.code, "timeout");
  assert.equal(result.failure.stage, "model");
  assert.equal(result.metrics.modelCalls, 1);
  assert.equal(calls, 2);
  assert.doesNotMatch(
    JSON.stringify(result),
    /private-test-secret|usr_[a-f0-9]{48}/
  );
  await assert.rejects(
    metaJSON(
      "test",
      {},
      "test",
      {},
      {
        apiKey: "private-test-secret",
        fetcher: async () => {
          throw new Error("private-test-secret");
        },
      }
    ),
    (e) =>
      e instanceof MetaFailure &&
      e.code === "network" &&
      !e.message.includes("private-test-secret")
  );
});
