import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mountedRoutes } from "../src/routes.ts";
import { extractPrisma } from "../src/prisma.ts";
import { auditHTTP, permittedPath } from "../src/http-auditor.ts";
import {
  archiveGeneration,
  labGateway,
  scoreTrial,
  spawnDecoy,
} from "../src/lab.ts";
import { scanRepository } from "../src/scanner.ts";
import { offlinePlan } from "../src/plan.ts";

test("HTTP auditor records bounded response failures without losing the trial", async (t) => {
  const server = createServer((_, res) => res.end("x".repeat(65000)));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const report = await auditHTTP({
    startURL: `http://127.0.0.1:${
      (server.address() as { port: number }).port
    }/`,
    provider: "offline",
  });
  assert.equal(report.stopReason, "response-too-large-or-read-error");
  assert.equal(report.metrics.requests, 1);
  assert.equal(report.observations.length, 0);
});

test("mounted routes follow imported chained routers at each literal prefix", () => {
  const result = mountedRoutes(
    new Map([
      [
        "main.ts",
        `import express from 'express'; import routes from './routes'; const app=express(); app.use('/v1',routes); app.use('/v2',routes); app.get('/',()=>{});`,
      ],
      [
        "routes.ts",
        `import {Router} from 'express'; import articles from './article'; const api=Router().use(articles); export default Router().use('/api',api);`,
      ],
      [
        "article.ts",
        `import {Router as makeRouter} from 'express'; const router=makeRouter(); router.get('/articles/:slug',()=>{}); export default router;`,
      ],
    ])
  );
  assert.deepEqual(result.routes.map((r) => r.path).sort(), [
    "/",
    "/v1/api/articles/:slug",
    "/v2/api/articles/:slug",
  ]);
  assert.deepEqual(result.warnings, []);
});

test("dynamic prefixes are omitted and mount cycles terminate with warnings", () => {
  const dynamic = mountedRoutes(
    new Map([
      [
        "app.ts",
        `import express from 'express'; const app=express(); const router=express.Router(); router.get('/secret',()=>{}); const prefix=process.env.PREFIX; app.use(prefix,router);`,
      ],
    ])
  );
  assert.deepEqual(dynamic.routes, []);
  assert.ok(dynamic.warnings.some((w) => w.includes("Unresolved")));
  const cycle = mountedRoutes(
    new Map([
      [
        "app.ts",
        `import express from 'express'; const app=express(); const router=express.Router(); router.get('/ok',()=>{}); router.use('/cycle',router); app.use('/api',router);`,
      ],
    ])
  );
  assert.deepEqual(
    cycle.routes.map((r) => r.path),
    ["/api/ok"]
  );
  assert.ok(cycle.warnings.some((w) => w.includes("Cyclic")));
});

test("Prisma extraction preserves explicit author references and never exports defaults", () => {
  const result = extractPrisma(
    `model Article {
    id Int @id
    authorId Int
    title String @default("private literal https://example.invalid/a")
    author User @relation("UserArticles", fields: [authorId], references: [id])
  }
  model User {
    id Int @id
    email String
    articles Article[]
  }`,
    "schema.prisma"
  );
  assert.deepEqual(result.relationships, [
    { from: "Article", field: "authorId", to: "User", target: "id" },
  ]);
  assert.deepEqual(
    result.entities[0].fields.map((f) => f.name),
    ["id", "authorId", "title"]
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /private literal|https:|UserArticles/
  );
  assert.match(result.warnings[0], /1 inverse/);
});

test("HTTP auditor receives raw HTML and response history without hidden navigation hints", async (t) => {
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(req.url === "/" ? '<a href="/docs">Docs</a>' : "Documentation");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const report = await auditHTTP({
    startURL: `http://127.0.0.1:${
      (server.address() as { port: number }).port
    }/`,
    provider: "meta",
    budget: 2,
    meta: {
      apiKey: "test",
      fetcher: async (_, init) => {
        const messages = JSON.parse(init!.body as string).messages,
          view = JSON.parse(messages[1].content);
        assert.deepEqual(Object.keys(view).sort(), [
          "observations",
          "previousAuthorization",
          "remainingRequests",
          "visitedRequests",
        ]);
        assert.equal(view.observations[0].body, '<a href="/docs">Docs</a>');
        assert.doesNotMatch(
          JSON.stringify(view),
          /candidates|snapshotHash|relationships/
        );
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    path: "/docs",
                    authorization: "",
                    reason: "Read the linked documentation.",
                    stop: false,
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          })
        );
      },
    },
  });
  assert.equal(report.metrics.requests, 2);
  assert.equal(report.metrics.modelCalls, 1);
});

test("HTTP auditor blocks external paths, unobserved credentials and redirects", async (t) => {
  let externalHits = 0;
  const external = createServer((_, res) => {
    externalHits++;
    res.end("external");
  });
  await new Promise<void>((resolve) =>
    external.listen(0, "127.0.0.1", resolve)
  );
  t.after(() => external.close());
  const server = createServer((req, res) => {
    if (req.url === "/redirect")
      res.writeHead(302, {
        Location: `http://127.0.0.1:${
          (external.address() as { port: number }).port
        }`,
      });
    res.end("home");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const startURL = `http://127.0.0.1:${
    (server.address() as { port: number }).port
  }/`;
  for (const path of [
    "//example.com",
    "http://example.com",
    "/../x",
    "/%2fexample.com",
    "/a\\b",
  ])
    assert.equal(permittedPath(path), false);
  for (const [path, authorization, expected] of [
    ["//example.com", "", "blocked-path"],
    ["/docs", "Bearer fabricated_credential", "blocked-unobserved-credential"],
    ["/redirect", "", "network-or-redirect-error"],
  ]) {
    const result = await auditHTTP({
      startURL,
      provider: "offline",
      decide: async () => ({
        path,
        authorization,
        reason: "Boundary test",
        stop: false,
      }),
    });
    assert.equal(result.stopReason, expected);
  }
  assert.equal(externalHits, 0);
});

test("separate decoy process is discoverable through HTML and gateway strips credentials to upstream", async (t) => {
  const snapshot = await scanRepository("./fixtures/acme-v1"),
    generation = archiveGeneration(offlinePlan(snapshot), snapshot);
  const worker = await spawnDecoy(generation, snapshot);
  t.after(() => worker.close());
  let forwarded: string | undefined;
  const upstream = createServer((req, res) => {
    forwarded = req.headers.authorization;
    res.setHeader("Content-Type", "application/json");
    res.end("{}");
  });
  await new Promise<void>((resolve) =>
    upstream.listen(0, "127.0.0.1", resolve)
  );
  t.after(() => upstream.close());
  const gateway = await labGateway(
    worker.url,
    worker.entryPath,
    `http://127.0.0.1:${(upstream.address() as { port: number }).port}`
  );
  t.after(() => gateway.close());
  const result = await auditHTTP({
    startURL: gateway.url,
    provider: "offline",
  });
  assert.equal(scoreTrial(result, generation).decoyEndpointsVisited, 7);
  assert.equal(scoreTrial(result, generation).observedChecks, 5);
  assert.doesNotMatch(JSON.stringify(result), /hw_decoy_[a-f0-9]/);
  await fetch(gateway.url + "api/articles", {
    headers: { Authorization: "Bearer do_not_forward" },
  });
  assert.equal(forwarded, undefined);
  const status = await new Promise((resolve) => {
    const req = request(
      gateway.url,
      { path: "http://example.invalid/archive/x" },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      }
    );
    req.on("error", () => resolve(-1));
    req.end();
  });
  assert.equal(status, 400);
});
