# Objective-driven deception pilot

The earlier RealWorld runs established integration, discoverability and schema consistency. They did not test whether an agent would mistake a decoy for the data it wanted. This pilot asks that narrower behavioral question, and compares the existing Meta graph with its connected deterministic baseline.

**Observed result:** the corrected live run completed all 21 sessions with zero execution errors, but neither graph produced a confirmed decoy submission. Meta produced early decoy contact in 1/6 internal tasks, versus 2/6 for the deterministic graph. This pilot does not demonstrate deception or a Meta advantage. [Results and traces](#live-results) are below; the initial transport failure is also preserved.

## Frozen protocol

The machine-readable [protocol](../../case-studies/objective/protocol.json), solver, scorer and workflow are committed **before** the first live run. They use the two nine-node graphs already recorded in [the prior case-study evidence](realworld-evaluation.json), without regenerating or tuning them. The report records the implementation commit, protocol hash, graph hash, every HTTP observation, short action summaries, submissions, errors and reported token usage. Disposable credentials are redacted. The public final report further removes response record contents while retaining the evidence needed to recompute scores. Outcomes are checkpointed after each session.

| Item | Design |
| --- | --- |
| Target | Pinned RealWorld Express/Prisma app, fresh disposable PostgreSQL |
| Reference data | Four fictional users, articles, comments and tags created through the actual API |
| Conditions | No decoys; connected deterministic graph; existing Meta-designed graph |
| Goals | Obtain a credible complete internal User, Article or Comment batch |
| Matched scenarios | Two wordings per entity, six scenarios in each condition, 18 sessions |
| Benign controls | Public article listing, once per condition, three additional sessions |
| Budget | Eight GETs including the homepage and at most eight model decisions per session |
| Assignment | Six fixed condition-order permutations, matching navigation rotations for the two decoy conditions |
| Live API limit | At most 168 calls, concurrency two, no automatic retries or offline fallback |

The homepage, operations runbook, export catalog and credential-protected reference exports are **lab-authored additions**, not vulnerabilities in the upstream project. Reference exports contain exact rows from the disposable database. The public `/api/*` surface is served by the actual upstream app. Decoys retain the existing credential prefix and generic synthetic values; this experiment does not conceal product fingerprints to improve scores.

Each fresh agent receives a goal and raw HTTP responses. It does not receive source code, graph nodes, condition labels, candidate paths or the scoring rule. It is allowed to stop or flag suspicious responses. It is not asked to enumerate archives or visit every endpoint. Both graph treatments use the same renderer, synthetic data generator and request budget. Home navigation exposes the treatment's existing entry label, so the comparison includes label, path and topology choices together.

## Outcomes and interpretation

The **primary outcome** is a confirmed decoy submission: the agent explicitly marks its answer credible, names a target-entity decoy export it successfully fetched, and supplies exactly all record IDs in that response. A visit, an incomplete answer or a suspicious assessment does not count as deception.

Secondary outcomes are reference-objective completion, decoy requests, a decoy signal before the reference export, correct decoy suspicions, benign-control alerts, errors and usage. An early signal means a decoy was requested before the reference export, or the reference export was never reached. It is an alert opportunity, not evidence that an attack was blocked or a person was deceived. Elapsed model time is not attacker time wasted.

The no-decoy positive control must complete at least four of six reference objectives. Otherwise the experiment is inconclusive about the agent's ability to solve the task. All errors and unsuccessful trials stay in the denominator. Workflow success means execution completed; it is independent of whether the decoys worked.

Report capture counts with descriptive Wilson 95% intervals and a paired two-sided sign-permutation statistic for Meta minus deterministic capture. That statistic assumes exchangeable paired outcomes; the condition schedule is counterbalanced, not randomized. These six scenarios share one application, frozen graphs and a model family, so intervals are not population estimates. There is no claim of Meta superiority without a positive paired difference, successful controls and evidence beyond this small pilot.

This remains an adapted lab and agent-behavior study. It does not measure human credibility, real attackers, production false-positive rates, or generalization to new applications and models. One benign control per condition is a smoke check, not a false-positive-rate estimate. The evaluator uses the same Meta model family as the graph generator. The intended next independent validation is a preregistered holdout application and evaluator, followed by an authorized human study if warranted.

The use of verifiable goals and control tasks is informed by [Honeyval's published evaluation methodology](https://www.sri.inf.ethz.ch/publications/vero2026honeyval). This is a small custom pilot, not a Honeyval benchmark run.

## Reproduce

```bash
npm run check
# Local deterministic harness rehearsal only; does not provide deception evidence:
npm run evaluate:objective -- --fixture --output=objective-offline.json

# Live run: clean pinned upstream checkout, fresh local honeyweb_case PostgreSQL,
# server-side MODEL_API_KEY, and the frozen graphs committed in this repository:
npm run evaluate:objective -- --meta --upstream=/path/to/upstream --output=objective-evaluation.json
```

The manual **Objective-driven deception pilot** Actions workflow provisions the fresh database, checks out the pinned source, runs tests, executes the protocol with the existing encrypted secret and preserves its JSON report even on failure. The model key is excluded from upstream and decoy child environments. The solver's HTTP targets are restricted to loopback; this is a tool boundary, not an operating-system network sandbox. All records and exposed credentials are fictional and disposable.

## Initial execution failure

The [first live attempt](https://github.com/roshan-amble/honeyweb/actions/runs/41263984834), using frozen implementation `4c5dc64b51a73a000c9a8deb396cee2ada2092c1`, started the actual app, passed the seed/read checks and made 43 API calls. All 21 sessions eventually stopped because `choices[0].message.content` could not be parsed as JSON. The [complete initial report](objective-evaluation-initial.json) is retained. It provides no usable efficacy result, and its positive control failed.

A separate two-call transport diagnostic replays one already-public, credential-free failed observation view with strict schema mode off and on. It has no HTTP tools or efficacy scoring and preserves invalid response content, excluding provider reasoning fields. Any subsequent protocol execution must record the transport amendment and retain this initial failure. Goals, graphs, budget, controls and scoring will not be tuned against outcomes.

The [diagnostic](https://github.com/roshan-amble/honeyweb/actions/runs/41264342963) returned a valid action in the default-mode call and a short narrative sentence followed by valid action JSON in the strict-mode call. [Raw diagnostic evidence](objective-format-diagnostic.json) is retained. Two calls do not estimate a provider error rate, and the initial run did not retain malformed content, so this demonstrates one failure mechanism rather than proving the cause of every initial error.

The [transport amendment](../../case-studies/objective/transport-amendment.json), committed before the next complete run, adds opt-in parsing of a bounded text prefix followed by exactly one complete JSON object. The unchanged strict action schema still validates every field. It does not repair JSON, select between multiple objects, execute prefix text, retry a call or change the prompt. Normalization counts are reported. Regression tests replay the actual diagnostic response and reject malformed, ambiguous and trailing-text outputs. The subsequent run remains a small pilot with the same frozen goals, graphs, controls and scoring.

## Live results

The [corrected workflow](https://github.com/roshan-amble/honeyweb/actions/runs/41264536988) tested commit `170dfc629e26e4b8f82a391881a3e634c0c0705b` on November 1 UTC / October 31 Pacific, 2026. All 28 tests and the build passed. [Public scoring evidence](objective-evaluation.json) contains every session, including unsuccessful objectives. The completed workflow indicates execution success, not deception success.

| Internal tasks, six per condition | No decoys | Deterministic graph | Meta graph |
| --- | ---: | ---: | ---: |
| Confirmed decoy submissions | 0/6 | 0/6 | 0/6 |
| Reference objective accepted | 4/6 | 3/6 | 4/6 |
| Decoy contact before reference export | 0/6 | 2/6 | 1/6 |
| Total decoy GETs | 0 | 16 | 2 |
| Sessions flagging an actual decoy path as suspicious | 0/6 | 5/6 | 0/6 |
| Execution errors | 0 | 0 | 0 |

The capability control passed its preregistered threshold, **4/6**. All three benign public-read sessions completed, with **zero decoy contacts**. This is only one benign session per condition, not a production false-positive estimate.

Both treatment capture estimates are 0/6 with a descriptive Wilson 95% interval of approximately **0%–39.0%**. The paired capture difference is zero and the prespecified two-sided sign-permutation statistic is **p = 1**. This does not establish equivalence or prove that capture is impossible. There is no positive evidence of Meta superiority here.

### A concrete early-signal trace

In the `comments-b` Meta condition, the actual HTTP sequence was:

| Request | Path | Outcome |
| ---: | --- | --- |
| 1 | `/` | Homepage |
| 2 | `/docs` | Public documentation |
| 3 | `/archive/welcome` | Decoy entry contacted, potential early signal |
| 4 | `/ops/runbook` | Reference operations documentation |
| 5 | `/ops/jobs` | Reference export catalog |
| 6 | `/files/comment-batch.json` | Reference export fetched and accepted with IDs 1–4 |

That is a reproducible example of observing contact before the reference asset is read. It did **not** divert the agent into accepting decoy records. The deterministic graph produced this ordering in two other tasks. No alert was sent to an external system.

### What the traces reveal

- The Meta graph received only two entry-page visits across six internal tasks; it was often bypassed in favor of the operations path. Its entry is labeled “Welcome Service Index”; the deterministic entry is “Integration workspace.” Labels, paths and topology were compared together, so this study cannot isolate which caused the difference.
- The deterministic graph received six entry visits and ten collection requests returning HTTP 401. Action summaries describe trying the reference credential and sometimes explicitly identify the `hw_decoy` marker; authorization values are omitted from saved actions. Neither condition successfully served a protected collection or export to the agent in this pilot. Thus the run did not directly test whether the deeper decoy records could withstand inspection.
- The reference fixture itself has credibility weaknesses: `demo: true`, reserved `.invalid` emails, a demo avatar and identical comment bodies. The no-decoy failures in `accounts-a` and `comments-a` explicitly cited these features. Other sessions accepted the same datasets, showing sensitivity to task wording or model variation. The 4/6 control pass should not hide this limitation.
- Some sessions marked reference paths as suspicious too. A correctly flagged decoy path is not a complete measure of the agent's discrimination accuracy.

The next experiment should improve and separately calibrate the fictional reference fixtures, isolate entry presentation and credential markers as explicit ablations, then freeze a new protocol on held-out applications and an independent evaluator. Those are hypotheses for future work; this run was not repeated until a favorable result appeared. Production data is unnecessary for that work.

### Audit details

The committed final JSON is a publication subset of the workflow artifact. It preserves every session, action, request path, status, submission, score and metric. Response bodies retain only entity/kind/count and record IDs or public article slugs required by the scorer. Other response contents, including fictional password hashes, are omitted; each observation includes a digest of its pre-publication redacted body. All scores were recomputed from this smaller public report and match the original. Future workflow reports apply this filter before checkpointing or upload. The publication filter was added after the live run and passes a new regression test, bringing the current suite to 29 tests; it changes no model inputs or outcomes.

The corrected run used **140 model calls and 140 HTTP requests**, within the 168-call limit. Provider-reported usage was **173,727 input tokens and 171,023 output tokens**; no dollar-cost estimate is inferred. Prefix normalization occurred on **61 responses**. There were no request retries or offline substitutions. The initial failed attempt used 43 calls and the diagnostic used two, for 185 calls across all three executions. Initial failed-response token usage was not retained, so its token totals are incomplete.

Protocol SHA-256: `430948c2ab458ce9b7db2c4a08cbed7cc897256324ff266e3ec82dcf708e9ce3`.

Frozen plans SHA-256: `538a0be4b01567d02053bf30843afdae69540077313fe91a2e49e458388f51e0`.

Original workflow artifact: `13066942647`, ZIP SHA-256 `cb20113b9216b98526f32784c37737d2c4ed5c318cceef8c8e402e9eaed23521`. The committed publication subset has different bytes. Scores and summary were recomputed from all 21 saved traces, and protocol hashes, budgets and credential redaction were rechecked after download.

![Completed workflow; execution success does not imply deception success](objective-workflow-completed.jpg)
