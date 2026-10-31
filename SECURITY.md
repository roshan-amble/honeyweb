# Security boundaries

This is an early local demonstration, not a hardened deployment or a security guarantee.

## Implemented

- Read-only local AST parsing. No source imports, build scripts, package installation, repository hooks, or application execution during scans.
- Explicitly bounded scan size and traversal depth. Hidden files, symlinks, build outputs, and dependency directories are skipped. Source literal values and comments are not copied into metadata.
- The generator receives route/interface metadata and inferred references. The explorer receives redacted HTTP observations containing synthetic data. Metadata may still be sensitive; inspect and obtain permission before using private source.
- Structured plan validation accepts three supported node kinds, up to thirteen nodes, reachable graph edges, canonical relative paths, observed entities and supported source references. Fixed URL paths cannot reuse source parameter names as literal placeholder segments. Extra properties are rejected. No eval, shell, executable templates, or model-selected outbound URLs.
- The explorer only requests canonical paths discovered in responses on the supplied literal `127.0.0.1` origin. No redirects, model-selected hosts, methods, headers, arbitrary paths or production credentials. Requests are capped at 16, with 3-second HTTP timeouts and 64 KB response limits; the dashboard uses 12.
- Custom source roots are selected at process startup, not through browser-supplied filesystem paths.
- Candidates must pass schema and reference checks before atomic deployment; failed candidates retain the prior deployment.
- Fresh cryptographically random credentials on breadcrumb access. Credentials only authorize this decoy runtime, expire after 15 minutes, and are invalidated on deploy/restart.
- Synthetic records, reserved `.invalid` email domains, and no production connections. Collection and export share consistent records.
- Admin and decoy HTTP surfaces use different loopback ports. No admin endpoints on the decoy listener. Admin Host/Origin checks, no cross-origin permission, and JSON-only mutations mitigate browser-origin attacks against localhost.
- No request bodies, authorization headers, query strings, IP addresses, or full unknown paths in telemetry. Displayed paths come from the validated plan. React renders labels as text.
- Bounded memory for events and credentials. Deployment IDs separate historical activity from current metrics. Demo requests are labeled through an internal one-use marker.

## Case-study lab

The RealWorld case runner explicitly executes a reviewed pinned upstream application with disposable PostgreSQL and synthetic seed data. Scanning itself still never executes source. The application and decoys run in separate child processes with filtered environments. The decoy receives neither `MODEL_API_KEY` nor `DATABASE_URL`. This is process separation, not an OS sandbox or egress isolation. The lab gateway adds controlled homepage/docs/archive routing; archive credentials are never forwarded into the application.

The case-study HTTP evaluator differs from the dashboard explorer: it sees raw response text and may guess paths on the single literal loopback origin. Only GET is available, redirects are rejected, and any Authorization credential must have appeared in a response. Disposable decoy credentials are visible to this model so it can interpret authentication without hard-coded response conventions; they are redacted in reports. The evaluator retains only Authorization values it previously submitted from observed responses, without automatically attaching them to later requests. Real application registration tokens are never given to the evaluator. Prisma extraction omits source literal/default values and does not resolve unsupported relationships.

## Not implemented

OS/process sandboxing, a network egress firewall, TLS, operator authentication, multi-tenancy, rate limiting, persistent audit logs, reliable session identity, production secret scanning, robust parsing of arbitrary repositories, or protection against other malicious local processes. The ordinary dashboard operator and decoys share one process and memory; only the case-study runner separates these processes. Do not expose these ports to the internet or route real customer traffic here.

The source scanner assumes a stable trusted checkout. Symlink skipping is not protection against an attacker replacing files concurrently. Static metadata is a subset of a source tree, not a verified inventory of deployed services. False positives and deception fingerprinting are possible.

Before a pilot: deploy the decoy plane in its own unprivileged process/container and network, deny outbound network access, authenticate and separate the operator plane, establish retention/deletion policy and authorized telemetry use, threat-model the deployment, and test abuse limits. Production network changes require an explicit reviewed rollout.

Do not post credentials or private source in public issues. This repository currently has no dedicated private disclosure channel; request a private contact from the owner without including vulnerability details or secrets.
