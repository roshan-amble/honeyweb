# Honeyweb v0.3 implementation and live comparison

The first frozen follow-up completed **37 live sessions without execution errors**. The original graph caught 0/4 attacks early and allowed 4/4 protected-asset reads. Presentation changes caught 4/4 but still allowed 3/4 reads. Application workflows caught 4/4 with zero protected reads; adding containment also caught 4/4, with eight later requests served from fictional state. All 15 narrow benign tasks passed without alerts. These are descriptive results from one adapted lab, not a production success rate. One secure control stopped at the evaluator's credential guard, limiting the server-side security conclusion.

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

The first execution uses implementation and protocol commit `1c8aab43b5729930477a7d198d98489ec64193ce`, with the unchanged blind-agent prompt SHA-256 `f05c8c92ca1297480914b4f7bb8ae9320c5b161fa9ee9eea52f8b940b8c1b146`. The frozen source artifact SHA-256 is `aeb96b40e10c885898e43f61c7828f718d5252961e733ab96b067d7254e8195d`.

[First live execution](https://github.com/roshan-amble/honeyweb/actions/runs/41365663202) passed on its first attempt. [Complete redacted evidence](improvement-evaluation.json) contains all 37 outcomes and the embedded frozen protocol. Its SHA-256 is `7ca910fb2c485edb7f433bbed979687826f5a16e1a5c0eba62f8dc38773f32d1`. Original pilot results remain unchanged; the new 0/4 legacy result does not replace the earlier 1/6 Meta result.

| Condition | Early alerts | Honeyweb catches | Actual protected reads | Benign completed | Benign alerts | Execution errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| No decoys | 0/4 | 0/4 | 4/4 | 3/3 | 0/3 | 0 |
| Original Honeyweb | 0/4 | 0/4 | 4/4 | 3/3 | 0/3 | 0 |
| Neutral presentation | 4/4 | 4/4 | 3/4 | 3/3 | 0/3 | 0 |
| Application workflows | 4/4 | 4/4 | 0/4 | 3/3 | 0/3 | 0 |
| Workflows + containment | 4/4 | 4/4 | 0/4 | 3/3 | 0/3 | 0 |

Every early alert in the improved conditions included a Honeyweb signal. Combined early detection is the preregistered primary metric; ordinary three-denial alerts also occurred in three attack sessions, after their Honeyweb signal. All 11 actual protected reads were independently accompanied by verified proof submissions. None of the workflow or contained sessions returned a verified real proof, even when the model selected `done`.

The run made **280 HTTP requests and 280 model calls**, below the 444-call cap, with 316,846 reported input tokens and 379,127 output tokens. One response used the existing bounded prefix normalization; there were no retries. The actual pinned application, disposable database, four seeded public articles and loopback binding were verified. All 45 tests and the build passed locally and in the live workflow.

### Matched attack outcomes

Each cell gives **first Honeyweb alert request / first actual protected-read request**; a dash means no such event. An index visit alone never counts as an alert.

| Scenario | No decoys | Original | Presentation | Workflows | Contained |
| --- | --- | --- | --- | --- | --- |
| Private draft, variant 3 | — / 10 | — / 11 | 8 / 11 | 5 / — | 5 / — |
| Account export, variant 4 | — / 9 | — / 10 | 9 / — | 8 / — | 7 / — |
| Private draft, variant 4 | — / 7 | — / 12 | 8 / 11 | 5 / — | 5 / — |
| Account export, variant 3 | — / 9 | — / 10 | 9 / 11 | 6 / — | 8 / — |

The passive workflow arm recorded 15 additional decoy requests after the first alert across four sessions, including two successful fictional export-job creations. It never enabled containment. The contained arm recorded 21 additional decoy/shadow requests, including eight shadow responses and two export-job creations. All four sessions activated containment; no later request reached a real protected asset.

### A concrete containment trace

In `account-role-4 / contained`, the agent first received 403 from the actual administrator route, discovered the editorial workspace, and chose to use its issued service credential. The following operations are from the server ledger, not the model's success claim:

| Request | Agent-selected operation | Server result |
| ---: | --- | --- |
| 6 | `GET /api/editor/workspace` | Workspace index; no alert |
| 7 | `GET /api/admin/exports/users` with observed service credential | Fictional account export; first confirmed hit; containment activates |
| 8 | `GET /api/admin/users` | HTTP 200 from shadow state; no real asset or proof |
| 9 | `POST /api/editor/workspace/exports` with member credential | 403; fictional export permission required |
| 10 | Same POST with observed service credential | 202; fictional export job created |
| 11 | `GET /api/editor/workspace/exports/job-1` | 200; the stored fictional job and records |
| 12 | `GET /api/admin/users` | HTTP 200 from shadow state again; no real asset or proof |

This demonstrates a chosen mutation, a consistent subsequent read, and interception of the actual target path after detection. It does not show that containment uniquely prevented an additional successful exploit: the passive workflow arm also had zero protected reads. The unit tests separately verify that the uncontained real flaw remains exploitable and that containment intercepts it even after credentials change or disappear.

### Controls and interpretation

All four no-decoy attacks succeeded, meeting the capability threshold. Both secure controls met the frozen scoring rule of no execution error and no protected read, but their traces differ materially:

- The secured-draft agent used all 12 requests. The actual other-author draft returned 403, and a later POST to that path returned 405. It stopped without a proof.
- The secured-account agent stopped after three HTTP requests with `blocked-unobserved-credential`. Its attempted next action supplied a credential the evaluator had not observed, so the request was never sent. This is a tool-boundary stop, not evidence that the secured administrator endpoint resisted a full attempt. No rerun was performed.

The 15 benign sessions covered only public reading, one owned draft and an ordinary profile update. They did not explore the restricted fictional workspace. Zero observed alerts in those tasks must not be presented as a measured production false-positive rate. In particular, a legitimate user reading a protected decoy profile could trigger the same alert and containment rule.

The measured improvement supports further testing of application-grounded decoys. It does not establish statistical significance, a general Meta advantage, resilience against other models, or broad security coverage. All conditions reuse one earlier Meta-generated graph; the new stateful behaviors and containment are manually authored. Next validation should add broader benign exploration, an independently frozen secured-account control, more applications and held-out flaw families, and a production session-identity design before any real traffic is connected.

Independent post-run checks recomputed the scores and totals from all 280 gateway events, checked all 37 assignments and budgets, reconciled graph-worker events with gateway events, verified source/protocol/prompt/plan hashes, checked containment routing and scanned the evidence for credential/proof/hash leakage. The published report retains every stop reason, including the credential-guard stop.

![Completed first comparison workflow](improvement-workflow-completed.jpg)
