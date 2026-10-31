import type { Entity } from "./scanner.ts";
export interface SourceRelation {
  from: string;
  field: string;
  to: string;
  target: "id";
}

// Restricted lexical extraction, not a Prisma compiler. No defaults, URLs or literal values leave this parser.
export function extractPrisma(source: string, file: string) {
  const clean = source.replace(
    /"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (token) => (token.startsWith('"') ? '""' : token.replace(/[^\n]/g, " "))
  );
  const models = [
    ...clean.matchAll(/\bmodel\s+([A-Za-z][A-Za-z0-9_]*)\s*\{([^}]*?)\}/g),
  ];
  const names = new Set(models.map((m) => m[1]));
  const entities: Entity[] = [],
    relationships: SourceRelation[] = [],
    warnings: string[] = [];
  let omittedRelations = 0;
  for (const model of models) {
    const fields: Entity["fields"] = [];
    for (const line of model[2].split("\n")) {
      const match = line.match(
        /^\s*([A-Za-z][A-Za-z0-9_]{0,63})\s+([A-Za-z][A-Za-z0-9_]*)(\[\])?(\?)?\s*(.*)$/
      );
      if (!match) continue;
      const [, name, type, array, , attributes] = match;
      if (names.has(type)) {
        const fk = attributes.match(
          /\bfields\s*:\s*\[\s*([A-Za-z][A-Za-z0-9_]*)\s*\]/
        )?.[1];
        const target = attributes.match(
          /\breferences\s*:\s*\[\s*([A-Za-z][A-Za-z0-9_]*)\s*\]/
        )?.[1];
        if (!array && fk && target === "id")
          relationships.push({
            from: model[1],
            field: fk,
            to: type,
            target: "id",
          });
        else omittedRelations++;
        continue;
      }
      const scalar = ["Int", "Float", "Decimal", "BigInt"].includes(type)
        ? "number"
        : ["String", "DateTime"].includes(type)
        ? "string"
        : type === "Boolean"
        ? "boolean"
        : "unknown";
      fields.push({ name, type: array ? "array" : scalar });
    }
    if (fields.length > 40)
      throw new Error("Prisma model exceeds 40 scalar fields.");
    if (fields.length) entities.push({ name: model[1], fields, file });
  }
  const valid = relationships.filter((r) => {
    const from = entities
      .find((e) => e.name === r.from)
      ?.fields.find((f) => f.name === r.field);
    const to = entities
      .find((e) => e.name === r.to)
      ?.fields.find((f) => f.name === "id");
    return (
      from &&
      to &&
      from.type === to.type &&
      ["string", "number"].includes(from.type)
    );
  });
  if (omittedRelations || valid.length !== relationships.length)
    warnings.push(
      `Prisma: ${
        omittedRelations + relationships.length - valid.length
      } inverse, implicit-many-to-many, composite or unsupported relation fields omitted. Only explicit scalar references to id are represented.`
    );
  return { entities, relationships: valid, warnings };
}
