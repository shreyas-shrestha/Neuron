import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listModels } from "../services/api.js";
import { bciRiskLabel, bciTextClass, riskBadgeClass } from "../utils/bciDisplay.js";

function NeuralIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 72 72" fill="none" className="mx-auto text-neuron-accent" aria-hidden>
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

function formatAnalyzed(iso) {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

export default function ModelRegistry() {
  const { data: models, isLoading } = useQuery({ queryKey: ["models"], queryFn: listModels });

  if (!isLoading && (!models || models.length === 0)) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center justify-center text-center max-w-md mx-auto px-4">
        <NeuralIcon />
        <h2 className="font-display font-semibold text-[18px] text-neuron-primary mt-6">Add your first model</h2>
        <p className="text-[14px] text-neuron-secondary mt-2 leading-relaxed max-w-[300px] font-sans">
          Paste a HuggingFace model ID to start monitoring behavioral drift during retraining.
        </p>
        <Link to="/onboarding" className="mt-8 btn-primary px-6">
          Add Model →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-display font-bold text-[22px] text-neuron-primary" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          Your Models
        </h2>
        <Link to="/onboarding" className="btn-primary text-[13px] min-h-[40px] px-5">
          Add Model
        </Link>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-md border border-neuron-border shimmer" />
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(models || []).map((m) => {
            const risk = bciRiskLabel(m.overall_risk_score);
            const bci = m.overall_risk_score != null ? Math.round(Number(m.overall_risk_score)) : null;
            return (
              <article
                key={m.id}
                className="rounded-lg border border-neuron-border bg-neuron-bg shadow-sm transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-md"
              >
                <div className="p-5 space-y-3">
                  <h3 className="font-display font-semibold text-[17px] text-neuron-primary truncate">{m.name}</h3>
                  <p className="text-[12px] font-mono text-neuron-mutedText truncate">{m.huggingface_id || "—"}</p>
                  <p className="text-[12px] text-neuron-secondary font-sans">
                    Last analyzed <span className="text-neuron-mutedText">{formatAnalyzed(m.last_analyzed_at)}</span>
                  </p>
                  <div className="flex items-end justify-between gap-3 pt-1">
                    <span className={`font-mono text-[28px] font-bold leading-none ${bci != null ? bciTextClass(bci) : "text-neuron-mutedText"}`}>
                      {bci ?? "—"}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${riskBadgeClass(risk)}`}
                    >
                      {risk}
                    </span>
                  </div>
                  {m.latest_analysis_id ? (
                    <Link
                      to={`/analysis/${m.latest_analysis_id}`}
                      className="inline-block text-[13px] font-medium text-neuron-accent hover:text-neuron-accent-hover pt-1"
                    >
                      View Analysis →
                    </Link>
                  ) : (
                    <span className="text-[12px] text-neuron-mutedText font-sans">No analysis yet</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
