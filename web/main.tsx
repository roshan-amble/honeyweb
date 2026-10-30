import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Snapshot } from "../src/scanner.ts";
import type { ExplorerReport } from "../src/explorer.ts";
import type { Check, impact } from "../src/data.ts";
import type { Generation } from "../src/plan.ts";
import type { Interaction } from "../src/runtime.ts";
import "./style.css";

type State = {
  fixture: "v1" | "v2" | "custom";
  customSource: boolean;
  checks: Check[];
  affected: ReturnType<typeof impact>;
  explorer: ExplorerReport | null;
  regeneration: { before: Check[]; after: Check[]; affected: ReturnType<typeof impact>; from: string; to: string } | null;
  snapshot: Snapshot;
  generation: Generation;
  deploymentId: string;
  events: Interaction[];
  busy: boolean;
  metaConfigured: boolean;
  decoyURL: string;
  drift: {
    changed: boolean;
    routes: { added: unknown[]; removed: unknown[] };
    entities: { added: unknown[]; removed: unknown[] };
  };
};
function Icon({
  name,
}: {
  name: "grid" | "graph" | "pulse" | "code" | "arrow";
}) {
  const paths = {
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    graph: "M6 7v10m0-5h12M3 4h6v6H3zM3 15h6v6H3zM15 9h6v6h-6z",
    pulse: "M2 12h5l3-8 4 16 3-8h5",
    code: "m8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18",
    arrow: "M4 12h16m-6-6 6 6-6 6",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
function Graph({ generation, events }: { generation: Generation; events: Interaction[] }) {
  const nodes = generation.plan.nodes;
  const collections = nodes.filter(n => n.kind === "collection");
  const height = Math.max(230, collections.length * 130 + 35);
  const positions = new Map(nodes.map(node => {
    const row = collections.findIndex(n => n.entity === node.entity);
    return [node.id, { x: node.kind === "breadcrumb" ? 15 : node.kind === "collection" ? 345 : 675, y: node.kind === "breadcrumb" ? height / 2 - 46 : 25 + Math.max(0, row) * 130 }];
  }));
  return <svg className="branch-graph" viewBox={`0 0 980 ${height}`} role="img" aria-label={`Deception graph with ${nodes.length} endpoints and ${generation.plan.edges.length} links`}>
    <defs><marker id="arrow-tip" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="#739485" /></marker></defs>
    {generation.plan.edges.map(edge => {
      const a = positions.get(edge.from)!, b = positions.get(edge.to)!;
      const cross = a.x === b.x;
      const path = cross ? `M ${a.x + 20} ${a.y + 90} C ${a.x - 55} ${a.y + 110}, ${b.x - 55} ${b.y + 10}, ${b.x} ${b.y + 45}` : `M ${a.x + 270} ${a.y + 45} C ${a.x + 300} ${a.y + 45}, ${b.x - 30} ${b.y + 45}, ${b.x} ${b.y + 45}`;
      return <path key={`${edge.from}-${edge.to}`} d={path} fill="none" stroke={cross ? "#bb9458" : "#739485"} strokeWidth="1.5" strokeDasharray={cross ? "4 3" : undefined} markerEnd="url(#arrow-tip)" />;
    })}
    {nodes.map(node => {
      const p = positions.get(node.id)!;
      const hits = events.filter(e => e.node === node.id && e.status === 200).length;
      return <g key={node.id} transform={`translate(${p.x},${p.y})`} className={hits ? "svg-node visited" : "svg-node"}>
        <title>{node.label}: GET {node.path} · {hits} successful requests</title>
        <rect width="270" height="90" rx="8" />
        <text x="15" y="21" className="svg-kind">{node.kind.toUpperCase()} · {hits} HITS</text>
        <text x="15" y="45" className="svg-label">{node.label.length > 32 ? node.label.slice(0, 29) + "…" : node.label}</text>
        <text x="15" y="69" className="svg-path">{node.path.length > 37 ? node.path.slice(0, 34) + "…" : node.path}</text>
      </g>;
    })}
  </svg>;
}
function App() {
  const [state, setState] = useState<State | null>(null);
  const [fixture, setFixture] = useState("v1");
  const [provider, setProvider] = useState("offline");
  const [explorerProvider, setExplorerProvider] = useState("offline");
  const [working, setWorking] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let initialized = false;
    const poll = async () => {
      try {
        const response = await fetch("/api/state");
        if (!response.ok)
          throw new Error(
            "Workspace unavailable. Open the 127.0.0.1 URL printed by npm start.",
          );
        const next = await response.json();
        if (alive) { setState(next); if (!initialized) { setFixture(next.fixture); initialized = true; } }
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : "Connection lost.");
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), 1500);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);
  async function action(
    name: string,
    payload: Record<string, string>,
    label: string,
  ) {
    setWorking(name);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error ?? "Operation failed.");
      setState(next);
      setNotice(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setWorking("");
    }
  }
  if (!state)
    return (
      <main className="loading">
        <span className="logo">H</span>
        <h1>Opening Honeyweb</h1>
        <p>{error || "Connecting to your local workspace…"}</p>
      </main>
    );
  const { snapshot, generation, events } = state;
  const currentEvents = events.filter(
    (e) => e.generation === state.deploymentId,
  );
  const sessions = new Set(
    currentEvents.flatMap((e) => (e.session ? [e.session] : [])),
  );
  const complete = new Set(
    currentEvents
      .filter((e) => generation.plan.nodes.some(n => n.id === e.node && n.kind === "export") && e.status === 200)
      .map((e) => e.session),
  );
  const disabled = Boolean(working) || state.busy;
  const nodes = generation.plan.nodes;
  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand" href="#overview">
          <span className="logo">H</span>
          <span>
            honeyweb<span className="wordmark-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">LOCAL WORKSPACE</div>
        <div className="project">
          <span className="project-icon">A</span>
          <div>
            {state.fixture === "custom" ? "Custom application" : "Acme application"}<small>TypeScript · Express</small>
          </div>
          <span className="project-dot" />
        </div>
        <nav aria-label="Workspace navigation">
          <a className="selected" href="#overview">
            <Icon name="grid" /> Overview
          </a>
          <a href="#graph">
            <Icon name="graph" /> Deception graph{" "}
            <span className="nav-count">{nodes.length}</span>
          </a>
          <a href="#activity">
            <Icon name="pulse" /> Activity{" "}
            <span className="nav-count">{events.length}</span>
          </a>
          <a href="#source">
            <Icon name="code" /> Source intelligence
          </a>
        </nav>
        <div className="sidebar-note">
          <span className="small-orb" /> Local synthetic environment
          <p>
            Loopback listeners.
            <br />
            Synthetic records.
            <br />
            Decoy-only credentials.
          </p>
        </div>
        <div className="sidebar-bottom">
          <span className="version">H</span>
          <div>
            Honeyweb prototype<small>v0.2 · Meta hackathon</small>
          </div>
        </div>
      </aside>
      <main id="overview">
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span> <strong>Overview</strong>
          </span>
          <div className="local-pill">
            <span /> Local runtime
          </div>
        </header>
        <div className="content">
          <div className="heading-row">
            <div>
              <div className="eyebrow">REPOSITORY-AWARE DECEPTION</div>
              <h1>Turn your code into a trail.</h1>
              <p>
                Connected decoys that reflect your application. Every
                interaction, visible.
              </p>
            </div>
            <div className="mode-badge">
              <span
                className={
                  generation.provider === "meta"
                    ? "status-dot"
                    : "status-dot amber"
                }
              />
              {generation.provider === "meta"
                ? "Meta generated"
                : "Offline fixture"}
              <small>{generation.model}</small>
            </div>
          </div>
          <div className="control-panel">
            <div className="control-block">
              <span className="step">01</span>
              <div>
                <label htmlFor="fixture">SOURCE SNAPSHOT</label>
                <div className="input-row">
                  <select
                    id="fixture"
                    value={fixture}
                    onChange={(e) => setFixture(e.target.value)}
                    disabled={disabled}
                  >
                    <option value="v1">acme / v1 · Customer</option>
                    <option value="v2">acme / v2 · Account</option>
                    {state.customSource && <option value="custom">Custom source · rescan</option>}
                  </select>
                  <button
                    disabled={disabled}
                    onClick={() =>
                      void action(
                        "scan",
                        { fixture },
                        `Scanned ${fixture}. Compare the source with the deployed graph below.`,
                      )
                    }
                  >
                    {working === "scan" ? "Scanning…" : "Scan"}
                  </button>
                </div>
              </div>
            </div>
            <div className="control-block">
              <span className="step">02</span>
              <div>
                <label htmlFor="provider">PLAN GENERATOR</label>
                <div className="input-row">
                  <select
                    id="provider"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    disabled={disabled}
                  >
                    <option value="offline">Offline fixture</option>
                    <option value="meta">Meta model</option>
                  </select>
                  <button
                    disabled={
                      disabled || (provider === "meta" && !state.metaConfigured)
                    }
                    onClick={() =>
                      void action(
                        "generate",
                        { provider },
                        `${provider === "meta" ? "Meta plan" : "Offline fixture"} validated and deployed. Credentials rotated.`,
                      )
                    }
                  >
                    {working === "generate"
                      ? "Generating…"
                      : "Generate & deploy"}
                  </button>
                </div>
              </div>
            </div>
            <div className="control-block">
              <span className="step">03</span>
              <div>
                <label htmlFor="explorer-provider">INDEPENDENT EXPLORER</label>
                <div className="input-row">
                  <select id="explorer-provider" value={explorerProvider} onChange={e => setExplorerProvider(e.target.value)} disabled={disabled}>
                    <option value="offline">Link-following baseline</option>
                    <option value="meta">Meta explorer</option>
                  </select>
                  <button className="primary" disabled={disabled || (explorerProvider === "meta" && !state.metaConfigured)}
                    onClick={() => void action("explore", { provider: explorerProvider }, "Explorer finished. Inspect its observed trail and consistency checks below.")}>
                    {working === "explore" ? "Exploring…" : "Explore"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          {provider === "meta" && (
            <div className="info-note">
              {state.metaConfigured
                ? "Meta receives the selected source’s route and interface metadata. A successful response is validated before deployment."
                : "Live generation needs MODEL_API_KEY in your local .env file, then a server restart. Offline mode makes no model calls."}
            </div>
          )}
          {(notice || error) && (
            <div
              role={error ? "alert" : "status"}
              className={`notification ${error ? "error" : ""}`}
            >
              {error || notice}
            </div>
          )}
          <section className="stats" aria-label="Current deployment metrics">
            <div>
              <span>CONNECTED DECOYS</span>
              <strong>
                {String(nodes.length).padStart(2, "0")} <small>validated endpoints</small>
              </strong>
              <p>{generation.plan.relationships.length} cross-entity references · shared synthetic records</p>
            </div>
            <div>
              <span>OBSERVED SESSIONS</span>
              <strong>
                {String(sessions.size).padStart(2, "0")}{" "}
                <small>current deployment</small>
              </strong>
              <p>Correlated by disposable decoy credential</p>
            </div>
            <div>
              <span>COMPLETED TRAILS</span>
              <strong>
                {String(complete.size).padStart(2, "0")}{" "}
                <small>reached the export</small>
              </strong>
              <p>
                {currentEvents.filter((e) => e.demo).length} demo requests ·{" "}
                {currentEvents.filter((e) => !e.demo).length} other requests
              </p>
            </div>
          </section>
          <section className="panel graph-panel" id="graph">
            <div className="panel-heading">
              <div>
                <h2>Deception graph</h2>
                <p>{generation.plan.title}</p>
              </div>
              <span
                className={`tag ${state.drift.changed ? "warning" : "green"}`}
              >
                {state.drift.changed
                  ? "Source drift detected"
                  : "In sync with source"}
              </span>
            </div>
            <div className="graph-canvas">
              <div className="graph-caption">
                <span className="small-orb" /> DEPLOYED · {state.decoyURL}
                <span>READ-ONLY SURFACES</span>
              </div>
              <Graph generation={generation} events={currentEvents} />
              <div className="graph-legend">
                <span>
                  <i className="legend-node" />
                  Constrained runtime
                </span>
                <span>
                  <i className="legend-line" />
                  Stateful relationship
                </span>
                <span>No production connections</span>
              </div>
            </div>
            <div className="rationale">
              <span>PLAN RATIONALE</span>
              <p>{generation.plan.rationale}</p>
            </div>
          </section>
          <section className="panel explorer-panel" id="explorer">
            <div className="panel-heading"><div><h2>Independent exploration</h2><p>Entry URL + HTTP observations. No source access or hidden graph.</p></div>
              <span className="tag">{state.explorer ? state.explorer.provider === "meta" ? "Meta agent" : "Deterministic baseline" : "12-request budget"}</span>
            </div>
            {state.explorer ? <>
              <div className="explorer-metrics">
                <div><strong>{state.explorer.metrics.uniquePaths}</strong><span>paths discovered</span></div>
                <div><strong>{state.explorer.metrics.maxDepth}</strong><span>discovery depth</span></div>
                <div><strong>{state.explorer.metrics.consistencyChecks - state.explorer.metrics.consistencyFailures}/{state.explorer.metrics.consistencyChecks}</strong><span>observed checks passed</span></div>
                <div><strong>{(state.explorer.metrics.elapsedMs / 1000).toFixed(1)}s</strong><span>{state.explorer.metrics.modelCalls} model calls</span></div>
              </div>
              <div className="table-wrap"><table><thead><tr><th>HTTP PATH</th><th>ACTION</th><th>RESULT</th></tr></thead><tbody>
                {state.explorer.steps.map((step, i) => <tr key={i}><td className="mono">{step.path}</td><td>{step.reason}</td><td>{step.status} · {step.records} records</td></tr>)}
              </tbody></table></div>
              <div className="panel-foot">Stopped: {state.explorer.stopReason} · {state.explorer.metrics.inputTokens} input / {state.explorer.metrics.outputTokens} output tokens. {state.explorer.issues.join("; ")}</div>
            </> : <div className="explorer-empty">Choose Meta to let a model select observed links, or use the explicit offline baseline. The explorer checks exports and foreign keys only when it has seen both sides.</div>}
          </section>
          <section className="panel checks-panel">
            <div className="panel-heading"><div><h2>Source consistency</h2><p>Deployed records checked against the currently scanned schema.</p></div><span className={`tag ${state.checks.every(c => c.passed) ? "green" : "warning"}`}>{state.checks.filter(c => c.passed).length}/{state.checks.length} passed</span></div>
            <div className="check-list">{state.checks.map(check => <div key={check.check} className={check.passed ? "check-pass" : "check-fail"}><span>{check.passed ? "✓" : "!"}</span>{check.detail}</div>)}</div>
            {state.regeneration && <div className="panel-foot">Last regeneration: {state.regeneration.before.filter(c => !c.passed).length} failing checks before → {state.regeneration.after.filter(c => !c.passed).length} after · {state.regeneration.affected.nodes.length} affected endpoints · credentials rotated.</div>}
          </section>
          <div className="lower-grid">
            <section className="panel" id="activity">
              <div className="panel-heading">
                <div>
                  <h2>Interaction stream</h2>
                  <p>Real requests. Demo traffic explicitly labeled.</p>
                </div>
                <span className="tag">{events.length} events</span>
              </div>
              {events.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>TIME</th>
                        <th>NODE / SESSION</th>
                        <th>ORIGIN</th>
                        <th>HTTP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events
                        .slice(-7)
                        .reverse()
                        .map((event) => (
                          <tr key={event.id}>
                            <td className="mono muted">
                              {new Date(event.timestamp).toLocaleTimeString(
                                [],
                                { hour12: false },
                              )}
                            </td>
                            <td>
                              <strong>{event.node}</strong>
                              <small className="mono">
                                {event.session ?? "uncorrelated"}
                                {event.generation !== state.deploymentId
                                  ? " · previous deploy"
                                  : ""}
                              </small>
                            </td>
                            <td>
                              <span className="tiny-tag">
                                {event.demo ? "demo" : "unclassified"}
                              </span>
                            </td>
                            <td>
                              <span
                                className={
                                  event.status === 200
                                    ? "http-ok"
                                    : "http-other"
                                }
                              >
                                {event.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <Icon name="pulse" />
                  <h3>Your trail is ready.</h3>
                  <p>
                    Run the explorer to watch it discover branches,
                    <br />
                    related records, and exports from response links.
                  </p>
                </div>
              )}
              <div className="panel-foot">
                A decoy interaction is evidence to investigate, not proof of
                malicious intent.
              </div>
            </section>
            <section className="panel source-panel" id="source">
              <div className="panel-heading">
                <div>
                  <h2>Source intelligence</h2>
                  <p>Parsed locally. Source code never executed.</p>
                </div>
                <span className="tag">{state.fixture}</span>
              </div>
              <div className="source-body">
                <div className="source-summary">
                  <span>
                    <strong>{snapshot.files}</strong> files
                  </span>
                  <span>
                    <strong>{snapshot.routes.length}</strong> routes
                  </span>
                  <span>
                    <strong>{snapshot.entities.length}</strong> interfaces
                  </span>
                </div>
                {state.drift.changed && (
                  <div className="drift-box">
                    <strong>Graph update available</strong>
                    <p>
                      {state.drift.routes.added.length} routes added ·{" "}
                      {state.drift.routes.removed.length} removed. Generate a
                      new plan to align the decoys with this snapshot. Affected endpoints: {state.affected.nodes.map(n => n.label).join(", ") || "none"}.
                    </p>
                  </div>
                )}
                <div className="schema-list">
                  {snapshot.entities.map((entity) => (
                    <details
                      key={entity.name}
                      open={entity.name === snapshot.entities[0].name}
                    >
                      <summary>
                        <span>{"{ }"}</span> {entity.name}
                        <small>{entity.fields.length} fields</small>
                      </summary>
                      <div>
                        {entity.fields.map((field) => (
                          <p key={field.name}>
                            <code>{field.name}</code>
                            <span>{field.type}</span>
                          </p>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
                <div className="fingerprint">
                  SNAPSHOT <code>{snapshot.hash.slice(0, 16)}</code>
                </div>
                <details className="scan-notes">
                  <summary>Scanner scope & limitations</summary>
                  {snapshot.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </details>
              </div>
            </section>
          </div>
          <footer>
            <span>HONEYWEB / PROTOTYPE</span>
            <span>
              100% synthetic data · Loopback only · 1,000-event memory buffer
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
