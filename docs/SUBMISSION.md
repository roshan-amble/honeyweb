# Submission draft

Review the team/track choices and personal survey responses before submitting. No form has been submitted.

**Project:** Honeyweb  
**Public repository:** https://github.com/roshan-amble/honeyweb  
**Suggested problem statement:** Push the Frontier  
**Track:** Confirm Indie Developer or Startup in the form.  
**Team members:** Confirm all contributors; maximum four.  
**Three-minute video:** Pending recording and an accessible link.

## Project description

Honeyweb turns an authorized application source snapshot into a connected synthetic deception environment that can be regenerated as the application changes. A local scanner extracts mounted Express routes, TypeScript interface fields or Prisma scalar models, and supported references. Meta designs a branching graph of credential-gated collections and exports; a constrained runtime supplies related synthetic records with consistent foreign keys and stateful exports.

A second Meta-driven explorer knows only an entry URL. It discovers links from HTTP responses, chooses bounded read-only requests, and checks observed record relationships and export consistency. The dashboard shows its actions, correlated demo telemetry, schema drift, affected endpoints, and checks before and after regeneration. A custom authorized source root can use the same workflow.

The prototype includes a reproducible fixture evaluation and an adapted case study on a pinned existing RealWorld Express/Prisma backend. The case study starts the actual application with disposable PostgreSQL, compares Meta-generated and deterministic connected graphs in repeated raw-HTTP discovery trials, and checks regeneration after an actual schema change. It measures discovery coverage, consistency, latency and tokens. It is a local research prototype; the simulation does not establish real-attacker deception or detection effectiveness.

## How we use Meta

Meta's `muse-spark-1.3` model is called through the Model API chat-completions endpoint with structured JSON output. One role converts extracted source metadata into graph topology, endpoint names and a rationale. A separate role selects HTTP requests from observations. The dashboard explorer receives discovered links with redacted credentials; the case-study evaluator starts at a homepage, interprets raw HTML/JSON/text without supplied candidates, and may use only credentials it has observed. Those credentials authorize only the synthetic decoy runtime and are redacted from saved evidence. Output validation, synthetic data, credential handling, request constraints and deployment checks are deterministic local code.

## Why Meta models matter

The two model roles adapt to different evidence: source structure for environment design, and incomplete HTTP observations for exploration. This lets us test a generated environment with an observer that was not given its blueprint. The offline policy is explicitly labeled and provides a reproducible development baseline. The live workflow records whether actual Meta-generated plans and action choices complete the evaluation.

## Feedback and surveys

Use the owner's actual experience for product feedback, model comparison, likelihood-to-use and recommendation questions. Do not infer survey answers from benchmark success. The case-study runner separates application and decoy processes; production blockers still include OS/network isolation, authenticated operator access, durable audit storage, broader source understanding and independent credibility evaluation.

## Claims to retain

- Source metadata rather than production records.
- Validated declarative graph rather than executable model output.
- Response-only exploration rather than a runner handed the full graph.
- Measured fixture behavior rather than proven attack detection.
- Full validated regeneration with impact reporting rather than incremental production patching.
