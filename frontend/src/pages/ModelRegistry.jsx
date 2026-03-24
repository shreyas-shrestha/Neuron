import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { listModels, registerModel, runAnalysis } from "../services/api.js";
import { bciRiskLabel, riskBadgeClass } from "../utils/bciDisplay.js";

function sparkFromScore(score) {
  const s = Number(score) || 0;
  return [0, 1, 2, 3, 4].map((i) => ({ i, v: Math.max(0, s * (0.88 + 0.03 * i)) }));
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

export default function ModelRegistry() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: models, isLoading } = useQuery({ queryKey: ["models"], queryFn: listModels });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("GPT-2 Demo");
  const [hf, setHf] = useState("gpt2");
  const [domain, setDomain] = useState("general");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await registerModel({ name, huggingface_id: hf, domain });
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["models"] });
      if (res?.initial_analysis_job_id) {
        nav(`/analysis/${res.initial_analysis_job_id}`);
      }
    } catch (ex) {
      setErr(ex?.response?.data?.detail || "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function goAnalysis(modelId) {
    const { job_id } = await runAnalysis({
      model_id: modelId,
      text_samples: [],
      analysis_type: "full",
    });
    window.location.href = `/analysis/${job_id}`;
  }

  const domainLabel = (d) =>
    ({ lending: "Lending", healthcare: "Healthcare", insurance: "Insurance", general: "General" }[d] || d);

  if (!isLoading && (!models || models.length === 0)) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center text-center max-w-md mx-auto px-4">
        <NeuralIcon />
        <h2 className="font-display font-semibold text-[18px] text-neuron-primary mt-6">No models yet</h2>
        <p className="text-[14px] text-neuron-secondary mt-2 leading-relaxed max-w-[320px]">
          Register your first model to start monitoring behavioral drift.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={() => setOpen(true)} className="btn-primary px-5">
            Register a Model
          </button>
          <Link
            to="/demo"
            className="btn-secondary px-5 inline-flex items-center justify-center"
          >
            See demo
          </Link>
        </div>
        {open && (
          <div
            className="neuron-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-model-title"
            onClick={() => setOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          >
            <form
              onSubmit={submit}
              className="neuron-modal-panel space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="register-model-title" className="font-display font-semibold text-[18px] text-neuron-primary">
                Register a model
              </h2>
              <label className="block">
                <span className="text-[13px] font-medium text-neuron-secondary">Model name</span>
                <input className="input-neuron mt-1.5 font-sans" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-[13px] font-medium text-neuron-secondary">HuggingFace ID</span>
                <input
                  className="input-neuron mt-1.5 font-mono text-[13px]"
                  value={hf}
                  onChange={(e) => setHf(e.target.value)}
                  placeholder="gpt2"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-medium text-neuron-secondary">Domain</span>
                <select
                  className="input-neuron mt-1.5 font-sans"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                >
                  <option value="general">General</option>
                  <option value="lending">Lending</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="insurance">Insurance</option>
                </select>
              </label>
              {err && <div className="text-sm text-neuron-danger font-sans">{err}</div>}
              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
                  {busy ? "Registering…" : "Register & Analyze"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-semibold text-[20px] text-neuron-primary">Model registry</h2>
          <p className="text-[13px] text-neuron-secondary mt-1 font-sans">
            Register HuggingFace checkpoints for mechanistic tracing (GPT-2 default for CPU demos).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/onboarding" className="btn-secondary text-[13px] min-h-[36px]">
            Guided setup
          </Link>
          <button type="button" onClick={() => setOpen(true)} className="btn-primary text-[13px] min-h-[36px]">
            Register model
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-md border border-neuron-border shimmer" />
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(models || []).map((m) => {
            const risk = bciRiskLabel(m.overall_risk_score);
            return (
              <article
                key={m.id}
                className="rounded-lg border border-neuron-border-strong bg-gradient-to-b from-neuron-muted/90 to-neuron-bg shadow-md transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-xl hover:border-zinc-500/40 ring-1 ring-white/[0.04]"
              >
                <div className="px-5 pt-4 pb-3 border-b border-neuron-border bg-neuron-bg/40 rounded-t-lg">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display font-semibold text-[16px] text-neuron-primary truncate">{m.name}</h3>
                    <span className="shrink-0 text-[11px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-neuron-muted text-neuron-primary border border-neuron-border-strong">
                      {domainLabel(m.domain)}
                    </span>
                  </div>
                  <p className="text-[12px] text-neuron-secondary mt-2 font-sans">
                    Last analyzed{" "}
                    <span className="font-mono text-neuron-primary/90">
                      {m.last_analyzed_at ? new Date(m.last_analyzed_at).toLocaleString() : "Never"}
                    </span>
                  </p>
                </div>
                <div className="p-5 pt-4">
                  <div className="flex items-stretch gap-4">
                    <div
                      className="w-[88px] h-14 shrink-0 rounded-md border border-neuron-border bg-[#121214] px-1 py-1 shadow-inner"
                      title="Recent BCI trend (illustrative)"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sparkFromScore(m.overall_risk_score)} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                          <Line
                            type="monotone"
                            dataKey="v"
                            stroke="#a5b4fc"
                            strokeWidth={2.5}
                            dot={false}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
                      <div className="flex flex-wrap items-center gap-2 justify-between">
                        <span
                          className={`text-[11px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${riskBadgeClass(risk)}`}
                        >
                          {risk}
                        </span>
                        <button
                          type="button"
                          onClick={() => goAnalysis(m.id)}
                          className="text-[13px] font-medium text-neuron-primary hover:text-neuron-accent transition-colors"
                        >
                          View analysis →
                        </button>
                      </div>
                      <p className="text-[11px] font-mono text-neuron-secondary truncate border-t border-neuron-border/60 pt-2">
                        {m.huggingface_id}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {open && (
        <div
          className="neuron-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="register-model-title-main"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        >
          <form
            onSubmit={submit}
            className="neuron-modal-panel space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="register-model-title-main" className="font-display font-semibold text-[18px] text-neuron-primary">
              Register a model
            </h2>
            <label className="block">
              <span className="text-[13px] font-medium text-neuron-secondary font-sans">Model name</span>
              <input className="input-neuron mt-1.5 font-sans" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-neuron-secondary font-sans">HuggingFace ID</span>
              <input
                className="input-neuron mt-1.5 font-mono text-[13px]"
                value={hf}
                onChange={(e) => setHf(e.target.value)}
                placeholder="gpt2"
              />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-neuron-secondary font-sans">Domain</span>
              <select
                className="input-neuron mt-1.5 font-sans"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              >
                <option value="general">General</option>
                <option value="lending">Lending</option>
                <option value="healthcare">Healthcare</option>
                <option value="insurance">Insurance</option>
              </select>
            </label>
            {err && <div className="text-sm text-neuron-danger font-sans">{err}</div>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
                {busy ? "Registering…" : "Register & Analyze"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
