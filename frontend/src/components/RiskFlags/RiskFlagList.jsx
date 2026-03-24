import { useState } from "react";
import { displayFlagDescription, displayRiskCategory } from "../../uiLabels.js";

const borderForLevel = {
  CRITICAL: "border-l-neuron-critical",
  HIGH: "border-l-neuron-high",
  MEDIUM: "border-l-neuron-moderate",
  MODERATE: "border-l-neuron-moderate",
  LOW: "border-l-neuron-low",
};

const badgeForLevel = {
  CRITICAL: "bg-violet-500/15 text-neuron-critical border border-violet-500/35",
  HIGH: "bg-red-500/15 text-neuron-high border border-red-500/35",
  MEDIUM: "bg-amber-500/15 text-neuron-moderate border border-amber-500/35",
  MODERATE: "bg-amber-500/15 text-neuron-moderate border border-amber-500/35",
  LOW: "bg-emerald-500/15 text-neuron-low border border-emerald-500/35",
};

export default function RiskFlagList({ flags, onAddReport }) {
  const [open, setOpen] = useState({});

  if (!flags?.length) {
    return <div className="text-neuron-secondary text-sm font-sans">No behavior flags</div>;
  }

  return (
    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
      {flags.map((f, i) => {
        const expanded = open[i];
        const L = String(f.risk_level || "LOW").toUpperCase();
        const bLeft = borderForLevel[L] || borderForLevel.LOW;
        const bBadge = badgeForLevel[L] || badgeForLevel.LOW;
        const cat = displayRiskCategory(f.risk_category);
        const desc = displayFlagDescription(f);
        const al = f.affected_layers || [];
        const layers = al.join(", ") || "—";
        const layerBadge =
          al.length === 1 ? `L${al[0]}` : al.length > 1 ? `${al.length} layers` : "—";

        return (
          <div
            key={i}
            className={`rounded-sm border border-neuron-border bg-neuron-bg border-l-[3px] ${bLeft} shadow-sm transition-all duration-150 hover:shadow-md overflow-hidden`}
          >
            <button
              type="button"
              className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-2 justify-between"
              onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
            >
              <span
                className={`text-[11px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${bBadge}`}
              >
                {L}
              </span>
              <span className="text-[12px] font-medium text-neuron-primary font-sans flex-1 min-w-0 truncate">
                {cat}
              </span>
              <span className="text-[11px] font-mono text-neuron-mutedText bg-neuron-subtle px-2 py-0.5 rounded-full border border-neuron-border">
                {layerBadge}
              </span>
            </button>
            <div className="px-4 pb-3 text-[14px] text-neuron-secondary font-sans leading-relaxed">{desc}</div>
            {f.plain_explanation && f.plain_explanation !== (f.description || "") && (
              <div className="px-4 pb-3 border-t border-neuron-border">
                <p className="text-[11px] text-neuron-mutedText uppercase tracking-wide font-medium mb-1 font-sans">
                  Plain English
                </p>
                <p className="text-[13px] text-neuron-secondary leading-relaxed font-sans">{f.plain_explanation}</p>
              </div>
            )}
            {expanded && (
              <div className="px-4 pb-4 space-y-2 text-xs font-mono text-neuron-mutedText border-t border-neuron-border bg-neuron-subtle/40 pt-3">
                <div>
                  Layers: <span className="text-neuron-primary">{layers}</span>
                </div>
                {(f.evidence_texts || []).map((t, j) => (
                  <div key={j} className="bg-neuron-muted p-2 border border-neuron-border rounded-sm whitespace-pre-wrap text-[12px]">
                    {t}
                  </div>
                ))}
                <button
                  type="button"
                  className="text-[13px] font-medium text-neuron-secondary hover:text-neuron-primary underline underline-offset-2 font-sans pt-1"
                  onClick={() => onAddReport?.(f)}
                >
                  Add to report
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
