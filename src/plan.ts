import { z } from "zod";
import type { Snapshot } from "./scanner.ts";

export const relationSchema = z.object({
  from: z.string(), field: z.string(), to: z.string(), target: z.literal("id"),
}).strict();
export type Relation = z.infer<typeof relationSchema>;
const identifier = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
export const planSchema = z.object({
  title: z.string().min(1).max(80),
  rationale: z.string().min(1).max(700),
  nodes: z.array(z.object({
    id: identifier,
    kind: z.enum(["breadcrumb", "collection", "export"]),
    entity: z.string().max(64), // Empty only for the entry node.
    path: z.string().regex(/^\/[a-z][a-z0-9/_-]{0,95}$/),
    label: z.string().min(1).max(60),
  }).strict()).min(3).max(13),
  edges: z.array(z.object({ from: identifier, to: identifier }).strict()).min(2).max(30),
  relationships: z.array(relationSchema).max(24),
}).strict();
export type Plan = z.infer<typeof planSchema>;
export interface Generation {
  plan: Plan;
  snapshotHash: string;
  provider: "offline" | "meta";
  model: string;
  generatedAt: string;
  latencyMs?: number;
  usage?: { inputTokens: number; outputTokens: number };
}
export const planJsonSchema = z.toJSONSchema(planSchema);

// Conservative convention-based references; these are evidence, not full type resolution.
export function inferRelationships(snapshot: Snapshot): Relation[] {
  if (snapshot.relationships) return snapshot.relationships;
  return snapshot.entities.flatMap(from => from.fields.flatMap(field => {
    const matches = snapshot.entities.filter(to => to.name !== from.name &&
      `${to.name}Id`.toLowerCase() === field.name.toLowerCase() &&
      to.fields.some(target => target.name === "id" && target.type === field.type &&
        ["string", "number"].includes(target.type)));
    return matches.length === 1 ? [{ from: from.name, field: field.name, to: matches[0].name, target: "id" as const }] : [];
  }));
}
export function validatePlan(input: unknown, snapshot: Snapshot): Plan {
  const plan = planSchema.parse(input);
  const nodes = new Map(plan.nodes.map(n => [n.id, n]));
  const entries = plan.nodes.filter(n => n.kind === "breadcrumb");
  const collections = plan.nodes.filter(n => n.kind === "collection");
  if (nodes.size !== plan.nodes.length || new Set(plan.nodes.map(n => n.path)).size !== nodes.size)
    throw new Error("Node IDs and paths must be unique.");
  if (entries.length !== 1 || entries[0].entity !== "" || !collections.length || collections.length > 6)
    throw new Error("Use one entry and one to six entity collections.");
  if (new Set(collections.map(n => n.entity)).size !== collections.length)
    throw new Error("Each entity must have exactly one collection.");
  for (const node of plan.nodes) {
    if (node.path.includes("//") || node.path.endsWith("/")) throw new Error("Paths must be canonical local paths.");
    if (node.kind !== "breadcrumb" && !snapshot.entities.some(e => e.name === node.entity))
      throw new Error("Every data node must reference an observed entity.");
    if (node.kind === "export" && !collections.some(n => n.entity === node.entity))
      throw new Error("Exports require a matching collection.");
  }
  const exports = plan.nodes.filter(n => n.kind === "export");
  if (new Set(exports.map(n => n.entity)).size !== exports.length) throw new Error("At most one export per entity is supported.");
  const edgeKeys = new Set<string>();
  for (const edge of plan.edges) {
    const from = nodes.get(edge.from), to = nodes.get(edge.to);
    if (!from || !to || from === to || from.kind === "export" || to.kind === "breadcrumb")
      throw new Error("Invalid graph edge.");
    if (to.kind === "export" && (from.kind !== "collection" || from.entity !== to.entity))
      throw new Error("Exports must be linked from their own collection.");
    const key = `${edge.from}:${edge.to}`;
    if (edgeKeys.has(key)) throw new Error("Duplicate graph edge.");
    edgeKeys.add(key);
  }
  const reached = new Set([entries[0].id]);
  for (let i = 0; i < nodes.size; i++)
    for (const edge of plan.edges) if (reached.has(edge.from)) reached.add(edge.to);
  if (reached.size !== nodes.size) throw new Error("All nodes must be reachable from the entry.");
  if (!plan.nodes.some(n => n.kind === "export")) throw new Error("At least one export is required.");
  // Include all observed references between selected entities. The model cannot invent relationships.
  const selected = new Set(collections.map(n => n.entity));
  const expected = inferRelationships(snapshot).filter(r => selected.has(r.from) && selected.has(r.to));
  const key = (r: Relation) => `${r.from}.${r.field}->${r.to}.${r.target}`;
  if (JSON.stringify(expected.map(key).sort()) !== JSON.stringify(plan.relationships.map(key).sort()))
    throw new Error("Relationships must match the observed references between selected entities.");
  // Do not silently omit referenced tables from a purportedly coherent environment.
  if (inferRelationships(snapshot).some(r => selected.has(r.from) && !selected.has(r.to)))
    throw new Error("Include the target collection of every selected foreign key.");
  return plan;
}
export function offlinePlan(snapshot: Snapshot): Generation {
  const entities = snapshot.entities.slice(0, 6);
  if (!entities.length) throw new Error("A TypeScript interface or Prisma model is required to seed synthetic records.");
  const slug = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  const nodes: Plan["nodes"] = [{ id: "entry", kind: "breadcrumb", entity: "", path: "/internal/integration-config", label: "Integration workspace" }];
  const edges: Plan["edges"] = [];
  entities.forEach((entity, i) => {
    const id = `records-${i}`, exp = `export-${i}`;
    nodes.push({ id, kind: "collection", entity: entity.name, path: `/api/${slug(entity.name)}-archive`, label: `${entity.name} archive` });
    nodes.push({ id: exp, kind: "export", entity: entity.name, path: `/exports/${slug(entity.name)}-snapshot`, label: `${entity.name} snapshot` });
    edges.push({ from: "entry", to: id }, { from: id, to: exp });
  });
  const relationships = inferRelationships(snapshot).filter(r => entities.some(e => e.name === r.from));
  for (const relation of relationships) {
    const from = nodes.find(n => n.kind === "collection" && n.entity === relation.from)!;
    const to = nodes.find(n => n.kind === "collection" && n.entity === relation.to);
    if (to && !edges.some(e => e.from === from.id && e.to === to.id)) edges.push({ from: from.id, to: to.id });
  }
  return {
    plan: validatePlan({ title: "Operations integration workspace", rationale: "Deterministic offline graph derived from observed entities and supported references. No model was called.", nodes, edges, relationships }, snapshot),
    snapshotHash: snapshot.hash, provider: "offline", model: "deterministic", generatedAt: new Date().toISOString(),
  };
}
