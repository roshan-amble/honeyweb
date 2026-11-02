import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import type { Snapshot } from "./scanner.ts";
import {
  validateWorkflowPlan,
  workflowDataset,
  type WorkflowPlan,
} from "./workflow-plan.ts";

type Row = Record<string, unknown>;
type Principal = {
  contained: boolean;
  bio: string;
  data: Record<string, Row[]>;
  revisions: Map<string, Row[]>;
  jobs: Map<
    string,
    { id: string; entity: string; state: string; records: Row[] }
  >;
  canary: string;
};
export interface WorkflowEvent {
  seq: number;
  method: string;
  path: string;
  status: number;
  principal: string | null;
  operation: string;
  entity: string | null;
  signal: "canary-credential" | "private-record" | null;
  containedBefore: boolean;
  containedAfter: boolean;
  changed: boolean;
  realRead: boolean;
}
const opaque = () => randomBytes(24).toString("hex");
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
/** Operator-created identities only; HTTP cannot register or choose a principal. */
export class WorkflowEnvironment {
  readonly plan: WorkflowPlan;
  readonly events: WorkflowEvent[] = [];
  private principals = new Map<string, Principal>();
  private sessions = new Map<
    string,
    { principal: string; authorization: string }
  >();
  private canaries = new Set<string>();
  constructor(plan: WorkflowPlan, private snapshot: Snapshot) {
    this.plan = validateWorkflowPlan(plan, snapshot);
  }
  openSession(principal: string) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(principal))
      throw new Error("Invalid lab principal.");
    if (this.sessions.size >= 128) throw new Error("Session capacity reached.");
    if (!this.principals.has(principal)) {
      if (this.principals.size >= 32)
        throw new Error("Principal capacity reached.");
      const canary = "Bearer svc_" + opaque();
      this.principals.set(principal, {
        contained: false,
        bio: "Workspace reviewer",
        data: workflowDataset(this.plan, this.snapshot),
        revisions: new Map(),
        jobs: new Map(),
        canary,
      });
      this.canaries.add(canary);
    }
    const id = opaque(),
      authorization = "Bearer usr_" + opaque();
    this.sessions.set(id, { principal, authorization });
    return { id, cookie: "hw_session=" + id, authorization };
  }
  rotateSession(id: string) {
    const previous = this.sessions.get(id);
    if (!previous) throw new Error("Unknown session.");
    this.sessions.delete(id);
    return this.openSession(previous.principal);
  }
  revokeSession(id: string) {
    this.sessions.delete(id);
  }
  private recordPath(base: string, row: Row) {
    return base + "/records/" + encodeURIComponent(String(row.id));
  }
  handle(
    method: string,
    path: string,
    cookie: string,
    authorization: string,
    input: Row = {}
  ) {
    const match = /^hw_session=([a-f0-9]{48})$/.exec(cookie);
    const session = match ? this.sessions.get(match[1]) : undefined;
    const state = session ? this.principals.get(session.principal)! : undefined;
    const before = state?.contained ?? false;
    let signal: WorkflowEvent["signal"] = null;
    const finish = (
      status: number,
      body: unknown,
      operation: string,
      entity: string | null = null,
      changed = false
    ) => {
      if (this.events.length >= 10000)
        throw new Error("Event capacity reached.");
      this.events.push({
        seq: this.events.length + 1,
        method,
        path:
          path.length <= 160 && /^\/[A-Za-z0-9/_-]*$/.test(path)
            ? path
            : "[invalid target]",
        status,
        principal: session ? digest(session.principal) : null,
        operation,
        entity,
        signal,
        containedBefore: before,
        containedAfter: state?.contained ?? false,
        changed,
        realRead: false,
      });
      return { status, body: structuredClone(body) };
    };
    if (
      !["GET", "POST"].includes(method) ||
      !/^\/[A-Za-z0-9/_-]*$/.test(path) ||
      path.includes("//") ||
      path.length > 160
    )
      return finish(400, { error: "Unsupported request" }, "reject");
    if (!state || !session)
      return finish(
        401,
        { error: "Server-issued session required" },
        "authenticate"
      );
    const canary = this.canaries.has(authorization);
    if (authorization !== session.authorization && !canary)
      return finish(
        401,
        { error: "Member authorization required" },
        "authenticate"
      );
    if (canary) {
      signal = "canary-credential";
      state.contained = true;
    }
    const privateRead = () => {
      signal ??= "private-record";
      state.contained = true;
    };
    if (method === "GET" && (path === "/" || path === this.plan.entry))
      return finish(
        200,
        {
          service: "Review workspace",
          profile: this.plan.entry + "/profile",
          integration: { authorization: state.canary },
          resources: this.plan.resources.map((r) => ({
            entity: r.entity,
            href: r.base,
            sourceRoutes: r.sourceRoutes,
          })),
        },
        "index"
      );
    if (path === this.plan.entry + "/profile") {
      if (method === "POST") {
        if (
          Object.keys(input).some((k) => k !== "bio") ||
          typeof input.bio !== "string" ||
          input.bio.length > 120
        )
          return finish(
            403,
            { error: "Only your bio may be updated" },
            "profile-denied"
          );
        state.bio = input.bio;
      }
      return finish(
        200,
        { role: "member", bio: state.bio },
        "profile",
        null,
        method === "POST"
      );
    }
    for (const resource of this.plan.resources) {
      const rows = state.data[resource.entity];
      if (path === resource.base && method === "GET")
        return finish(
          200,
          {
            entity: resource.entity,
            records: rows.map((row, i) => ({
              id: row.id,
              ownership: i === 0 ? "own" : "other",
              visibility: i === 0 ? "member" : "private",
              href: this.recordPath(resource.base, row),
            })),
            mutableFields: resource.mutableFields,
            exports: resource.base + "/exports",
            exportBody: { scope: "own" },
          },
          "resource-index",
          resource.entity
        );
      if (path === resource.base + "/exports" && method === "POST") {
        if (
          Object.keys(input).length !== 1 ||
          !["own", "all"].includes(String(input.scope))
        )
          return finish(
            400,
            { error: "Choose own or all export scope" },
            "export-reject",
            resource.entity
          );
        if (input.scope === "all" && !state.contained)
          return finish(
            403,
            { error: "Private export requires review permission" },
            "export-denied",
            resource.entity
          );
        if (state.jobs.size >= 20)
          return finish(
            429,
            { error: "Export capacity reached" },
            "export-limit",
            resource.entity
          );
        const id = "job-" + (state.jobs.size + 1),
          records = structuredClone(
            input.scope === "own" ? rows.slice(0, 1) : rows
          );
        state.jobs.set(id, {
          id,
          entity: resource.entity,
          state: "ready",
          records,
        });
        return finish(
          202,
          { id, state: "ready", href: resource.base + "/exports/" + id },
          "export-create",
          resource.entity,
          true
        );
      }
      if (path.startsWith(resource.base + "/exports/") && method === "GET") {
        const job = state.jobs.get(
          path.slice((resource.base + "/exports/").length)
        );
        if (!job || job.entity !== resource.entity)
          return finish(
            404,
            { error: "Export not found" },
            "export-missing",
            resource.entity
          );
        if (job.records.length > 1) privateRead();
        job.state = "downloaded";
        return finish(200, job, "export-read", resource.entity, true);
      }
      for (const [index, row] of rows.entries()) {
        const target = this.recordPath(resource.base, row);
        if (path !== target && path !== target + "/revisions") continue;
        if (method === "GET") {
          if (index !== 0) privateRead();
          const revisions = state.revisions.get(target) ?? [
            structuredClone(row),
          ];
          return finish(
            200,
            path.endsWith("/revisions")
              ? { recordId: row.id, revisions }
              : {
                  record: row,
                  revision: revisions.length,
                  revisions: target + "/revisions",
                },
            path.endsWith("/revisions") ? "revisions" : "record-read",
            resource.entity
          );
        }
        if (path !== target || index !== 0)
          return finish(
            403,
            { error: "Only own records may be updated" },
            "record-denied",
            resource.entity
          );
        const entity = this.snapshot.entities.find(
          (e) => e.name === resource.entity
        )!;
        if (
          !Object.keys(input).length ||
          Object.entries(input).some(
            ([key, value]) =>
              !resource.mutableFields.includes(key) ||
              typeof value !==
                entity.fields.find((f) => f.name === key)?.type ||
              (typeof value === "number" && !Number.isFinite(value)) ||
              (typeof value === "string" && value.length > 240)
          )
        )
          return finish(
            400,
            { error: "Invalid mutable fields" },
            "record-reject",
            resource.entity
          );
        const history = state.revisions.get(target) ?? [structuredClone(row)];
        if (history.length >= 20)
          return finish(
            429,
            { error: "Revision capacity reached" },
            "revision-limit",
            resource.entity
          );
        Object.assign(row, input);
        history.push(structuredClone(row));
        state.revisions.set(target, history);
        return finish(
          200,
          { record: row, revision: history.length },
          "record-update",
          resource.entity,
          true
        );
      }
    }
    return finish(404, { error: "Not found" }, "missing");
  }
}
export async function serveWorkflowEnvironment(
  environment: WorkflowEnvironment
) {
  const server = createServer((req, res) => {
    void (async () => {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk.toString();
        if (Buffer.byteLength(raw) > 4096) {
          res.writeHead(413);
          res.end();
          return;
        }
      }
      let body: Row = {};
      try {
        body = raw ? JSON.parse(raw) : {};
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw Error();
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      const result = environment.handle(
        req.method ?? "",
        req.url ?? "",
        req.headers.cookie ?? "",
        req.headers.authorization ?? "",
        body
      );
      res.writeHead(result.status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(result.body));
    })().catch(() => {
      if (!res.headersSent) res.writeHead(503);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as any).port}/`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
