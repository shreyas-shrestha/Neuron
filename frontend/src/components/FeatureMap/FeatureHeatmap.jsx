import { useMemo, useState } from "react";

export default function FeatureHeatmap({ heatmap, featureIds, onCell }) {
  const max = useMemo(() => {
    if (!heatmap || !heatmap.length) return 1;
    return Math.max(1e-6, ...heatmap.flatMap((row) => row));
  }, [heatmap]);

  const [sel, setSel] = useState(null);

  if (!heatmap || !heatmap.length) {
    return <div className="text-slate-500 text-sm font-mono">No heatmap data</div>;
  }

  const cols = heatmap[0]?.length || 0;
  const fids = (featureIds || []).slice(0, cols);

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-px bg-white/10 p-px rounded-sm"
        style={{
          gridTemplateColumns: `80px repeat(${cols}, minmax(0,1fr))`,
        }}
      >
        <div className="text-[10px] font-mono text-slate-500 px-2 py-1">layer \\ feat</div>
        {fids.map((fid) => (
          <div key={fid} className="text-[9px] font-mono text-slate-500 text-center truncate px-0.5">
            {fid}
          </div>
        ))}
        {heatmap.map((row, li) => (
          <div key={`row-${li}`} className="contents">
            <div className="text-[10px] font-mono text-cyan-accent/80 px-2 py-1 bg-navy flex items-center">
              L{li}
            </div>
            {row.map((cell, fi) => {
              const intensity = cell / max;
              const active = sel && sel.l === li && sel.f === fi;
              return (
                <button
                  type="button"
                  key={`${li}-${fi}`}
                  className={`h-6 w-full transition-colors ${active ? "ring-1 ring-cyan-accent" : ""}`}
                  style={{
                    background: `rgba(0,212,255,${0.12 + intensity * 0.75})`,
                  }}
                  onClick={() => {
                    setSel({ l: li, f: fi, v: cell });
                    onCell?.({ layer: li, featureIndex: fids[fi], value: cell });
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      {sel && (
        <div className="mt-2 text-xs font-mono text-slate-400">
          Selected: layer {sel.l}, feature {fids[sel.f]}, activation {sel.v?.toFixed(4)}
        </div>
      )}
    </div>
  );
}
