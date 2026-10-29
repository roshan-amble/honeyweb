# Security boundaries

This is an early local demonstration, not a hardened deployment or a security guarantee.

## Implemented

- Read-only local AST parsing. No source imports, build scripts, package installation, repository hooks, or application execution during scans.
- Explicitly bounded scan size and traversal depth. Hidden files, symlinks, build outputs, and dependency directories are skipped. Source literal values and comments are not copied into metadata.
- Meta receives route and interface metadata only. Metadata may still be sensitive; inspect and obtain permission before using private source.
- Structured plan validation accepts exactly three supported node kinds, two prescribed edges, canonical relative paths, and an observed entity. Extra properties are rejected. No eval, shell, executable templates, or model-selected outbound URLs.
- Fresh cryptographically random credentials on breadcrumb access. Credentials only authorize this decoy runtime, expire after 15 minutes, and are invalidated on deploy/restart.
- Synthetic records, reserved `.invalid` email domains, and no production connections. Collection and export share consistent records.
- Admin and decoy HTTP surfaces use different loopback ports. No admin endpoints on the decoy listener. Admin Host/Origin checks, no cross-origin permission, and JSON-only mutations mitigate browser-origin attacks against localhost.
- No request bodies, authorization headers, query strings, IP addresses, or full unknown paths in telemetry. Displayed paths come from the validated plan. React renders labels as text.
- Bounded memory for events and credentials. Deployment IDs separate historical activity from current metrics. Demo requests are labeled through an internal one-use marker.

## Not implemented

OS/process sandboxing, a network egress firewall, TLS, operator authentication, multi-tenancy, rate limiting, persistent audit logs, reliable session identity, production secret scanning, robust parsing of arbitrary repositories, or protection against other malicious local processes. Operator and decoys share one process and memory. Do not expose these ports to the internet or route real customer traffic here.

The source scanner assumes a stable trusted checkout. Symlink skipping is not protection against an attacker replacing files concurrently. Static metadata is a subset of a source tree, not a verified inventory of deployed services. False positives and deception fingerprinting are possible.

Before a pilot: deploy the decoy plane in its own unprivileged process/container and network, deny outbound network access, authenticate and separate the operator plane, establish retention/deletion policy and authorized telemetry use, threat-model the deployment, and test abuse limits. Production network changes require an explicit reviewed rollout.

Do not post credentials or private source in public issues. This repository currently has no dedicated private disclosure channel; request a private contact from the owner without including vulnerability details or secrets.
