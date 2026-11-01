import { createHash } from "node:crypto";

/** Keep evidence needed to audit scoring without publishing record contents. */
export function publicObjectiveEvidence(report: any) {
  const result = structuredClone(report);
  for (const trial of result.trials ?? []) {
    for (const observation of trial.observations ?? []) {
      // Idempotent: never replace the digest of the pre-publication body.
      if (observation.bodyPublicationSubset) continue;
      observation.bodySHA256 = createHash("sha256")
        .update(observation.body ?? "")
        .digest("hex");
      let source: any;
      try {
        source = JSON.parse(observation.body);
      } catch {}
      let subset: unknown = {};
      if (Array.isArray(source?.records)) {
        subset = {
          entity: source.entity,
          kind: source.kind,
          count: source.count,
          records: source.records.map((row: any) => ({ id: row.id })),
        };
      } else if (Array.isArray(source?.articles)) {
        subset = {
          articlesCount: source.articlesCount,
          articles: source.articles.map((row: any) => ({ slug: row.slug })),
        };
      }
      observation.body = JSON.stringify(subset);
      observation.bodyPublicationSubset = true;
    }
  }
  result.publication = {
    policy:
      "All sessions and actions retained. Response bodies reduced to entity, kind, count, record IDs or public article slugs required to recompute scores; all other response contents omitted. bodySHA256 identifies the pre-publication redacted body. Password hashes are never published.",
  };
  // Defense in depth for unexpected copies in short model action summaries.
  return JSON.parse(
    JSON.stringify(result).replace(
      /\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}/g,
      "[disposable password hash omitted]"
    )
  );
}
