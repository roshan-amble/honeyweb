# Honeyweb

**A connected synthetic environment that evolves with your application's source.**

Honeyweb scans an authorized TypeScript/Express snapshot, asks Meta to design a branching deception graph, and serves related synthetic records behind disposable credentials. A second Meta-driven explorer receives only an entry URL and HTTP observations. It discovers links, chooses requests, and checks whether related data and exports agree. Source changes expose stale decoys; validated regeneration restores consistency.

Local prototype for the Meta Global AI Developer Hackathon. Public code; no hosted production service. The original live Meta generation passed [this workflow](https://github.com/roshan-amble/honeyweb/actions/runs/41118808357). The expanded v0.2 [live Meta evaluation passed](https://github.com/roshan-amble/honeyweb/actions/runs/41141387002): two real generations and twelve independent explorer decisions. [Full redacted evidence](docs/meta-evaluation.json) is committed.

## Run

Requires Node.js 24+.

```bash
git clone https://github.com/roshan-amble/honeyweb.git
cd honeyweb
npm ci --ignore-scripts
npm run build
npm start
```

Open **http://127.0.0.1:4310**. Synthetic decoys listen at **http://127.0.0.1:4311**. Both listeners are loopback-only. The workspace starts in explicit offline mode, with seven endpoints across `Customer`, `Order`, and `Invoice`.

Choose **Explore** to run the deterministic link-following baseline. It makes real HTTP requests without receiving the source or graph. Offline generation and exploration never call a model.

## Use Meta

```bash
cp .env.example .env
# Set MODEL_API_KEY in .env with your editor, then restart the server.
npm start
```

Select **Meta model** under Plan generator and **Generate & deploy**. Select **Meta explorer** under Independent explorer, then **Explore**. These are separate model roles, explicitly selected. The GitHub Actions secret is available only to the manual workflow; it does not populate a local `.env`.

Meta's OpenAI-compatible `https://api.meta.ai/v1/chat/completions` API supplies structured JSON. Default model: `muse-spark-1.3`; override with `META_MODEL`. The generator sees extracted routes, interface or Prisma scalar fields, and supported references. It chooses entity coverage, endpoint names, graph links and rationale. The dashboard explorer sees only response observations and the remaining discovered links, with decoy credentials redacted; it chooses the next HTTP action. No model output becomes executable code. Errors never silently switch to offline mode.

Only metadata, not source bodies, literals or comments, is sent for generation. Metadata may still be confidential. Explorer observations include synthetic response samples; its HTTP tool retains the disposable credential locally. Use only source you are authorized to scan and share with Meta.

## Demo flow

1. Generate from **v1**. Inspect the branching graph and shared `Customer → Order → Invoice` references.
2. Explore. Inspect observed paths, action summaries, discovery depth, consistency checks and correlated demo traffic.
3. Select **v2**, then **Scan**. `Customer` becomes `Account`, `Order.customerId` becomes `accountId`, and invoices gain `dueDate`. Three old collection schemas fail validation.
4. Generate again. The candidate must pass schema and referential checks before deployment. All credentials rotate; the dashboard preserves the failing-before / passing-after report.
5. Explore again. Confirm related records and exports remain consistent after the source change.

Generation is a full atomic replacement, not a partial production hot patch. Affected-node reporting identifies the impact; it does not claim incremental regeneration or automatic file watching. Sessions are in memory. Exports share the exact collection records and change the session's export state to `downloaded`.

## Use an authorized custom snapshot

```bash
npm run scan -- /absolute/path/to/source
npm start -- --source /absolute/path/to/source
```

The startup argument authorizes one custom source root. Select **Custom source · rescan** to pick up edits, then generate and explore through the same dashboard. The browser API cannot choose arbitrary filesystem paths. For a plan-only CLI:

```bash
npm run generate -- /absolute/path/to/source --offline
npm run generate -- /absolute/path/to/source
```

Scanner scope: literal Express routes, chained mounts, relative default router imports, and TypeScript interface fields or Prisma scalar models. Prisma models take precedence over DTO interfaces when present. Explicit single-field Prisma references to `id` are extracted; interface references use conservative `<Entity>Id` conventions. Dynamic mounts, named router exports, imported types, implicit many-to-many relations, composite keys and application behavior are not resolved. Scanning never executes the application. Use a stable checkout; hidden files, symlinks, dependency/build directories and declaration files are skipped. Up to six entity collections and thirteen nodes fit a plan. Larger or unsupported schemas may require a narrower snapshot; unresolved complex fields are `null`.

## Verify and evaluate

```bash
npm run check
npm run evaluate -- --output=offline-evaluation.json
# Real Meta generation and independent exploration of both fixtures:
npm run evaluate -- --meta --output=meta-evaluation.json
```

The evaluation runs both versions, checks drift before regeneration, then compares the explorer with a deliberately simple static baseline using the same 12-request budget. It records observed paths, depth, consistency checks, latency and actual token usage. Dollar cost is not estimated. Model choices and latency vary.

[Committed offline evidence](docs/offline-evaluation.json): 7/7 reachable endpoints discovered, three entities, three exports, five observed consistency checks, zero failures for each version; three schema failures before regeneration and zero after. The live Meta run also discovered seven endpoints and passed five observed checks in each version, with discovery depth 3 before and 2 after. Exploration took 19.4s and 20.4s respectively. The flat static baseline exposes one collection and no further links. This is a **single-run fixture simulation** showing connected behavior, not evidence of real-attacker engagement, deception credibility or improved detection. A zero-failure result with zero checks is not evidence of consistency.

The manual **Live Meta smoke test** workflow uses the existing encrypted `MODEL_API_KEY` Actions secret. It runs ordinary checks, two Meta generations and at most 22 explorer decisions (24 model calls total), then uploads a redacted synthetic-fixture JSON report. Ordinary CI never uses the key.

Tests exercise the AST boundary, graph and relationship validation, mocked Meta contracts, real HTTP authentication and state, response-only exploration, redaction, request bounds, same-origin isolation, custom-source rescanning, and atomic regeneration.

## Existing-application case study

[RealWorld case study](docs/case-studies/realworld.md) adds a pinned external Express/Prisma source, an actual-app PostgreSQL lab, raw-HTTP discovery starting from a homepage, a matched connected baseline, repeated trials and controlled schema migration. The manual **RealWorld application case study** workflow runs it with the existing Meta secret. It uses a separate decoy process without model or database credentials. See the case study for its protocol, evidence and limits.

## Components and boundaries

| Component | Responsibility |
| --- | --- |
| `src/scanner.ts` | Bounded local AST extraction and metadata drift |
| `src/plan.ts`, `src/data.ts` | Declarative graph validation, synthetic shared data and consistency checks |
| `src/meta.ts` | Bounded structured Meta API calls, no silent fallback |
| `src/explorer.ts` | Response-only exploration, constrained GET tool, observed consistency checks |
| `src/runtime.ts`, `src/server.ts` | Stateful decoys and local operator API |
| `web/` | Graph, explorer evidence, telemetry and source-change dashboard |
| `scripts/evaluate.ts` | Reproducible paired fixture evaluation and static comparison |
| `src/routes.ts`, `src/prisma.ts` | Mounted-route and Prisma subset extraction |
| `src/http-auditor.ts`, `src/lab.ts` | Raw-HTTP evaluator and lab gateway with a separate decoy process |
| `scripts/realworld.ts` | Existing-application case study and matched connected comparison |

The ordinary dashboard operator and decoy listeners share a Node process; separate ports are **not** a sandbox. The case-study lab has an actual application and disposable database integration, but no production database/network integration, durable storage, internet exposure, container isolation, SIEM integration or efficacy claim. The event buffer holds 1,000 entries; at most 500 credentials live for 15 minutes or until redeploy. Credential correlation is not personal identity. Unknown traffic is labeled `unclassified`; demo traffic is explicitly marked.

See [security boundaries](SECURITY.md), [demo storyboard](docs/DEMO.md), [submission draft](docs/SUBMISSION.md), and [deliverables](docs/HACKATHON.md). Original implementation began October 28, 2026 Pacific. MIT licensed.

Sources: [Meta API reference](https://dev.meta.ai/docs/api-reference), [structured output](https://dev.meta.ai/docs/structured-output), [participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details).
