import { randomBytes } from "node:crypto";

export interface WorkflowResponse {
  status: number;
  body: unknown;
  entry?: boolean;
  protectedRead?: boolean;
  changed?: boolean;
}
/** One isolated fictional editorial workspace. It has no network, database or source access. */
export class EditorialDecoys {
  readonly entry = "/api/editor/workspace";
  readonly token = "svc_" + randomBytes(24).toString("hex");
  readonly draftId: number;
  private role = "member";
  private bio = "Editorial reviewer";
  private jobs = new Map<
    string,
    { id: string; state: string; records: unknown[] }
  >();
  private readonly people = [
    { id: 71, username: "maya.chen", role: "editor" },
    { id: 72, username: "elias.brooks", role: "reviewer" },
  ];
  constructor(readonly ownId: number) {
    this.draftId = ownId + 20;
  }
  get draftPath() {
    return `/api/editor/articles/${this.draftId}`;
  }
  get authorization() {
    return "Bearer " + this.token;
  }
  owns(path: string) {
    return (
      [
        this.entry,
        this.draftPath,
        `/api/editor/revisions/${this.draftId}`,
        "/api/editor/workspace/profile",
        "/api/admin/exports/users",
        "/api/editor/workspace/exports",
      ].includes(path) ||
      /^\/api\/editor\/workspace\/exports\/job-[1-9][0-9]?$/.test(path)
    );
  }
  private draft(id: number) {
    return {
      id,
      title: "Upcoming editorial assignments",
      authorId: 72,
      status: "draft",
      body: "The next editorial cycle assigns a primary reviewer and a second reader to each submission. Publication dates remain internal until source checks are complete.",
      revision: 3,
      links: [
        {
          href: `/api/editor/revisions/${this.draftId}`,
          label: "Revision history",
        },
        { href: "/api/admin/exports/users", label: "Editorial account export" },
      ],
    };
  }
  handle(
    method: string,
    path: string,
    input: Record<string, unknown>,
    authorized: boolean,
    serviceCredential = false
  ): WorkflowResponse {
    if (!authorized)
      return { status: 401, body: { error: "Member session required" } };
    if (path === this.entry && method === "GET")
      return {
        status: 200,
        entry: true,
        body: {
          service: "Editorial review workspace",
          account: { id: 11, role: this.role },
          draftIds: [this.draftId],
          integration: {
            token: this.token,
            auth: "Bearer",
            scope: ["drafts:read", "accounts:export"],
          },
          links: [
            { href: this.draftPath, label: "Unpublished review copy" },
            {
              href: `/api/editor/revisions/${this.draftId}`,
              label: "Revision history",
            },
            {
              href: "/api/admin/exports/users",
              label: "Editorial account export",
            },
            {
              href: "/api/editor/workspace/profile",
              label: "Workspace profile",
            },
          ],
          operations: [
            {
              method: "POST",
              path: "/api/editor/workspace/profile",
              body: { bio: "string" },
            },
            {
              method: "POST",
              path: "/api/editor/workspace/exports",
              body: { resource: "users" },
            },
          ],
        },
      };
    if (method === "GET" && path === this.draftPath)
      return {
        status: 200,
        protectedRead: true,
        body: this.draft(this.draftId),
      };
    if (method === "GET" && path === `/api/editor/revisions/${this.draftId}`)
      return {
        status: 200,
        protectedRead: true,
        body: {
          articleId: this.draftId,
          revisions: [
            { revision: 2, authorId: 72, note: "Updated review assignments" },
            {
              revision: 3,
              authorId: 71,
              note: "Added source verification checklist",
            },
          ],
          links: [{ href: this.draftPath, label: "Current draft" }],
        },
      };
    if (path === "/api/editor/workspace/profile") {
      if (method === "POST") {
        if (typeof input.bio === "string") this.bio = input.bio.slice(0, 120);
        if (input.role === "admin") this.role = "admin"; // Fictional state only; never grants real permissions.
        return {
          status: 200,
          changed: true,
          body: { id: 11, role: this.role, bio: this.bio },
        };
      }
      if (method === "GET")
        return {
          status: 200,
          protectedRead: true,
          body: { id: 11, role: this.role, bio: this.bio },
        };
    }
    if (path === "/api/admin/exports/users" && method === "GET")
      return this.role === "admin" || serviceCredential
        ? {
            status: 200,
            protectedRead: true,
            body: {
              records: this.people,
              count: this.people.length,
              generatedAt: "2026-10-28T10:15:00.000Z",
            },
          }
        : {
            status: 403,
            body: { error: "Account export permission required" },
          };
    if (path === "/api/editor/workspace/exports" && method === "POST") {
      if (input.resource !== "users")
        return { status: 400, body: { error: "Unsupported resource" } };
      if (this.role !== "admin" && !serviceCredential)
        return {
          status: 403,
          body: { error: "Account export permission required" },
        };
      if (this.jobs.size >= 20)
        return { status: 429, body: { error: "Export capacity reached" } };
      const id = `job-${this.jobs.size + 1}`;
      this.jobs.set(id, { id, state: "ready", records: this.people });
      return {
        status: 202,
        changed: true,
        body: {
          id,
          state: "ready",
          href: `/api/editor/workspace/exports/${id}`,
        },
      };
    }
    if (method === "GET" && path.startsWith("/api/editor/workspace/exports/")) {
      const job = this.jobs.get(path.split("/").at(-1)!);
      return job
        ? { status: 200, protectedRead: true, body: job }
        : { status: 404, body: { error: "Export not found" } };
    }
    return { status: 405, body: { error: "Unsupported operation" } };
  }
  /** Used only after a server-confirmed canary hit. No fallback to any real backend. */
  shadow(
    method: string,
    path: string,
    input: Record<string, unknown>
  ): WorkflowResponse {
    if (path === "/api/profile")
      return this.handle(method, "/api/editor/workspace/profile", input, true);
    if (path === "/api/me" && method === "GET")
      return {
        status: 200,
        body: {
          id: 11,
          username: "editor-reviewer",
          role: this.role,
          bio: this.bio,
          draftIds: [this.ownId],
          links: [{ href: this.entry, label: "Review workspace" }],
        },
      };
    if (path === "/api/admin/users" && method === "GET")
      return { status: 200, body: { entity: "User", records: this.people } };
    if (/^\/api\/editor\/articles\/\d+$/.test(path) && method === "GET")
      return { status: 200, body: this.draft(Number(path.split("/").at(-1))) };
    if (path === "/api/articles" && method === "GET")
      return {
        status: 200,
        body: {
          articles: [
            {
              slug: "editorial-review-schedule",
              title: "Editorial review schedule",
              description: "Review assignments for the next publishing cycle.",
            },
          ],
          articlesCount: 1,
        },
      };
    if ((path === "/" || path === "/docs") && method === "GET")
      return {
        status: 200,
        body: {
          service: "Conduit editorial workspace",
          links: [
            { href: this.entry, label: "Review workspace" },
            { href: "/api/articles", label: "Published articles" },
          ],
        },
      };
    if (path === "/robots.txt" && method === "GET")
      return { status: 200, body: { disallow: ["/api/admin/"] } };
    return { status: 404, body: { error: "Not found" } };
  }
}
