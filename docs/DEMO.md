# Three-minute demonstration

## Preparation

Run `npm ci && npm run check && npm start`. Set `MODEL_API_KEY` in `.env` first for the actual Meta version. Rehearse a successful generation with your account; the offline fixture is only a development fallback and must be labeled as such.

Use only the synthetic Acme fixtures. Record the dashboard and source side by side. Never display `.env`, the key, real customer source, or a production endpoint. Successful generation replaces the current graph and rotates credentials.

## Storyboard

| Time      | Action                                                                          | Point to explain                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | Open the `Customer` fixture and source intelligence.                            | Generic decoys can look unlike the application and become stale. We derive a constrained deception plan from source metadata.                                       |
| 0:20–0:55 | Select Meta and generate. Show the resulting endpoints and rationale.           | Meta chooses a credible naming scheme and entity. Runtime validates the graph and controls execution. No arbitrary model code runs.                                 |
| 0:55–1:35 | Run traversal. Show the three correlated HTTP events.                           | A breadcrumb leads to a decoy-only credential, records, and an export. These are real HTTP responses and telemetry; the traffic is our labeled demo.                |
| 1:35–2:15 | Scan v2. Show the renamed route and added `region` field. Regenerate with Meta. | A source change makes the old graph stale. Regeneration aligns the deception surface with the new metadata.                                                         |
| 2:15–2:40 | Traverse the new graph and inspect the schema.                                  | Record consistency, state transitions, credential rotation, and drift are actual application behavior.                                                              |
| 2:40–3:00 | Close on next validation.                                                       | We will test credibility, integration effort, and useful signal against a declared baseline. This is a local prototype, not proof of production detection accuracy. |

Keep the model request within the recording budget; if it is slow, use an honestly labeled edit or recorded successful generation. Never replace a failed model request with a fixture while describing it as live.
