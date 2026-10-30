import { randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { validatePlan, type Generation } from "./plan.ts";
import type { Snapshot } from "./scanner.ts";
import { auditDataset, seedDataset, type Dataset } from "./data.ts";

export interface Interaction {
  id: string; timestamp: string; generation: string; session: string | null;
  node: string; method: string; path: string; status: number; demo: boolean;
}
interface Session { id: string; exported: Set<string>; createdAt: number; demo: boolean }
export function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" });
  res.end(JSON.stringify(data));
}
export class DecoyRuntime {
  generation!: Generation;
  readonly events: Interaction[] = [];
  private sessions = new Map<string, Session>();
  private data: Dataset = Object.create(null);
  private runId = randomUUID();
  private demoRequests = new Set<string>();
  constructor(generation: Generation, snapshot: Snapshot) { this.deploy(generation, snapshot); }
  deploy(generation: Generation, snapshot: Snapshot) {
    if (generation.snapshotHash !== snapshot.hash) throw new Error("Generation does not match source snapshot.");
    const plan = validatePlan(generation.plan, snapshot);
    const data = seedDataset(plan, snapshot);
    if (auditDataset(plan, snapshot, data).some(c => !c.passed)) throw new Error("Candidate failed consistency checks; previous deployment retained.");
    // Commit only after the entire candidate passes; failure cannot partially rotate the live state.
    this.generation = structuredClone({ ...generation, plan });
    this.data = data;
    this.sessions.clear(); this.demoRequests.clear(); this.runId = randomUUID();
  }
  audit(snapshot: Snapshot) { return auditDataset(this.generation.plan, snapshot, this.data); }
  get deploymentId() { return this.runId; }
  get entryPath() { return this.generation.plan.nodes.find(n => n.kind === "breadcrumb")!.path; }
  createDemoMarker() {
    if (this.demoRequests.size >= 500) this.demoRequests.clear();
    const marker = randomBytes(24).toString("hex"); this.demoRequests.add(marker); return marker;
  }
  handle = (req: IncomingMessage, res: ServerResponse) => {
    let url: URL;
    try { url = new URL(req.url ?? "/", "http://127.0.0.1"); }
    catch { return json(res, 400, { error: "Invalid request URL" }); }
    const plan = this.generation.plan;
    const node = plan.nodes.find(n => n.path === url.pathname);
    const now = Date.now();
    for (const [token, session] of this.sessions) if (now - session.createdAt > 15 * 60_000) this.sessions.delete(token);
    let session: Session | undefined;
    const marker = req.headers["x-honeyweb-demo"];
    const marked = typeof marker === "string" && this.demoRequests.delete(marker);
    const record = (status: number, body: unknown) => {
      this.events.push({ id: randomUUID(), timestamp: new Date().toISOString(), generation: this.runId,
        session: session?.id ?? null, node: node?.id ?? "unmatched", method: (req.method ?? "GET").slice(0, 12),
        path: node?.path ?? "[unmatched]", status, demo: marked || (session?.demo ?? false) });
      if (this.events.length > 1000) this.events.shift();
      json(res, status, body);
    };
    if (!node || url.search) return record(404, { error: "Not found" });
    if (req.method !== "GET") return record(405, { error: "Read-only endpoint" });
    const links = plan.edges.filter(e => e.from === node.id).map(e => {
      const target = plan.nodes.find(n => n.id === e.to)!;
      return { href: target.path, label: target.label, kind: target.kind, entity: target.entity };
    });
    if (node.kind === "breadcrumb") {
      if (this.sessions.size >= 500) this.sessions.delete(this.sessions.keys().next().value!);
      session = { id: randomUUID().slice(0, 8), exported: new Set(), createdAt: now, demo: marked };
      const token = `hw_decoy_${randomBytes(24).toString("hex")}`;
      this.sessions.set(token, session);
      return record(200, { service: plan.title, kind: node.kind, integration: { token, auth: "Bearer" }, links });
    }
    const authorization = req.headers.authorization;
    session = typeof authorization === "string" && authorization.startsWith("Bearer ") ? this.sessions.get(authorization.slice(7)) : undefined;
    if (!session) return record(401, { error: "Invalid integration credential" });
    const records = this.data[node.entity];
    if (node.kind === "export") session.exported.add(node.entity);
    return record(200, { entity: node.entity, kind: node.kind, records, count: records.length,
      exportStatus: session.exported.has(node.entity) ? "downloaded" : "ready",
      relationships: plan.relationships.filter(r => r.from === node.entity), links });
  };
}
