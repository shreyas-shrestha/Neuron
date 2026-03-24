import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchDashboard, listModels } from "../services/api.js";
import { bciRiskLabel, bciTextClass, riskBadgeClass } from "../utils/bciDisplay.js";

const PIE_COLORS = {
  LOW: "#34d399",
  MEDIUM: "#facc15",
  MODERATE: "#fbbf24",
  HIGH: "#fb7185",
  CRITICAL: "#c084fc",
};

function RiskPieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div
      className="rounded-lg border border-zinc-500/40 bg-zinc-800 px-3 py-2 shadow-xl text-left"
      style={{ minWidth: 120 }}
    >
      <div className="text-[13px] font-semibold text-zinc-100">{name}</div>
      <div className="mt-1 font-mono text-[12px] text-zinc-300">
        {value} <span className="text-zinc-400">flags</span>
      </div>
    </div>
  );
}

function NeuralIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 72 72" fill="none" className="mx-auto text-neuron-accent" aria-hidden>
      <circle cx="36" cy="14" r="5" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="18" cy="36" r="5" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="54" cy="36" r="5" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="28" cy="58" r="5" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="44" cy="58" r="5" stroke="currentColor" strokeWidth="2" fill="none" />
      <path
        d="M33 18 L22 32 M39 18 L50 32 M22 40 L28 54 M50 40 L44 54 M32 58 H40"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.7"
      />
    </svg>
  );
}

function formatTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function MetricCard({ label, value }) {
  return (
    <div className="relative bg-neuron-bg border border-neuron-border rounded-md shadow-sm p-5 transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-lg overflow-hidden">
      <span className="text-[13px] text-neuron-secondary font-sans">{label}</span>
      <div className="mt-3">
        <span className="font-mono text-[28px] font-bold text-neuron-primary leading-none">{value}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: dash, isLoading } = useQuery({ queryKey: ["dash"], queryFn: fetchDashboard });
  const { data: models, isLoading: modelsLoading } = useQuery({ queryKey: ["models"], queryFn: listModels });
  const [copied, setCopied] = useState(false);

  const modelById = useMemo(() => {
    const m = {};
    (models || []).forEach((x) => {
      m[x.id] = x;
    });
    return m;
  }, [models]);

  const pieData = dash?.risk_distribution
    ? Object.entries(dash.risk_distribution).map(([name, value]) => ({ name, value }))
    : [];

  const sae = dash?.sae_status || {};
  const trained = sae.trained_layers || [];
  const totalSae = sae.total_layers ?? 12;
  const ready = sae.ready_for_demo === true;
  const saeProgress = totalSae ? Math.min(100, (trained.length / totalSae) * 100) : 0;
  const saeCmd = "cd backend && python scripts/train_sae_layer0.py --layer 0";

  const highRiskCount =
    (dash?.risk_distribution?.HIGH || 0) + (dash?.risk_distribution?.CRITICAL || 0);
  const recent = dash?.recent_analyses || [];

  const showEmptyModels = !modelsLoading && Array.isArray(models) && models.length === 0;

  async function copySaeCmd() {
    try {
      await navigator.clipboard.writeText(saeCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  if (showEmptyModels) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center text-center max-w-md mx-auto px-4">
        <NeuralIcon />
        <h2 className="font-display font-semibold text-[18px] text-neuron-primary mt-6">No models yet</h2>
        <p className="text-[14px] text-neuron-secondary mt-2 leading-relaxed max-w-[300px] font-sans">
          Register your first model to start monitoring behavioral drift.
        </p>
        <Link to="/onboarding" className="mt-8 btn-primary px-5">
          Add Model →
        </Link>
      </div>
    );
  }

  const modelsCount = models?.length ?? dash?.active_models ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <MetricCard label="Models registered" value={modelsCount} />
        <MetricCard label="High risk flags" value={highRiskCount} />
      </div>

      <section
        className={`bg-neuron-bg border border-neuron-border rounded-md shadow-sm p-5 flex flex-col lg:flex-row lg:items-center gap-6 transition-all duration-150 ${
          trained.length >= 3 ? "border-l-[3px] border-l-neuron-success" : "border-l-[3px] border-l-neuron-warning"
        }`}
      >
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display font-semibold text-[15px] text-neuron-primary">SAE training status</h2>
            {ready ? (
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-neuron-success border border-emerald-500/30">
                Ready
              </span>
            ) : (
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/15 text-neuron-warning border border-amber-500/30">
                In progress
              </span>
            )}
          </div>
          <p className="text-[13px] text-neuron-secondary leading-relaxed">
            Sparse autoencoder checkpoints per layer. Train at least three layers for a reliable demo trajectory.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <code className="flex-1 min-w-0 font-mono text-[13px] bg-neuron-muted rounded-sm px-3 py-2 text-neuron-primary border border-neuron-border">
              {saeCmd}
            </code>
            <button type="button" onClick={copySaeCmd} className="btn-secondary shrink-0 text-[13px] min-h-0 py-2">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <div className="w-full lg:w-56 shrink-0 space-y-2">
          <div className="flex justify-between text-[13px] font-mono text-neuron-secondary">
            <span>
              {trained.length}/{totalSae} layers
            </span>
            <span>{Math.round(saeProgress)}%</span>
          </div>
          <div className="h-2 w-full bg-neuron-muted rounded-full overflow-hidden border border-neuron-border">
            <div
              className="h-full bg-neuron-accent transition-all duration-300 rounded-full"
              style={{ width: `${saeProgress}%` }}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-col lg:flex-row gap-6">
        <section className="flex-[3] min-w-0 bg-neuron-bg border border-neuron-border rounded-md shadow-sm overflow-hidden transition-all duration-150 hover:-translate-y-px hover:shadow-lg">
          <div className="px-5 py-4 border-b border-neuron-border flex items-center justify-between">
            <h2 className="font-display font-semibold text-[15px] text-neuron-primary">Recent analyses</h2>
            <Link to="/" className="text-[13px] font-medium text-neuron-accent hover:text-neuron-accent-hover">
              Models →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-neuron-mutedText font-medium border-b border-neuron-border bg-neuron-subtle/50">
                  <th className="py-3 px-5 font-sans">Model</th>
                  <th className="py-3 px-3 font-sans">Analysis</th>
                  <th className="py-3 px-3 font-sans">BCI</th>
                  <th className="py-3 px-3 font-sans">Risk</th>
                  <th className="py-3 px-3 font-sans">Time</th>
                  <th className="py-3 px-5 font-sans text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-neuron-secondary shimmer h-12">
                      &nbsp;
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  recent.map((a) => {
                    const m = modelById[a.model_id];
                    const risk = bciRiskLabel(a.risk);
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-neuron-border transition-colors duration-100 hover:bg-neuron-subtle"
                      >
                        <td className="py-3 px-5 font-medium text-neuron-primary">{m?.name || "—"}</td>
                        <td className="py-3 px-3 font-mono text-neuron-mutedText">{a.id.slice(0, 8)}…</td>
                        <td className={`py-3 px-3 font-mono font-semibold ${bciTextClass(a.risk)}`}>
                          {typeof a.risk === "number" ? a.risk.toFixed(1) : "—"}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-block text-[11px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${riskBadgeClass(risk)}`}
                          >
                            {risk}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-neuron-secondary whitespace-nowrap">{formatTime(a.created_at)}</td>
                        <td className="py-3 px-5 text-right">
                          <Link
                            to={`/analysis/${a.id}`}
                            className="font-medium text-neuron-accent hover:text-neuron-accent-hover text-[13px]"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                {!isLoading && !recent.length && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-neuron-secondary">
                      No analyses yet. Run one from a model card.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex-[2] min-w-0 space-y-6">
          <section className="bg-neuron-bg border border-neuron-border rounded-md shadow-sm p-5 transition-all duration-150 hover:-translate-y-px hover:shadow-lg">
            <h2 className="font-display font-semibold text-[15px] text-neuron-primary mb-1">Risk distribution</h2>
            <p className="text-[12px] text-neuron-secondary mb-3">Flags from recent analyses</p>
            <div className="rounded-lg border border-zinc-600/50 bg-zinc-900/90 p-3">
              <div className="h-48 rounded-md bg-zinc-950/80">
                {isLoading ? (
                  <div className="h-full rounded-md shimmer" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                      <Pie
                        dataKey="value"
                        data={pieData}
                        innerRadius="48%"
                        outerRadius="78%"
                        paddingAngle={3}
                        stroke="#18181b"
                        strokeWidth={2}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`c-${index}`} fill={PIE_COLORS[entry.name] || "#a1a1aa"} />
                        ))}
                      </Pie>
                      <Tooltip content={<RiskPieTooltip />} cursor={{ fill: "rgba(255,255,255,0.06)" }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              {!isLoading && pieData.length > 0 && (
                <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-3 pt-3 border-t border-zinc-600/40">
                  {pieData.map((d) => (
                    <li key={d.name} className="flex items-center gap-2 text-[11px] font-mono">
                      <span
                        className="h-2.5 w-2.5 rounded-sm shrink-0 ring-1 ring-zinc-500/50"
                        style={{ backgroundColor: PIE_COLORS[d.name] || "#a1a1aa" }}
                        aria-hidden
                      />
                      <span className="font-medium text-zinc-100">{d.name}</span>
                      <span className="tabular-nums text-zinc-400">{d.value}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="bg-neuron-bg border border-neuron-border rounded-md shadow-sm p-5 transition-all duration-150 hover:-translate-y-px hover:shadow-lg">
            <h2 className="font-display font-semibold text-[15px] text-neuron-primary mb-3">Recent alerts</h2>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {(dash?.top_risk_flags || []).map((f, i) => {
                const L = String(f.level || "LOW").toUpperCase();
                const border =
                  L === "CRITICAL"
                    ? "border-l-neuron-critical"
                    : L === "HIGH"
                      ? "border-l-neuron-high"
                      : L === "MEDIUM" || L === "MODERATE"
                        ? "border-l-neuron-moderate"
                        : "border-l-neuron-low";
                return (
                  <div
                    key={i}
                    className={`rounded-sm border border-neuron-border border-l-[3px] ${border} bg-neuron-subtle/80 p-3 transition-all duration-150`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[11px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${riskBadgeClass(L)}`}
                      >
                        {L}
                      </span>
                      <span className="text-[11px] text-neuron-mutedText font-mono truncate">{f.category}</span>
                    </div>
                    <p className="text-[13px] text-neuron-primary mt-2 leading-snug">{f.description}</p>
                    <Link
                      to={`/analysis/${f.analysis_id}`}
                      className="inline-block mt-2 text-[12px] font-medium text-neuron-accent hover:text-neuron-accent-hover"
                    >
                      Open analysis →
                    </Link>
                  </div>
                );
              })}
              {!dash?.top_risk_flags?.length && (
                <p className="text-[13px] text-neuron-secondary">No open alerts.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
