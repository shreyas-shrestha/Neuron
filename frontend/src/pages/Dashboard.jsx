import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchDashboard, listModels, runAnalysis } from "../services/api.js";
import { displayRiskCategory } from "../uiLabels.js";

const COLORS = {
  LOW: "#64748b",
  MEDIUM: "#00d4ff",
  HIGH: "#f59e0b",
  CRITICAL: "#ef4444",
};

export default function Dashboard() {
  const { data: dash, isLoading } = useQuery({ queryKey: ["dash"], queryFn: fetchDashboard });
  const { data: models } = useQuery({ queryKey: ["models"], queryFn: listModels });

  async function quickRun(modelId) {
    const { job_id } = await runAnalysis({
      model_id: modelId,
      text_samples: [],
      analysis_type: "full",
    });
    window.location.href = `/analysis/${job_id}`;
  }

  const pieData = dash?.risk_distribution
    ? Object.entries(dash.risk_distribution).map(([name, value]) => ({ name, value }))
    : [];

  const sae = dash?.sae_status || {};
  const trained = sae.trained_layers || [];
  const totalSae = sae.total_layers ?? 12;
  const ready = sae.ready_for_demo === true;
  const saeProgress = totalSae ? Math.min(100, (trained.length / totalSae) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operations dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Live mechanistic behavior signals across registered models.
          </p>
        </div>
        <Link
          to="/onboarding"
          className="px-4 py-2 bg-cyan-accent/90 text-navy font-mono text-xs font-semibold shrink-0"
        >
          Add model
        </Link>
      </header>

      <section className="glass rounded-sm p-4 space-y-3">
        <h2 className="font-mono text-xs text-cyan-accent tracking-widest">SAE TRAINING STATUS</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-300">
            <span className="font-mono text-cyan-accent">{trained.length}</span>
            <span className="text-slate-500"> / </span>
            <span className="font-mono">{totalSae}</span>
            <span className="text-slate-500 ml-2">layers with checkpoints</span>
          </div>
          {ready ? (
            <span className="font-mono text-xs px-2 py-1 rounded border border-emerald-500/50 text-emerald-400 bg-emerald-500/10">
              Ready
            </span>
          ) : (
            <span className="font-mono text-xs text-amber-warn">Not ready for demo</span>
          )}
        </div>
        <div className="h-2 w-full bg-navy border border-white/10 rounded-sm overflow-hidden">
          <div
            className="h-full bg-cyan-accent/80 transition-all"
            style={{ width: `${saeProgress}%` }}
          />
        </div>
        {!ready && (
          <p className="text-xs text-slate-400 font-mono leading-relaxed">
            Train at least three layers (e.g. 0, 5, 11), then restart the API:
            <br />
            <code className="block mt-2 bg-black/40 px-2 py-2 rounded text-cyan-accent/90">
              cd backend && python scripts/train_sae_layer0.py --layer 0
            </code>
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="glass rounded-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs text-cyan-accent tracking-widest">MODEL REGISTRY</h2>
            <Link to="/models" className="text-xs text-slate-400 hover:text-white font-mono">
              manage →
            </Link>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(models || []).map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between border border-white/10 px-3 py-2 rounded-sm bg-navy/60"
              >
                <div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs font-mono text-slate-500">{m.huggingface_id || "custom"}</div>
                </div>
                <div className="text-right text-xs font-mono">
                  <div
                    className={
                      (m.overall_risk_score || 0) > 60 ? "text-amber-warn" : "text-slate-300"
                    }
                  >
                    BCI {m.overall_risk_score?.toFixed?.(0) ?? "—"}
                  </div>
                  <button
                    type="button"
                    onClick={() => quickRun(m.id)}
                    className="mt-1 text-cyan-accent hover:underline"
                  >
                    Run analysis
                  </button>
                </div>
              </div>
            ))}
            {!models?.length && (
              <div className="text-sm text-slate-500">Register a model to begin.</div>
            )}
          </div>
        </section>

        <section className="glass rounded-sm p-4 space-y-3 xl:col-span-1">
          <h2 className="font-mono text-xs text-cyan-accent tracking-widest">BEHAVIOR DISTRIBUTION</h2>
          <div className="h-52">
            {isLoading ? (
              <div className="text-slate-500 text-sm">Loading…</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie dataKey="value" data={pieData} innerRadius={50} outerRadius={70} paddingAngle={2}>
                    {pieData.map((entry, index) => (
                      <Cell key={`c-${index}`} fill={COLORS[entry.name] || "#334155"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#0a0f1e", border: "1px solid #1e293b" }}
                    labelStyle={{ color: "#e2e8f0" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="text-xs font-mono text-slate-500">Flags aggregated from recent analyses</div>
        </section>

        <section className="glass rounded-sm p-4 space-y-3">
          <h2 className="font-mono text-xs text-cyan-accent tracking-widest">ALERTS & DEADLINES</h2>
          <div className="space-y-2 text-sm max-h-64 overflow-y-auto">
            {(dash?.top_risk_flags || []).map((f, i) => (
              <div key={i} className="border border-white/10 rounded-sm p-2 bg-black/20">
                <div className="text-xs font-mono text-amber-warn">{f.level}</div>
                <div className="text-[10px] font-mono text-slate-500">
                  {displayRiskCategory(f.category)}
                </div>
                <div className="text-slate-200">{f.description}</div>
                <Link to={`/analysis/${f.analysis_id}`} className="text-xs text-cyan-accent">
                  open analysis
                </Link>
              </div>
            ))}
            <div className="pt-2 border-t border-white/10 mt-2">
              <div className="text-xs font-mono text-slate-500 mb-2">POLICY MILESTONES</div>
              {(dash?.regulatory_milestones || []).map((m, i) => (
                <div key={i} className="flex justify-between text-xs py-1 border-b border-white/5">
                  <span>{m.name}</span>
                  <span className="font-mono text-slate-400">{m.due}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="glass rounded-sm p-4">
        <h2 className="font-mono text-xs text-cyan-accent tracking-widest mb-3">RECENT ANALYSES</h2>
        <div className="space-y-2">
          {(dash?.recent_analyses || []).map((a) => (
            <div key={a.id} className="flex items-center justify-between border border-white/10 px-3 py-2">
              <div className="font-mono text-xs text-slate-400">{a.id.slice(0, 8)}…</div>
              <div className="text-sm">{a.status}</div>
              <div className="font-mono text-xs">bci {a.risk?.toFixed?.(0)}</div>
              <Link className="text-cyan-accent text-sm" to={`/analysis/${a.id}`}>
                open
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
