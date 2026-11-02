# Three-minute demonstration

## Preparation

Run `npm ci --ignore-scripts && npm run check && npm start`. Configure `MODEL_API_KEY` privately for actual Meta generation and exploration. The GitHub secret does not set a local key. Rehearse both fixture versions. Use the synthetic Acme fixtures or the pinned public RealWorld source; keep keys, `.env` and actual customer code off screen.

The longer evaluation command creates reproducible evidence: `npm run evaluate -- --meta --output=meta-evaluation.json`. A workflow artifact can prove a previous live run, but do not narrate it as a newly executed request. For the existing-application segment, show the committed [RealWorld case study](case-studies/realworld.md) and its live workflow. Keep the smaller fixture for the live three-minute UI sequence; the longer case runner is separate. Use the [frontier final results and containment trace](case-studies/frontier.md#final-results) for the final evidence segment; keep the smaller v0.3 comparison as historical context. The stateful editorial adapter runs in the lab; the ordinary dashboard does not quarantine application traffic.

## Storyboard

| Time | Show | Narration |
| --- | --- | --- |
| 0:00–0:20 | Customer, Order and Invoice source interfaces | “Decoys become easy to recognize when their data disagrees with the application or drifts out of date. Honeyweb builds a connected synthetic environment from an authorized source snapshot.” |
| 0:20–0:50 | Meta generator, branching graph and rationale | “Meta designs this graph from route and schema metadata. The runtime validates every endpoint and reference, then supplies consistent synthetic records. No model-generated code runs.” |
| 0:50–1:30 | Meta explorer and its observed HTTP trail | “This second model gets only an entry URL. It discovers links from actual responses and chooses what to inspect. It has no source or hidden graph. These requests are our labeled simulation.” |
| 1:30–2:05 | Scan v2; highlight three failed schema checks and affected endpoints | “The application changed: customers became accounts, the order reference changed, and invoices gained a due date. Honeyweb shows exactly where the deployed data became stale.” |
| 2:05–2:35 | Regenerate; show before/after checks and explore again | “A candidate must pass consistency checks before replacing the environment. References and exports stay aligned, and old credentials are invalidated.” |
| 2:35–3:00 | Frontier result table and `holdout-attack-55` containment trace | “We expanded to 208 attempted sessions and retained every failure. The final result is 40 valid catches in 100 scheduled attacks; model API access denials invalidated the larger evaluation. Here a canary credential triggers containment before the real export is served. The mechanism works in this trace, but we have not established a 90% catch rate.” |

Edit model waiting time only with a visible “generation time condensed” label. Preserve the observed runtime in the evidence panel. Never describe an offline fallback as Meta output. Keep the final hosted video accessible without a login.

## Recording checklist

- Show the Meta-generated badge and actual explorer provider.
- Include a branch choice, a cross-entity reference and a matching export.
- Show source failure before regeneration and passing checks afterward.
- Distinguish generator reasoning summaries from deterministic runtime constraints.
- Keep the original 1/6 blind result separate from the new matched 0/4 legacy result. The new workflows are authored code around the earlier Meta graph. Do not claim a production 100% catch rate or a proven incremental benefit from containment; the passive workflow arm also had zero real reads.
- Do not turn the 40/40 error-free subset into a 100% efficacy claim. Show the 60 failed attacks in the denominator, invalid controls and the provider errors. The post-run access-denial guard was locally tested, not live-evaluated.
- Close on the public repo and the next gate: restore provider access, then freeze a fresh protocol before new live evaluation.
- Verify final video duration is at most three minutes and its link is accessible.

## Optional v0.5 framework segment

Show `npm run workflow:plan -- --source=fixtures/acme-v1`, then the Acme v2 plan. Explain how the compiler follows entity, field and relationship changes while the runtime supplies records, revisions and export state. The standalone runtime is separate from the existing visual dashboard. Show the [90-case scripted verification](FRAMEWORK.md#verification-evidence) as a functional check, explicitly labeled zero live model calls. The new checkpoint engine preserves failures and resumes only unstarted assignments. Do not replace the actual 40/100 frontier result with the scripted canary count. Live evaluation of v0.5 remains pending provider access.
