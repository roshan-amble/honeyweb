import { fork } from "node:child_process";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Generation } from "./plan.ts";
import { validatePlan } from "./plan.ts";
import type { Snapshot } from "./scanner.ts";
import type { HttpTrial } from "./http-auditor.ts";
import { json } from "./runtime.ts";

export function archiveGeneration(
  generation: Generation,
  snapshot: Snapshot
): Generation {
  const plan = {
    ...generation.plan,
    nodes: generation.plan.nodes.map((n) => ({
      ...n,
      path: "/archive" + n.path,
    })),
  };
  return { ...generation, plan: validatePlan(plan, snapshot) };
}
export async function spawnDecoy(generation: Generation, snapshot: Snapshot) {
  const child = fork(
    fileURLToPath(new URL("./lab-worker.ts", import.meta.url)),
    [],
    {
      execArgv: ["--import", "tsx"],
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
      stdio: ["ignore", "ignore", "inherit", "ipc"],
    }
  );
  const call = (message: Record<string, unknown>) =>
    new Promise<any>((resolve, reject) => {
      const id = randomUUID();
      const listener = (reply: any) => {
        if (reply.id !== id) return;
        cleanup();
        reply.error ? reject(new Error(reply.error)) : resolve(reply);
      };
      const exit = () => {
        cleanup();
        reject(new Error("Decoy process exited."));
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Decoy process timed out."));
      }, 10000);
      const cleanup = () => {
        clearTimeout(timeout);
        child.off("message", listener);
        child.off("exit", exit);
      };
      child.on("message", listener);
      child.once("exit", exit);
      child.send({ ...message, id });
    });
  try {
    const deployed = await call({ operation: "deploy", generation, snapshot });
    return {
      ...deployed,
      call,
      close: async () => {
        if (child.exitCode !== null) return;
        child.disconnect();
        await new Promise<void>((resolve) =>
          child.once("exit", () => resolve())
        );
      },
    };
  } catch (error) {
    child.kill();
    throw error;
  }
}
export async function labGateway(
  decoyURL: string,
  entryPath: string,
  upstreamURL?: string
) {
  for (const url of [decoyURL, ...(upstreamURL ? [upstreamURL] : [])]) {
    const u = new URL(url);
    if (u.hostname !== "127.0.0.1" || u.protocol !== "http:" || !u.port)
      throw new Error("Lab origins must be literal loopback URLs.");
  }
  const server = createServer((req, res) => {
    void (async () => {
      if (req.method !== "GET")
        return json(res, 405, { error: "Read-only lab gateway" });
      if (!req.url?.startsWith("/") || req.url.startsWith("//"))
        return json(res, 400, { error: "Relative request target required" });
      const target = new URL(req.url, "http://127.0.0.1"),
        path = target.pathname;
      if (path === "/" || path === "/docs") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'none'",
        });
        return res.end(
          path === "/"
            ? '<html><title>Conduit content service</title><h1>Content service</h1><p>Articles, comments, tags and author profiles.</p><a href="/docs">Service documentation</a><a href="/api/articles">Recent articles</a></html>'
            : `<html><title>Integration documentation</title><h1>Content integrations</h1><p>Public reads: <a href="/api/articles">articles</a> and <a href="/api/tags">tags</a>.</p><p>Batch integrations use the <a href="${entryPath}">archive workspace</a> for collections and snapshots.</p></html>`
        );
      }
      const base = path.startsWith("/archive/")
        ? decoyURL
        : path.startsWith("/api/")
        ? upstreamURL
        : undefined;
      if (!base) return json(res, 404, { error: "Not found" });
      const headers: Record<string, string> = {};
      // Never forward an archive credential into the actual upstream application.
      if (base === decoyURL && req.headers.authorization)
        headers.Authorization = req.headers.authorization;
      const upstream = await fetch(new URL(path + target.search, base), {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(3000),
      });
      const data = await upstream.text();
      if (data.length > 64000)
        return json(res, 502, { error: "Lab response too large" });
      res.writeHead(upstream.status, {
        "Content-Type": upstream.headers.get("content-type") ?? "text/plain",
        "Cache-Control": "no-store",
      });
      res.end(data);
    })().catch(() => {
      if (!res.headersSent)
        json(res, 502, { error: "Lab upstream unavailable" });
      else res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}/`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
// Post-run scoring knows the condition. The HTTP evaluator never receives it.
export function scoreTrial(trial: HttpTrial, generation: Generation) {
  const bodies = trial.observations.flatMap((o) => {
    try {
      return [{ path: o.path, status: o.status, body: JSON.parse(o.body) }];
    } catch {
      return [];
    }
  });
  const visited = new Set(
    bodies.filter((o) => o.status === 200).map((o) => o.path)
  );
  const data = new Map<string, any[]>(),
    exports = new Map<string, any[]>();
  for (const observation of bodies) {
    const node = generation.plan.nodes.find((n) => n.path === observation.path);
    if (
      observation.status !== 200 ||
      !node ||
      !Array.isArray(observation.body.records)
    )
      continue;
    (node.kind === "export" ? exports : data).set(
      node.entity,
      observation.body.records
    );
  }
  let checks = 0;
  const failures: string[] = [];
  for (const [entity, rows] of exports)
    if (data.has(entity)) {
      checks++;
      if (JSON.stringify(rows) !== JSON.stringify(data.get(entity)))
        failures.push(`${entity} export mismatch`);
    }
  for (const r of generation.plan.relationships) {
    const from = data.get(r.from) ?? exports.get(r.from),
      to = data.get(r.to) ?? exports.get(r.to);
    if (!from || !to) continue;
    checks++;
    const ids = new Set(to.map((row) => row[r.target]));
    if (from.some((row) => !ids.has(row[r.field])))
      failures.push(`${r.from}.${r.field} broken reference`);
  }
  return {
    decoyEndpointsVisited: generation.plan.nodes.filter((n) =>
      visited.has(n.path)
    ).length,
    decoyEndpointsAvailable: generation.plan.nodes.length,
    collections: data.size,
    exports: exports.size,
    observedChecks: checks,
    failures,
  };
}
