import { test } from "node:test";
import assert from "node:assert/strict";
import { publicObjectiveEvidence } from "../src/objective-evidence.ts";

test("public evidence retains scoring IDs while dropping record contents and password hashes", () => {
  const password = "$2b$10$" + "A".repeat(53);
  const report = {
    trials: [
      {
        actions: [{ reason: password }],
        observations: [
          {
            path: "/files/user-batch.json",
            status: 200,
            body: JSON.stringify({
              entity: "User",
              kind: "export",
              count: 1,
              records: [
                { id: 17, email: "fictional@example.invalid", password },
              ],
            }),
          },
          {
            path: "/api/articles",
            status: 200,
            body: JSON.stringify({
              articles: [
                { slug: "public-slug", body: "fictional private body" },
              ],
              articlesCount: 1,
            }),
          },
          {
            path: "/",
            status: 200,
            body: "<html>unnecessary page contents</html>",
          },
        ],
      },
    ],
  };
  const saved = publicObjectiveEvidence(report),
    text = JSON.stringify(saved);
  assert.doesNotMatch(
    text,
    /fictional@|fictional private body|unnecessary page|\$2b\$/
  );
  assert.deepEqual(JSON.parse(saved.trials[0].observations[0].body), {
    entity: "User",
    kind: "export",
    count: 1,
    records: [{ id: 17 }],
  });
  assert.deepEqual(JSON.parse(saved.trials[0].observations[1].body), {
    articlesCount: 1,
    articles: [{ slug: "public-slug" }],
  });
  assert.equal(saved.trials[0].observations[0].bodySHA256.length, 64);
  assert.deepEqual(publicObjectiveEvidence(saved), saved);
  assert.ok(report.trials[0].observations[0].body.includes(password));
});
