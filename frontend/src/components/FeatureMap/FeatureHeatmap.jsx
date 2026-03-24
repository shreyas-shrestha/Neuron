import { useMemo, useState } from "react";

/** Dark surface → indigo highlight (no bright text). */
function cellColor(intensity) {
  const t = Math.max(0, Math.min(1, intensity));
  const lo = { r: 28, g: 28, b: 31 };
  const hi = { r: 79, g: 70, b: 229 };
  const r = Math.round(lo.r + (hi.r - lo.r) * t);
  const g = Math.round(lo.g + (hi.g - lo.g) * t);
  const b = Math.round(lo.b + (hi.b - lo.b) * t);
  return `rgb(${r},${g},${b})`;
}

export default function FeatureHeatmap({ heatmap, featureIds, onCell }) {
  const max = useMemo(() => {
    if (!heatmap || !heatmap.length) return 1;
    return Math.max(1e-6, ...heatmap.flatMap((row) => row));
  }, [heatmap]);

  const [sel, setSel] = useState(null);

  if (!heatmap || !heatmap.length) {
    return <div className="text-neuron-secondary text-sm font-sans">No heatmap data</div>;
  }

  const cols = heatmap[0]?.length || 0;
  const fids = (featureIds || []).slice(0, cols);

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-px bg-neuron-border p-px rounded-sm border border-neuron-border"
        style={{
          gridTemplateColumns: `80px repeat(${cols}, minmax(0,1fr))`,
        }}
      >
        <div className="text-[10px] font-mono text-neuron-mutedText px-2 py-1 bg-neuron-bg">layer \ feat</div>
        {fids.map((fid) => (
          <div key={fid} className="text-[9px] font-mono text-neuron-mutedText text-center truncate px-0.5 bg-neuron-bg py-1">
            {fid}
          </div>
        ))}
        {heatmap.map((row, li) => (
          <div key={`row-${li}`} className="contents">
            <div className="text-[10px] font-mono text-neuron-secondary px-2 py-1 bg-neuron-muted flex items-center border-r border-neuron-border">
              L{li}
            </div>
            {row.map((cell, fi) => {
              const intensity = cell / max;
              const active = sel && sel.l === li && sel.f === fi;
              return (
                <button
                  type="button"
                  key={`${li}-${fi}`}
                  className={`h-6 w-full transition-all duration-150 border border-transparent ${
                    active ? "ring-2 ring-neuron-accent ring-offset-1 ring-offset-neuron-bg z-10" : "hover:brightness-110"
                  }`}
                  style={{
                    background: cellColor(intensity),
                  }}
                  title={`Feature ${fids[fi]} · layer ${li} · ${cell?.toFixed?.(4) ?? cell}`}
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
        <div className="mt-2 text-xs font-mono text-neuron-secondary">
          Selected: layer {sel.l}, feature {fids[sel.f]}, activation {sel.v?.toFixed(4)}
        </div>
      )}
    </div>
  );
}
