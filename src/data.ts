import type { Snapshot, Field } from "./scanner.ts";
import type { Plan, Generation } from "./plan.ts";
export type Dataset = Record<string, Record<string, unknown>[]>;
export interface Check { check: string; passed: boolean; detail: string }
const names = ["Northwind Services", "Cedar Logistics", "Harbor Supply", "Juniper Works"];
function value(field: Field, entity: string, i: number): unknown {
  if (field.name === "id" && ["number", "string"].includes(field.type)) return field.type === "number" ? i + 1 : `syn_${entity.toLowerCase()}_${String(i + 1).padStart(3, "0")}`;
  if (field.type === "number") return /total|amount|price/i.test(field.name) ? [1250, 840, 2120, 660][i] : i + 1;
  if (field.type === "boolean") return true;
  if (field.type === "array") return [];
  if (field.type !== "string") return null;
  if (/email/i.test(field.name)) return `ops${i + 1}@example.invalid`;
  if (/name/i.test(field.name)) return names[i];
  if (/region/i.test(field.name)) return ["west", "east", "north", "south"][i];
  if (/tier/i.test(field.name)) return ["standard", "enterprise", "standard", "enterprise"][i];
  if (/status/i.test(field.name)) return ["ready", "processing", "ready", "complete"][i];
  if (/date|At$/.test(field.name)) return `2026-10-${String(20 + i).padStart(2, "0")}`;
  if (/currency/i.test(field.name)) return "USD";
  return `${field.name}_${i + 1}`;
}
export function seedDataset(plan: Plan, snapshot: Snapshot): Dataset {
  const data: Dataset = Object.create(null);
  for (const node of plan.nodes.filter(n => n.kind === "collection")) {
    const entity = snapshot.entities.find(e => e.name === node.entity)!;
    data[entity.name] = Array.from({ length: 4 }, (_, i) => Object.fromEntries(entity.fields.map(f => [f.name, value(f, entity.name, i)])));
  }
  for (const relation of plan.relationships)
    data[relation.from].forEach((row, i) => { row[relation.field] = data[relation.to][i % data[relation.to].length][relation.target]; });
  return data;
}
export function auditDataset(plan: Plan, snapshot: Snapshot, data: Dataset): Check[] {
  const checks: Check[] = [];
  for (const node of plan.nodes.filter(n => n.kind === "collection")) {
    const entity = snapshot.entities.find(e => e.name === node.entity);
    const rows = data[node.entity] ?? [];
    const compatible = Boolean(entity) && rows.length > 0 && rows.every(row => {
      if (Object.keys(row).sort().join() !== entity!.fields.map(f => f.name).sort().join()) return false;
      return entity!.fields.every(f => f.type === "array" ? Array.isArray(row[f.name]) : ["string", "number", "boolean"].includes(f.type) ? typeof row[f.name] === f.type : row[f.name] === null);
    });
    checks.push({ check: `schema:${node.entity}`, passed: compatible, detail: compatible ? `${rows.length} records match ${node.entity}` : `${node.entity} records no longer match the source fields` });
    if (entity?.fields.some(f => f.name === "id")) checks.push({ check: `ids:${node.entity}`, passed: new Set(rows.map(r => r.id)).size === rows.length, detail: `${node.entity} IDs are unique` });
  }
  for (const r of plan.relationships) {
    const targets = new Set((data[r.to] ?? []).map(row => row[r.target]));
    const valid = (data[r.from] ?? []).every(row => targets.has(row[r.field]));
    checks.push({ check: `reference:${r.from}.${r.field}`, passed: valid, detail: `${r.from}.${r.field} → ${r.to}.${r.target}` });
  }
  return checks;
}
export function impact(previous: Snapshot, current: Snapshot, generation: Generation) {
  const entities = new Set([...previous.entities, ...current.entities].map(e => e.name));
  const changedEntities = [...entities].filter(name => JSON.stringify(previous.entities.find(e => e.name === name)) !== JSON.stringify(current.entities.find(e => e.name === name)));
  const routeChanges = JSON.stringify(previous.routes) !== JSON.stringify(current.routes);
  return {
    changedEntities,
    nodes: generation.plan.nodes.filter(n => changedEntities.includes(n.entity) ||
      generation.plan.relationships.some(r => r.from === n.entity && changedEntities.includes(r.to)) || (n.kind === "breadcrumb" && routeChanges)).map(n => ({ id: n.id, label: n.label, entity: n.entity })),
    routeChanges,
  };
}
