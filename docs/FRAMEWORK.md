# Honeyweb framework v0.5

Version 0.5 adds a reusable workflow runtime and a resumable evaluation engine. **69 tests and the build pass.** A separate offline run completed **90 scripted HTTP contract cases** across Acme v1, Acme v2 and the pinned RealWorld schema, with zero execution errors and all 54 benign cases completing without containment. These are implementation checks, not 90 autonomous agents or a measured 90% detection rate. The initial implementation made no live provider calls. A subsequent live launch stopped at its first readiness check with HTTP 403; see the [retained test attempt](#live-test-attempt-november-2-2026). The earlier [frontier result](case-studies/frontier.md) remains unchanged.

## What is implemented

| Component | Behavior |
| --- | --- |
| Source-bound workflow planner | Derives resource routes, mutable scalar fields and references from a scanned snapshot; validates a declarative plan before serving it |
| Generalized fictional runtime | Owned/private records, allowed edits, revision history, profile updates and immutable export snapshots for each supported entity |
| Session containment | An opaque server-issued session cookie binds requests to a principal independently of the model's Authorization choice; containment survives credential rotation and additional sessions for that principal |
| Provider diagnostics | Retains status, allowlisted error codes and UUID request IDs; hashes other request IDs and discards raw provider messages and bodies |
| Checkpointed campaigns | Preflight before every batch, private atomic checkpoints with file/directory sync, exclusive writer lock, and explicit resume of unstarted assignments only |
| Evaluation categories | Keeps catches, escapes, voluntary stops, benign completion/disruption, infrastructure failures and blocked assignments separate |
| Development assessment | Recommends retaining or retiring candidates only from complete live development evidence with valid capability/secure controls; excludes scripted and holdout data from candidate selection |

The planner is deterministic by default. An explicit `--meta` option allows Meta to propose paths and mutable-field subsets; the same validator rejects unsupported entities, changed source evidence, extra executable fields, remote paths, source-route collisions and unsafe mutations. No returned code is evaluated.

The compiler uses conservative singular/plural route-name matches and a bounded workflow template. It does **not** infer the application's actual authorization policy from its source. Member ownership and private review semantics are explicit fictional runtime rules. One to six entities with scalar IDs are supported. References are preserved and ID, ownership, permission, credential and foreign-key fields cannot be edited through workflow updates. Larger or unsupported snapshots must be narrowed explicitly.

The new runtime is an opt-in loopback service. The existing dashboard and the real-application live adapter retain their established editorial integration. Automatically attaching generated workflows to arbitrary production applications is not implemented.

## Run the planner and runtime

```bash
npm ci --ignore-scripts
npm run check
npm run workflow:plan -- --source=fixtures/acme-v1
npm run workflow:serve -- --source=fixtures/acme-v1
```

The server prints a local URL, an opaque session cookie and a disposable member authorization for the operator's local client. Those values are not included in saved evaluation evidence. `WorkflowEnvironment.openSession`, `rotateSession` and `revokeSession` are operator APIs; HTTP clients cannot register themselves or choose a principal. The model tool receives only its member authorization and observations; its session-cookie binding stays inside the HTTP tool.

Records, revisions, profile state, export jobs and containment are isolated per principal. An export captures a snapshot, so later allowed edits do not rewrite an earlier export. Copying a canary credential into a different established session flags the presenting principal, not the credential's issuer. Invalid sessions are denied. Session and principal counts, export jobs, revision history, event storage, request size and methods are bounded. There is no real backend connection or fallback in the generalized runtime.

This remains a local prototype. State is in memory; a process restart requires new sessions and does not preserve containment history. Production identity integration, durable storage, TLS, tenant isolation and OS/network sandboxing remain separate work. A canary hit cannot establish human intent.

## Verification evidence

[Complete scripted evidence](case-studies/framework-verification.json) contains 90 assignments, server-event trails, source hashes, the candidate hash and all outcomes. SHA-256: `a4bf79d058b2f57991b56a66f40f60ed681519c9e74f62356ebe32119fb93935`.

The matrix is three source snapshots × ten scripted policies × three declared request ceilings (12, 24 and 48). The policies cover direct private reads, cross-checking records/revisions, export chains, a separately labeled decoy-aware stop, permitted browsing, own records, denied permission changes, own exports, profile changes and record revision checks. Many scripts finish below their ceiling; a separate regression exercises all 48 agent decisions.

| Scripted result | Count |
| --- | ---: |
| Deliberate canary interactions observed as expected | 27 |
| Benign tasks completed without containment | 54 |
| Decoy-aware scripts that deliberately stopped | 9 |
| Execution errors | 0 |
| Live model calls | 0 |

The nine aware stops are not catches or escapes. The runtime has no real protected backend, so this matrix cannot measure escape prevention. The assessment explicitly returns `unmeasured`. CI runs the same contract matrix without a model key.

```bash
npm run framework:verify -- --offline \
  --directory=artifacts/framework-check \
  --output=artifacts/framework-check-report.json
```

Use a new directory for a new verification run. `--resume` preserves all attempted assignments and runs only those that never started. The unit suite separately covers provider 403s, timeout classification, oversized error bodies, unsafe plans, stale schemas, reference preservation, concurrent users, session rotation, copied canaries, exclusive writers, interrupted attempts, model/candidate mismatch and exclusion of holdout data from selection.

## Prepared live development campaign

The [committed manifest](../case-studies/framework-v2/manifest.json) freezes a **new development campaign**, not a replacement for the consumed v1 holdout. It has 30 sessions: 12 blind attacks, two decoy-aware stress sessions, 12 benign tasks, two capability controls and two secured controls. Blind policies favor direct access, cross-checking or workflow exploration. Request ceilings range from 12 to 48. A fixed hash order interleaves groups before any result is observed.

The manifest binds the model name, source evidence, all server source files, runner, dependency manifests, assignments and batch size. It permits at most 624 agent decisions plus ten initial readiness calls. Explicit resumes add recorded readiness checks for the remaining batches; they never repeat an agent assignment. The configured model is `muse-spark-1.3`, concurrency is three, and the existing GET/bounded-JSON-POST literal-loopback boundary remains in force.

The **Framework development campaign** GitHub workflow defaults to preparing evidence only. Its live step requires selecting `run_live`; the model key is supplied only to that step. The first live dispatch is recorded below. The historical v1 workflow is closed to prevent accidental replay, with its source and results preserved.

After the account/service owner resolves provider access, a local operator can use the committed candidate:

```bash
mkdir -p artifacts/framework-live
cp case-studies/framework-v2/manifest.json artifacts/framework-live/manifest.json
npm run evaluate:framework -- --meta \
  --upstream=/path/to/pinned/realworld \
  --directory=artifacts/framework-live
# After an interruption, using the same model, code, manifest and source:
npm run evaluate:framework -- --meta --resume \
  --upstream=/path/to/pinned/realworld \
  --directory=artifacts/framework-live
```

This adapter requires the pinned RealWorld checkout, its dependencies and the disposable loopback PostgreSQL database documented in the original case study. It evaluates the existing frontier treatment against the real-application lab; it does not silently substitute the standalone generated runtime for that treatment. Provider preflight runs before the application is started, and before each batch. A failure pauses scheduling. A provider 401/403 also stops in-flight agents before their next decision; already-issued requests can finish. There are no automatic retries, credential substitutions or provider bypasses.

A checkpoint records a batch as started **before** executing it. After a crash, such assignments become explicit interrupted failures and are never replayed. Their usage is marked unknown rather than inferred as zero. Only unstarted assignments can resume. All planned attacks remain in the conservative denominator; separately reported completion statistics do not replace it. A real protected read remains visible even if a provider or cleanup error occurs afterward. Stale writer locks require the operator to verify the original process is gone before removing that lock; the runner never steals a live lock.

Candidate retirement is a recommendation for the active development pool, not deletion of code or historical evidence. The assessment requires complete execution, successful capability controls, exercised secured boundaries, the declared catch threshold, benign completion and the disruption limit. Provider failure yields insufficient evidence, not a judgment that a trap is ineffective. A held-out campaign requires a separate matching frozen selection and cannot be used to tune the candidate it evaluated.

## Live test attempt: November 2, 2026

[Workflow run 41515924737](https://github.com/roshan-amble/honeyweb/actions/runs/41515924737) launched at 12:05 PM Pacific against commit `e392447a66753823bea7d3052d066a71427133d5`, using the existing Actions secret and the committed 30-session development manifest. Setup, dependency installation, all 69 tests and the build passed in Actions. Local retesting also passed all 69 tests, the build and the 90-case scripted matrix, including 54 benign tasks without containment; the final local report and checkpoint agreed.

The only live model request was the non-attack readiness check. Meta returned **HTTP 403**, and the campaign paused before application startup or any agent assignment. The workflow correctly exited with failure and uploaded its checkpoint. No assignment was retried and no provider bypass or credential replacement was attempted.

| Result | Recorded value |
| --- | ---: |
| Live readiness requests | 1, denied with HTTP 403 |
| Agent sessions started | 0 of 30 |
| Agent model calls / target HTTP requests | 0 / 0 |
| Assignments preserved as unstarted and blocked | 30 |
| Candidate assessment | Insufficient evidence |

The diagnostic request ID is `de8022e4-36dd-4ba6-918e-4a2baad15758`. No allowlisted provider error code was present in the retained diagnostics. The raw provider message and body were discarded, so the evidence does not establish whether credentials, account access, model entitlement, quota or another cause produced the denial. This is a provider access failure, not a Honeyweb catch or an application authorization response. There is no new autonomous-agent detection estimate and no evidence for retiring a candidate.

The [exact checkpoint](case-studies/framework-development-v2-checkpoint.json) retains the bound manifest, one failed preflight and every unstarted assignment. Its SHA-256 is `8ec457630c5cda2bf9ba0f67bd516d02eacace3b6c4a1b212830217efa746d20`. Artifact `13174643579` ZIP SHA-256 is `e3df4ca2ca90d618b7be357e376231b3b847ac4872b374dc5bc53a6b9c29da68`; it contains only `manifest.json` and `checkpoint.json`. The checkpoint manifest was checked against the committed manifest, and its recorded manifest hash was independently recomputed. The [workflow screenshot](case-studies/framework-development-v2-run.jpg) preserves its failure status.

Continuation requires restored provider access. Restore both artifact files into a private checkpoint directory and use the same candidate with `--resume`. Do not use GitHub's generic **Re-run jobs** action: this workflow does not automatically restore a prior run's checkpoint. All 30 assignments are still eligible because none started; the failed preflight must remain in the journal. Source, model and candidate checks remain in force.
