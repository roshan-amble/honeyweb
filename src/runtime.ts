import { randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Generation } from "./plan.ts";
import type { Entity, Snapshot } from "./scanner.ts";

export interface Interaction {
  id: string;
  timestamp: string;
  generation: string;
  session: string | null;
  node: string;
  method: string;
  path: string;
  status: number;
  demo: boolean;
}
interface Session {
  id: string;
  exported: boolean;
  createdAt: number;
  demo: boolean;
}
export function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  });
  res.end(JSON.stringify(data));
}

function seed(entity: Entity): Record<string, unknown>[] {
  return Array.from({ length: 4 }, (_, i) =>
    Object.fromEntries(
      entity.fields.map((field) => {
        let value: unknown;
        if (field.type === "number") value = (i + 1) * 125;
        else if (field.type === "boolean") value = true;
        else if (field.type === "array") value = [];
        else if (field.type !== "string") value = null;
        else if (/email/i.test(field.name))
          value = `person${i + 1}@example.invalid`;
        else if (/^id$|Id$/.test(field.name)) value = `syn_${i + 1}`;
        else if (/name/i.test(field.name))
          value = [
            "Northwind Demo",
            "Cedar Demo",
            "Harbor Demo",
            "Juniper Demo",
          ][i];
        else if (/region/i.test(field.name))
          value = ["west", "east", "north", "south"][i];
        else if (/tier/i.test(field.name))
          value = ["standard", "enterprise", "standard", "enterprise"][i];
        else value = `synthetic_${field.name}_${i + 1}`;
        return [field.name, value];
      }),
    ),
  );
}

export class DecoyRuntime {
  generation: Generation;
  readonly events: Interaction[] = [];
  private sessions = new Map<string, Session>();
  private records: Record<string, unknown>[] = [];
  private runId = randomUUID();
  private demoRequests = new Set<string>();

  constructor(generation: Generation, snapshot: Snapshot) {
    this.generation = generation;
    this.deploy(generation, snapshot);
  }

  deploy(generation: Generation, snapshot: Snapshot) {
    const entity = snapshot.entities.find(
      (e) => e.name === generation.plan.entity,
    );
    if (!entity || generation.snapshotHash !== snapshot.hash)
      throw new Error("Generation does not match source snapshot.");
    this.generation = generation;
    this.records = seed(entity);
    this.sessions.clear();
    this.demoRequests.clear();
    this.runId = randomUUID();
  }

  get deploymentId() {
    return this.runId;
  }
  // Only the operator's local demo runner receives this one-use marker.
  createDemoMarker() {
    if (this.demoRequests.size >= 500) this.demoRequests.clear();
    const marker = randomBytes(24).toString("hex");
    this.demoRequests.add(marker);
    return marker;
  }

  handle = (req: IncomingMessage, res: ServerResponse) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://127.0.0.1");
    } catch {
      return json(res, 400, { error: "Invalid request URL" });
    }
    const node = this.generation.plan.nodes.find(
      (n) => n.path === url.pathname,
    );
    const now = Date.now();
    for (const [token, session] of this.sessions)
      if (now - session.createdAt > 15 * 60_000) this.sessions.delete(token);
    let session: Session | undefined;
    const record = (status: number, body: unknown) => {
      this.events.push({
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        generation: this.runId,
        session: session?.id ?? null,
        node: node?.id ?? "unmatched",
        method: (req.method ?? "GET").slice(0, 12),
        path: node?.path ?? "[unmatched]",
        status,
        demo: session?.demo ?? false,
      });
      if (this.events.length > 1000) this.events.shift();
      json(res, status, body);
    };
    if (!node) return record(404, { error: "Not found" });
    if (req.method !== "GET")
      return record(405, { error: "Read-only endpoint" });
    const recordsNode = this.generation.plan.nodes.find(
      (n) => n.id === "records",
    )!;
    const exportNode = this.generation.plan.nodes.find(
      (n) => n.id === "export",
    )!;
    if (node.kind === "breadcrumb") {
      if (this.sessions.size >= 500)
        this.sessions.delete(this.sessions.keys().next().value!);
      const marker = req.headers["x-honeyweb-demo"];
      const demo =
        typeof marker === "string" && this.demoRequests.delete(marker);
      session = {
        id: randomUUID().slice(0, 8),
        exported: false,
        createdAt: now,
        demo,
      };
      const token = `hw_decoy_${randomBytes(24).toString("hex")}`;
      this.sessions.set(token, session);
      return record(200, {
        service: this.generation.plan.title,
        integration: { endpoint: recordsNode.path, token, auth: "Bearer" },
      });
    }
    const authorization = req.headers.authorization;
    session =
      typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? this.sessions.get(authorization.slice(7))
        : undefined;
    if (!session)
      return record(401, { error: "Invalid integration credential" });
    if (node.kind === "collection")
      return record(200, {
        entity: this.generation.plan.entity,
        records: this.records,
        export: {
          href: exportNode.path,
          status: session.exported ? "downloaded" : "ready",
        },
      });
    session.exported = true;
    return record(200, {
      entity: this.generation.plan.entity,
      format: "json",
      records: this.records,
      count: this.records.length,
    });
  };
}

export async function traverse(runtime: DecoyRuntime, baseURL: string) {
  const entry = runtime.generation.plan.nodes.find((n) => n.id === "entry")!;
  const request = async (path: string, headers: Record<string, string>) => {
    // Paths originate only from a validated plan. Never accept a remote target.
    if (!runtime.generation.plan.nodes.some((n) => n.path === path))
      throw new Error("Traversal left the deployed plan.");
    const response = await fetch(new URL(path, baseURL), {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok)
      throw new Error(`Traversal returned HTTP ${response.status}.`);
    return response.json();
  };
  const config = (await request(entry.path, {
    "x-honeyweb-demo": runtime.createDemoMarker(),
  })) as { integration: { endpoint: string; token: string } };
  const headers = { Authorization: `Bearer ${config.integration.token}` };
  const collection = (await request(config.integration.endpoint, headers)) as {
    export: { href: string };
  };
  await request(collection.export.href, headers);
  return { completed: true, requests: 3 };
}
