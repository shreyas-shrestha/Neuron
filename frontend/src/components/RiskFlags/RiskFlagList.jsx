import { useState } from "react";
import { displayFlagDescription, displayRiskCategory } from "../../uiLabels.js";

const levelColor = {
  CRITICAL: "bg-critical/20 text-critical border-critical/40",
  HIGH: "bg-amber-warn/15 text-amber-warn border-amber-warn/40",
  MEDIUM: "bg-cyan-accent/10 text-cyan-accent border-cyan-accent/30",
  LOW: "bg-slate-700/40 text-slate-300 border-slate-600/40",
};

export default function RiskFlagList({ flags, onAddReport }) {
  const [open, setOpen] = useState({});

  if (!flags?.length) {
    return <div className="text-slate-500 text-sm font-mono">No behavior flags</div>;
  }

  return (
    <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
      {flags.map((f, i) => {
        const expanded = open[i];
        const cls = levelColor[f.risk_level] || levelColor.LOW;
        const cat = displayRiskCategory(f.risk_category);
        const desc = displayFlagDescription(f);
        return (
          <div key={i} className={`border rounded-sm ${cls}`}>
            <button
              type="button"
              className="w-full text-left px-3 py-2 flex justify-between gap-2"
              onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
            >
              <span className="font-mono text-xs uppercase tracking-wide">{cat}</span>
              <span className="font-mono text-xs">{f.risk_level}</span>
            </button>
            <div className="px-3 pb-2 text-sm text-slate-200">{desc}</div>
            {expanded && (
              <div className="px-3 pb-3 space-y-2 text-xs font-mono text-slate-400">
                <div>Layers: {(f.affected_layers || []).join(", ") || "—"}</div>
                {(f.evidence_texts || []).map((t, j) => (
                  <div key={j} className="bg-black/30 p-2 border border-white/5 whitespace-pre-wrap">
                    {t}
                  </div>
                ))}
                <button
                  type="button"
                  className="text-cyan-accent hover:underline"
                  onClick={() => onAddReport?.(f)}
                >
                  Add to behavior report
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
