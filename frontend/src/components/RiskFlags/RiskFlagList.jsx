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

function ShieldIcon({ className = "w-10 h-10" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  );
}

export default function RiskFlagList({ flags, onAddReport }) {
  const [open, setOpen] = useState({});

  if (!flags?.length) {
    return (
      <div className="flex flex-col items-center text-center py-10 px-4 max-w-[320px] mx-auto">
        <ShieldIcon className="w-10 h-10 text-neuron-accent shrink-0" />
        <h3 className="font-display font-semibold text-[18px] text-neuron-primary mt-4" style={{ fontWeight: 600 }}>
          No behavior flags
        </h3>
        <p className="text-[14px] text-neuron-secondary mt-2 leading-relaxed font-sans">
          This model&apos;s analysis found no significant behavioral anomalies.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
      {flags.map((f, i) => {
        const expanded = open[i];
        const L = String(f.risk_level || "LOW").toUpperCase();
        const bLeft = borderForLevel[L] || borderForLevel.LOW;
        const bBadge = badgeForLevel[L] || badgeForLevel.LOW;
        const cat = displayRiskCategory(f.risk_category) || f.risk_category || "—";
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
