# RealWorld application case study

This case uses the existing [RealWorld Express/Prisma reference backend](https://github.com/gothinkster/node-express-realworld-example-app/tree/30b68e1e881462b2f4164ea09ab4c4f5699c7b0b), pinned at `30b68e1e881462b2f4164ea09ab4c4f5699c7b0b`. Its package manifest declares MIT. Honeyweb fetches the checkout; it does not vendor the application.

## What changed

Before adaptation, Honeyweb saw 20 route declarations but only **1/20 exact mounted paths**: nineteen lacked their `/api` prefix. It found eight TypeScript DTO/helper interfaces and no relationships. The [recorded manifest](../../case-studies/realworld/manifest.json) preserves that measurement and a manually reviewed mounted-route inventory. The [original scan output](realworld-before-scan.json) is retained.

The scanner now follows relative default router imports and chained literal mounts. It reads Prisma scalar models and explicit single-field references to `id`. On this source it resolves **20/20 paths, four models (Article, Comment, Tag, User), and three references**: Article.authorId → User.id, Comment.articleId → Article.id, Comment.authorId → User.id. Nine inverse or implicit relation fields are explicitly omitted. When Prisma models exist, they replace TypeScript DTOs as the chosen entity inventory.

This is an adapted case study, not held-out validation: we inspected the application and added parser support for its patterns. The manually reviewed route inventory checks extraction; it is not a complete API conformance suite.

## Protocol

- Start the pinned backend and its migrations against a disposable PostgreSQL database. Register a synthetic account through its API, create an article and comment, and mark that account as a demo author so public reads include it. No real records or production database are used.
- A lab gateway adds a homepage and `/docs`. Its `/api/*` reads reach the actual application; `/archive/*` reaches the separate decoy process. The documentation links to the archive. These entry surfaces are lab-authored additions, not upstream vulnerabilities or features.
- The Meta HTTP evaluator starts with **only `/`**. It sees raw HTML/JSON/text, its own request history, and credentials it has observed. It receives no source, route list, graph, suggested path candidates or condition label. It can choose bounded local GET paths, including guesses. It is explicitly tasked to explore archive/integration surfaces; this is not an unsolicited attacker test.
- Compare the Meta-generated graph with a deterministic, source-derived connected graph. Both use the same four entities, export inventory, synthetic records, renderer, gateway and 16-GET budget. Paths and topology may differ. Randomize order within each of two blocks, giving two fresh trials per condition. The same Meta model supplies both roles, with separate conversations.
- Add `Article.moderationStatus String @default("pending")` in the disposable Prisma schema, update the article response mapper, push the change to the disposable database and regenerate its Prisma client. Confirm the actual API exposes the new field. Audit stale decoys, regenerate Honeyweb, audit again and run one fresh HTTP discovery trial.
- Preserve full redacted observations, stop reasons, token usage and partial coverage. An execution pass means the integration assertions passed; it does not imply the evaluator found every endpoint or that Meta beat the baseline.

The maximum is two Meta generations plus 75 HTTP decisions. Stop decisions also consume calls. Dollar cost is not estimated. No retrial is performed to select a better model result.

## Reproduce

The manual **RealWorld application case study** Actions workflow provisions PostgreSQL, fetches the exact upstream commit, installs locked dependencies with lifecycle scripts disabled, runs checks, explicitly generates Prisma's client, and runs the case. Only the evaluation step receives `MODEL_API_KEY`. The application and decoy child processes receive restricted environments without that key; the decoy also receives no database credentials. Artifacts include failures and expire after 14 days, so the completed redacted report is committed separately.

For a source-only rehearsal without Meta or PostgreSQL:

```bash
git clone https://github.com/gothinkster/node-express-realworld-example-app.git /tmp/honeyweb-realworld
git -C /tmp/honeyweb-realworld checkout 30b68e1e881462b2f4164ea09ab4c4f5699c7b0b
npm run case:realworld -- --upstream=/tmp/honeyweb-realworld --output=realworld-offline.json
```

The script requires a clean pinned checkout and restores edited source files afterward. The offline rehearsal does not start the upstream API; its `/api` requests return 404 and its text-link follower is not model evidence. For the live mode, use the workflow or install the upstream lockfile with `npm --prefix /tmp/honeyweb-realworld ci --ignore-scripts`, provision an expendable local `honeyweb_case` PostgreSQL database, set `DATABASE_URL` and `MODEL_API_KEY`, then add `--meta --start-upstream`. The live run changes that test database; discard it afterward.

## Limits

The scanner does not reproduce upstream behavior, nested API serializers, nullable semantics, constraints or many-to-many relationships. Decoys expose synthetic flat Prisma scalar rows, including obviously synthetic values. A schema check is not semantic realism. The ordinary dashboard retains its earlier structured-link explorer; the stronger raw-HTTP evaluator is currently a case-study command.

The lab gateway is a controlled integration, not a deployable reverse proxy. Separate processes and credential filtering do not provide an OS sandbox or network egress firewall. No production traffic, external participants, detection efficacy, persistent storage, automatic source watching, alert delivery or statistical superiority has been demonstrated.

## Results

Local validation: 21 tests and the production build pass. The offline source-only rehearsal reaches all nine deterministic endpoints, all four exports and seven observed consistency checks. The dashboard also renders this custom source on desktop and mobile with no JavaScript errors or page overflow; all 11 schema/reference checks and seven observed offline checks pass.

The live comparison used an eight-endpoint Meta plan (four collections, three exports) and an eight-endpoint connected baseline with matching inventory. All four trials used a fresh `muse-spark-1.3` HTTP evaluator with a 16-GET budget.

| Condition | Trial | Decoy endpoints | Collections | Exports | Observed checks / failures | GETs | Successful GETs | Exploration time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Connected baseline | 1 | 8/8 | 4 | 3 | 6 / 0 | 14 | 12 | 71.1s |
| Meta-generated | 1 | 6/8 | 4 | 1 | 4 / 0 | 16 | 10 | 127.7s |
| Meta-generated | 2 | 4/8 | 2 | 1 | 1 / 0 | 16 | 9 | 143.3s |
| Connected baseline | 2 | 8/8 | 4 | 3 | 6 / 0 | 13 | 12 | 96.5s |

This table follows the randomized execution order. Both generated-graph trials exhausted the budget; both baseline trials chose to stop. Successful GETs include homepage/docs and real application responses as well as decoys. Zero observed failures does not establish consistency of unvisited collections or exports. Latency includes model deliberation and HTTP time; it is not a measurement of attacker time lost.

**The generated graph did not outperform the connected baseline on this discovery task.** Both conditions serve records from the same deterministic runtime. These results demonstrate an integration and reveal a discovery limitation; they do not establish that Meta improves deception. Two trials on one adapted reference app are too few for a general efficacy or statistical claim.

The initial run completed successfully on [implementation commit 56a4acf](https://github.com/roshan-amble/honeyweb/commit/56a4acfc164c1d8a92c37a198f8ae85a65b38a60), with [workflow 41222957171](https://github.com/roshan-amble/honeyweb/actions/runs/41222957171) and [full initial evidence](realworld-evaluation-initial.json). The actual API returned the migrated `moderationStatus: "pending"` field. Stale decoys failed one Article schema check; regeneration restored all 11 checks. The subsequent HTTP trial reached only 3/8 endpoints and performed **zero** observed consistency checks, so it provided no response-only consistency evidence after regeneration.

### Follow-up revision

The original traces expose two concrete defects. The generator produced fixed paths containing `slug`, `id` and `username`, which resembled parameter templates; the evaluator substituted record values and received 404s. It also sometimes dropped Authorization after an unauthenticated request, then lost the original credential when the raw observation window advanced beyond eight responses. The baseline had occasional 401s too.

The follow-up explicitly defines collections and exports as fixed GET URLs and batch snapshots, rejects path segments copied from source parameter names, and retains only credentials the evaluator has already submitted from observed responses. Credential memory does not automatically attach a header, parse a response convention, supply paths or bypass provenance checks. Both conditions use this same revised evaluator. Two regression tests cover these failures. We will run one fresh comparison and keep the original evidence; it is a development rerun after inspecting failures, not an independent replication.
