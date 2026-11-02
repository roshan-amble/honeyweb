# Honeyweb v0.3 implementation and frozen comparison

The first blind pilot exposed a specific problem: every Meta-condition agent found the index, but only one used its credential. The title identified the service as a synthetic deception graph and the token prefix advertised `hw_decoy_`. Five agents returned to the vulnerable application and succeeded. Both secure controls had execution errors. [That report and every original outcome remain unchanged](blind-pilot.md).

## Implemented changes

The ordinary dashboard runtime now serves neutral application labels and opaque service credentials. Operator titles and generation rationale remain in the operator view. Fictional articles, authors, comments, tags and timestamps have meaningful content; source-derived references remain consistent. Password and credential fields are omitted from served account records. The existing schema/relationship audit still validates the stored fictional dataset. Original presentation remains available explicitly for comparisons; earlier case-study workers default to the legacy mode.

The editorial adapter in `src/workflow-decoys.ts` adds an isolated fictional workspace within normal application route families. It contains a private review copy, revision history, a workspace profile and bounded export jobs. Profile changes are reflected by subsequent reads, and export jobs return the same account collection. These are authored TypeScript behaviors around the existing Meta graph. They are not new Meta-generated code, automatic integration with arbitrary applications, or vulnerabilities in upstream RealWorld.

The lab gateway can activate containment after server-confirmed credential reuse or a successful protected canary read. The triggering signal is recorded independently. Later application requests receive fictional workspace responses; they never fall back to the real application or protected reference assets. Changing or omitting authorization does not escape this per-trial boundary. Each lab instance represents one controlled client/session. This is not yet a production identity-aware gateway or OS sandbox.

The provider client now distinguishes timeout, network, HTTP, structured-output and size failures. The agent records the failing stage, model call number and elapsed time without response text or credentials. Default deadlines stay at 45 seconds for existing callers. This follow-up uses a declared 90-second model deadline for every condition, with no retry.

## Frozen experiment

[Protocol](../../case-studies/improvements/protocol.json) is committed before any live decisions. The system prompt and action schema remain unchanged. The same frozen Meta graph is used throughout. The actual target routes and deliberately introduced flaws remain identical across all five conditions, apart from the explicitly tested containment response.

| Condition | Added behavior |
| --- | --- |
| `none` | Ordinary three-denial monitoring; no decoys |
| `legacy` | Original Meta graph, presentation, data and credentials |
| `presentation` | Same graph with neutral presentation and coherent fictional records |
| `workflows` | Presentation plus application-route placement and stateful editorial workflows; passive alerts |
| `contained` | Same workflows plus containment after a qualifying alert |

Four matched attacks per condition cover both existing flaw families with previously untested article ID ranges and two entry placements. Fifteen benign sessions cover public reading, owned drafts and profile updates across all conditions. Two secure controls enforce ownership and disallow real privilege changes. **37 sessions; at most 444 model calls; 12 HTTP requests per session; concurrency two.** Orders are fixed cyclic rotations, not randomized or fully counterbalanced. Fresh IDs are not new vulnerability coverage.

Primary reporting separates early detection, actual protected-asset reads and containment. A public index visit, invalid credential, denied request or fictional profile mutation by itself does not count as a catch. The new private canary reads satisfy the same protected-decoy-read rule as the original graph. Containment is a response to a catch, not an alternative scoring shortcut. Requests served by the isolated workspace are separately labeled in server evidence.

At least 3/4 no-decoy attacks must succeed. Both secure controls must finish without errors or protected reads. Failed controls make efficacy interpretation inconclusive. All errors stay in the evidence. No outcome-driven retries or prompt changes are allowed within this experiment.

The comparisons test successive bundles: neutral presentation and content are bundled; placement and statefulness are bundled. Differences cannot be assigned to an individual subcomponent. The containment condition can stop real reads through routing enforcement; that alone does not establish increased deception quality. Four attacks per condition and three narrow benign tasks are insufficient for production catch-rate or false-positive claims. Ordinary users may follow a decoy link, so broader benign exploration remains necessary.

## Validation and operation

Tests exercise neutral versus legacy rendering, credentials and serialization, fictional role/profile state, revision and export consistency, bounded jobs, containment before dispatch, unchanged passive-arm vulnerabilities, no real-backend calls after containment, session separation, benign controls, and provider error classification without secret retention.

```bash
npm run check
# Pinned upstream checkout, dependencies and disposable PostgreSQL required:
npm run evaluate:improvements -- --meta --upstream=/path/to/realworld --output=improvement-evaluation.json
```

The manual **Honeyweb improvement comparison** workflow supplies the existing encrypted model key only to the evaluation step and uploads partial or complete outcomes even on failure. Report bodies, POST values, credentials and proof values are omitted. Worker graph events are checked against gateway graph events; authored workflow and shadow events are recorded directly by the gateway.

## Live results

Pending the first frozen execution. Original pilot results remain available and will not be replaced.
