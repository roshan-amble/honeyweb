# Three-minute demonstration

## Preparation

Run `npm ci --ignore-scripts && npm run check && npm start`. Configure `MODEL_API_KEY` privately for actual Meta generation and exploration. The GitHub secret does not set a local key. Rehearse both fixture versions. Use only synthetic Acme source; keep keys, `.env` and actual customer code off screen.

The longer evaluation command creates reproducible evidence: `npm run evaluate -- --meta --output=meta-evaluation.json`. A workflow artifact can prove a previous live run, but do not narrate it as a newly executed request.

## Storyboard

| Time | Show | Narration |
| --- | --- | --- |
| 0:00–0:20 | Customer, Order and Invoice source interfaces | “Decoys become easy to recognize when their data disagrees with the application or drifts out of date. Honeyweb builds a connected synthetic environment from an authorized source snapshot.” |
| 0:20–0:50 | Meta generator, branching graph and rationale | “Meta designs this graph from route and schema metadata. The runtime validates every endpoint and reference, then supplies consistent synthetic records. No model-generated code runs.” |
| 0:50–1:30 | Meta explorer and its observed HTTP trail | “This second model gets only an entry URL. It discovers links from actual responses and chooses what to inspect. It has no source or hidden graph. These requests are our labeled simulation.” |
| 1:30–2:05 | Scan v2; highlight three failed schema checks and affected endpoints | “The application changed: customers became accounts, the order reference changed, and invoices gained a due date. Honeyweb shows exactly where the deployed data became stale.” |
| 2:05–2:35 | Regenerate; show before/after checks and explore again | “A candidate must pass consistency checks before replacing the environment. References and exports stay aligned, and old credentials are invalidated.” |
| 2:35–3:00 | Evaluation evidence and limits | “The fixture evaluation measures discovery depth, observed consistency, latency and tokens against a declared static baseline. This proves the integration and feedback loop, not production detection accuracy. Next is independent credibility testing and process isolation.” |

Edit model waiting time only with a visible “generation time condensed” label. Preserve the observed runtime in the evidence panel. Never describe an offline fallback as Meta output. Keep the final hosted video accessible without a login.

## Recording checklist

- Show the Meta-generated badge and actual explorer provider.
- Include a branch choice, a cross-entity reference and a matching export.
- Show source failure before regeneration and passing checks afterward.
- Distinguish generator reasoning summaries from deterministic runtime constraints.
- Close on the public repo and realistic next validation step.
- Verify final video duration is at most three minutes and its link is accessible.
