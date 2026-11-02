import type { Plan } from "./plan.ts";
import type { Snapshot } from "./scanner.ts";
import { seedDataset } from "./data.ts";
import { createHash } from "node:crypto";

export type Presentation = "legacy" | "application";
const internalWords =
  /synthetic|decoy|honeyweb|honeypot|breadcrumb|simulation/i;
export function publicLabel(label: string, entity = "") {
  return internalWords.test(label) ? `${entity || "Workspace"} records` : label;
}

// Fictional content authored for this prototype. No production records are copied.
export function applicationDataset(plan: Plan, snapshot: Snapshot) {
  const data = seedDataset(plan, snapshot);
  const identifiers = new Map<string, Map<unknown, unknown>>();
  for (const [entity, rows] of Object.entries(data)) {
    const mapping = new Map<unknown, unknown>();
    for (const row of rows) {
      const previous = row.id;
      if (typeof previous === "string")
        row.id =
          "rec_" +
          createHash("sha256")
            .update(entity + ":" + previous)
            .digest("hex")
            .slice(0, 20);
      mapping.set(previous, row.id);
    }
    identifiers.set(entity, mapping);
  }
  for (const relation of plan.relationships)
    for (const row of data[relation.from])
      row[relation.field] = identifiers
        .get(relation.to)!
        .get(row[relation.field]);
  const people = ["Maya Chen", "Elias Brooks", "Nora Patel", "Owen Rivera"];
  const titles = [
    "Editorial review schedule",
    "Author onboarding checklist",
    "Publication quality review",
    "Revision handoff notes",
  ];
  const bodies = [
    "The editorial team will review pending revisions on Tuesday. Each author should attach source notes before the final review.",
    "New contributors receive an editor assignment after their first outline is approved. The checklist tracks attribution and source verification.",
    "The next review covers accessibility, link integrity and publication timing. Editors record outstanding questions in the revision history.",
    "The outgoing editor has completed the source review. The remaining revision needs a second reader before the publication date is confirmed.",
  ];
  for (const [entity, rows] of Object.entries(data))
    for (const [i, row] of rows.entries()) {
      for (const field of snapshot.entities.find((e) => e.name === entity)!
        .fields) {
        if (field.type !== "string" || field.name === "id") continue;
        if (entity === "Tag" && field.name === "name")
          row[field.name] = ["editing", "reviews", "publishing", "research"][i];
        else if (
          /^(name|username)$/i.test(field.name) &&
          /user|author/i.test(entity)
        )
          row[field.name] =
            field.name === "username"
              ? people[i].toLowerCase().replace(" ", ".")
              : people[i];
        else if (/title/i.test(field.name)) row[field.name] = titles[i];
        else if (/slug/i.test(field.name))
          row[field.name] = titles[i].toLowerCase().replaceAll(" ", "-");
        else if (/body|description|bio/i.test(field.name))
          row[field.name] = /comment/i.test(entity)
            ? [
                "Source references checked; one attribution needs an update.",
                "The revised introduction is ready for a second review.",
                "Please confirm the publication window with the assigned editor.",
                "The handoff notes now include the remaining review questions.",
              ][i]
            : bodies[i];
        else if (/status/i.test(field.name))
          row[field.name] = ["draft", "in_review", "approved", "scheduled"][i];
        else if (/date|At$/.test(field.name))
          row[field.name] = `2026-10-${20 + i}T${10 + i}:15:00.000Z`;
      }
    }
  return data;
}

// Account serialization should not expose password or credential fields, even in fiction.
export function publicRecords(rows: Record<string, unknown>[]) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).filter(
        ([key]) => !/password|secret|token|credential/i.test(key)
      )
    )
  );
}
