import { z } from "zod";
import type { Snapshot } from "./scanner.ts";

const nodeSchema = z
  .object({
    id: z.enum(["entry", "records", "export"]),
    kind: z.enum(["breadcrumb", "collection", "export"]),
    path: z.string().regex(/^\/[a-z][a-z0-9/_-]{0,95}$/),
    label: z.string().min(1).max(60),
  })
  .strict();
export const planSchema = z
  .object({
    title: z.string().min(1).max(80),
    rationale: z.string().min(1).max(500),
    entity: z.string().min(1).max(64),
    nodes: z.array(nodeSchema).length(3),
    edges: z
      .array(
        z
          .object({
            from: z.enum(["entry", "records"]),
            to: z.enum(["records", "export"]),
          })
          .strict(),
      )
      .length(2),
  })
  .strict();
export type Plan = z.infer<typeof planSchema>;
export interface Generation {
  plan: Plan;
  snapshotHash: string;
  provider: "offline" | "meta";
  model: string;
  generatedAt: string;
}
export const planJsonSchema = z.toJSONSchema(planSchema);

export function validatePlan(input: unknown, snapshot: Snapshot): Plan {
  const plan = planSchema.parse(input);
  if (!snapshot.entities.some((e) => e.name === plan.entity))
    throw new Error("Plan must reference an observed interface.");
  const mapping = {
    entry: "breadcrumb",
    records: "collection",
    export: "export",
  };
  if (
    new Set(plan.nodes.map((n) => n.id)).size !== 3 ||
    new Set(plan.nodes.map((n) => n.path)).size !== 3 ||
    plan.nodes.some((n) => n.kind !== mapping[n.id])
  )
    throw new Error(
      "Plan must contain one distinct node of each supported kind.",
    );
  if (plan.nodes.some((n) => n.path.includes("//") || n.path.endsWith("/")))
    throw new Error("Paths must be canonical local paths.");
  if (
    !plan.edges.some((e) => e.from === "entry" && e.to === "records") ||
    !plan.edges.some((e) => e.from === "records" && e.to === "export")
  )
    throw new Error("Plan must form entry → records → export.");
  return plan;
}

export function offlinePlan(snapshot: Snapshot): Generation {
  const entity = snapshot.entities[0];
  if (!entity)
    throw new Error(
      "A TypeScript interface is required to seed synthetic records.",
    );
  const slug = entity.name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  const plan = validatePlan(
    {
      title: `${entity.name} operations workspace`,
      rationale: `Deterministic offline fixture using the observed ${entity.name} interface. Meta has not been called.`,
      entity: entity.name,
      nodes: [
        {
          id: "entry",
          kind: "breadcrumb",
          path: "/internal/integration-config",
          label: "Integration configuration",
        },
        {
          id: "records",
          kind: "collection",
          path: `/api/${slug}-archive`,
          label: `${entity.name} archive`,
        },
        {
          id: "export",
          kind: "export",
          path: `/exports/${slug}-snapshot`,
          label: "Snapshot export",
        },
      ],
      edges: [
        { from: "entry", to: "records" },
        { from: "records", to: "export" },
      ],
    },
    snapshot,
  );
  return {
    plan,
    snapshotHash: snapshot.hash,
    provider: "offline",
    model: "deterministic fixture",
    generatedAt: new Date().toISOString(),
  };
}
