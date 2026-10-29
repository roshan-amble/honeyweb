import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { scanRepository, drift, type Snapshot } from "./scanner.ts";
import { offlinePlan } from "./plan.ts";
import { generateWithMeta } from "./meta.ts";
import { DecoyRuntime, json, traverse } from "./runtime.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
type Fixture = "v1" | "v2";

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new Error("Expected application/json.");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
async function listen(server: Server, port: number) {
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Unable to bind local port.");
  return `http://127.0.0.1:${address.port}`;
}
function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function startWorkspace(
  options: { adminPort?: number; decoyPort?: number } = {},
) {
  let fixture: Fixture = "v1";
  let snapshot = await scanRepository(resolve(root, "fixtures/acme-v1"));
  let deployedSnapshot: Snapshot = snapshot;
  const runtime = new DecoyRuntime(offlinePlan(snapshot), snapshot);
  let busy = false;
  const decoyServer = createServer(runtime.handle);
  const decoyURL = await listen(decoyServer, options.decoyPort ?? 4311);
  let adminURL = "";
  const state = () => ({
    fixture,
    snapshot,
    generation: runtime.generation,
    deploymentId: runtime.deploymentId,
    events: runtime.events,
    drift: drift(deployedSnapshot, snapshot),
    busy,
    metaConfigured: Boolean(process.env.MODEL_API_KEY),
    decoyURL,
  });
  const adminServer = createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent)
        json(res, 500, { error: "Unexpected workspace error." });
      else res.end();
    });
  });
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const adminHost = new URL(adminURL).host;
    if (req.headers.host !== adminHost)
      return json(res, 403, {
        error: "Use the printed 127.0.0.1 workspace URL.",
      });
    if (req.headers.origin && req.headers.origin !== adminURL)
      return json(res, 403, { error: "Cross-origin access denied." });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return json(res, 403, { error: "Cross-site access denied." });
    const url = new URL(req.url ?? "/", adminURL);
    if (url.pathname === "/api/state" && req.method === "GET")
      return json(res, 200, state());
    if (url.pathname.startsWith("/api/")) {
      if (req.method !== "POST")
        return json(res, 405, { error: "POST required." });
      if (busy)
        return json(res, 409, {
          error: "Another workspace operation is running.",
        });
      busy = true;
      try {
        const input = await body(req);
        if (url.pathname === "/api/scan") {
          if (input.fixture !== "v1" && input.fixture !== "v2")
            throw new Error("Choose fixture v1 or v2.");
          const next = await scanRepository(
            resolve(root, `fixtures/acme-${input.fixture}`),
          );
          fixture = input.fixture;
          snapshot = next;
        } else if (url.pathname === "/api/generate") {
          if (input.provider !== "meta" && input.provider !== "offline")
            throw new Error("Choose meta or offline explicitly.");
          const generation =
            input.provider === "meta"
              ? await generateWithMeta(snapshot)
              : offlinePlan(snapshot);
          runtime.deploy(generation, snapshot);
          deployedSnapshot = snapshot;
        } else if (url.pathname === "/api/traverse") {
          await traverse(runtime, decoyURL);
        } else return json(res, 404, { error: "Unknown operation." });
        busy = false;
        return json(res, 200, state());
      } catch (error) {
        return json(res, 400, {
          error: error instanceof Error ? error.message : "Operation failed.",
        });
      } finally {
        busy = false;
      }
    }
    if (req.method !== "GET") return json(res, 405, { error: "GET required." });
    const webRoot = resolve(root, "dist/web");
    const filename =
      url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const path = resolve(webRoot, filename);
    if (
      !path.startsWith(webRoot + sep) ||
      ![".html", ".js", ".css", ".svg", ".ico"].includes(extname(path))
    )
      return json(res, 404, { error: "Not found." });
    try {
      const content = await readFile(path);
      const mime: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
      };
      res.writeHead(200, {
        "Content-Type": `${mime[extname(path)]}; charset=utf-8`,
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });
      res.end(content);
    } catch {
      json(res, 404, {
        error: "Dashboard not built. Run npm run build, then npm start.",
      });
    }
  }
  try {
    adminURL = await listen(adminServer, options.adminPort ?? 4310);
  } catch (error) {
    await close(decoyServer);
    throw error;
  }
  return {
    adminURL,
    decoyURL,
    runtime,
    close: () => Promise.all([close(adminServer), close(decoyServer)]),
  };
}
