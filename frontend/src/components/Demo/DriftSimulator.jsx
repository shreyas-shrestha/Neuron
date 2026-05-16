import { useId, useState } from "react";
import { motion } from "framer-motion";

const DRIFT_SCALE = 60.0;
const BCI_THRESHOLD = 20;

function clampCosSim(c) {
  return Math.min(1, Math.max(-1, c));
}

export default function DriftSimulator({ embedded = false }) {
  const gridId = useId().replace(/:/g, "");
  const patternId = `drift-grid-${gridId}`;
  const [epoch, setEpoch] = useState(1);

  const cosSim = Math.max(0.65, 0.99 - (epoch - 1) * ((0.99 - 0.65) / 9));
  const bci = (1 - cosSim) * DRIFT_SCALE;
  const isHighRisk = bci > BCI_THRESHOLD;

  const cx = 200;
  const cy = 160;
  const radius = 100;
  const baseAngle = (-30 * Math.PI) / 180;
  const baseX = cx + radius * Math.cos(baseAngle);
  const baseY = cy + radius * Math.sin(baseAngle);

  const angleBetween = Math.acos(clampCosSim(cosSim));
  const driftAngle = baseAngle + angleBetween;

  const ftX = cx + radius * Math.cos(driftAngle);
  const ftY = cy + radius * Math.sin(driftAngle);

  const projX = cx + radius * cosSim * Math.cos(baseAngle);
  const projY = cy + radius * cosSim * Math.sin(baseAngle);

  const transition = { type: "spring", stiffness: 280, damping: 26, mass: 0.85 };

  const rootClass = embedded
    ? "w-full space-y-4"
    : "w-full max-w-xl mx-auto rounded-md border border-neuron-border bg-neuron-bg shadow-sm p-5 sm:p-6";

  return (
    <div className={rootClass}>
      <div
        className={`w-full flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 ${embedded ? "mb-1" : "mb-5"}`}
      >
        <div>
          {!embedded ? (
            <h3 className="font-display font-semibold text-[15px] text-neuron-primary tracking-tight">Latent vector drift</h3>
          ) : null}
          <p className={`text-[12px] text-neuron-mutedText font-sans ${embedded ? "" : "mt-0.5"}`}>
            Vectors stay unit length; the angle between them matches the cosine similarity readout ·{" "}
            <span className="font-mono text-neuron-secondary">BCI = (1 − cos sim) × {DRIFT_SCALE}</span>
          </p>
        </div>
        <div className="text-left sm:text-right shrink-0">
          <div className="text-[10px] text-neuron-mutedText uppercase tracking-widest mb-1">Status</div>
          <div
            className={`inline-block px-3 py-1 rounded text-[11px] font-mono font-semibold border ${
              isHighRisk
                ? "bg-red-500/15 text-red-300 border-red-500/35"
                : "bg-emerald-500/12 text-neuron-success border-emerald-500/30"
            }`}
          >
            {isHighRisk ? "HIGH RISK (BCI > 20)" : "COMPLIANT"}
          </div>
        </div>
      </div>

      <div className={`relative w-full h-72 rounded-md border border-neuron-border bg-neuron-subtle overflow-hidden ${embedded ? "mb-4" : "mb-6"}`}>
        <svg width="100%" height="100%" viewBox="0 0 400 320" className="block" preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id={patternId} width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--color-border)" strokeWidth="0.5" opacity="0.35" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="400" height="320" fill={`url(#${patternId})`} />
          <line x1={cx} y1={0} x2={cx} y2={320} stroke="var(--color-border-strong)" strokeWidth="1" opacity="0.5" />
          <line x1={0} y1={cy} x2={400} y2={cy} stroke="var(--color-border-strong)" strokeWidth="1" opacity="0.5" />

          <line x1={cx} y1={cy} x2={baseX} y2={baseY} stroke="#3b82f6" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx={baseX} cy={baseY} r="3.5" fill="#3b82f6" />
          <text x={baseX + 8} y={baseY - 4} fill="#60a5fa" fontSize="11" fontWeight="600" fontFamily="system-ui, sans-serif">
            Baseline activation
          </text>

          <motion.line
            x1={cx}
            y1={cy}
            x2={ftX}
            y2={ftY}
            stroke="#fb923c"
            strokeWidth={3.5}
            strokeLinecap="round"
            initial={false}
            animate={{ x2: ftX, y2: ftY }}
            transition={transition}
          />
          <motion.circle
            cx={ftX}
            cy={ftY}
            r={3.5}
            fill="#fb923c"
            initial={false}
            animate={{ cx: ftX, cy: ftY }}
            transition={transition}
          />
          <motion.text
            x={ftX + 8}
            y={ftY + 14}
            fill="#fdba74"
            fontSize="11"
            fontWeight="600"
            fontFamily="system-ui, sans-serif"
            initial={false}
            animate={{ x: ftX + 8, y: ftY + 14 }}
            transition={transition}
          >
            Fine-tuned activation
          </motion.text>

          {isHighRisk && (
            <g opacity={0.95}>
              <line
                x1={cx}
                y1={cy}
                x2={projX}
                y2={projY}
                stroke="#64748b"
                strokeWidth="2"
                strokeDasharray="5 4"
                strokeLinecap="round"
              />
              <motion.line
                x1={projX}
                y1={projY}
                x2={ftX}
                y2={ftY}
                stroke="#f87171"
                strokeWidth="2.8"
                strokeDasharray="6 4"
                strokeLinecap="round"
                initial={false}
                animate={{ x1: projX, y1: projY, x2: ftX, y2: ftY, opacity: 1 }}
                transition={transition}
              />
              <text
                x={Math.min(projX + 6, 285)}
                y={Math.min((projY + ftY) / 2 - 6, 140)}
                fill="#fca5a5"
                fontSize="10"
                fontWeight="600"
                fontFamily="system-ui, sans-serif"
              >
                Component off baseline (analogy)
              </text>
            </g>
          )}
        </svg>
      </div>

      <div className={`grid grid-cols-2 gap-3 w-full ${embedded ? "mb-4" : "mb-6"}`}>
        <div className="bg-neuron-muted/50 p-3 rounded-md border border-neuron-border">
          <div className="text-neuron-mutedText text-[10px] uppercase tracking-wider mb-1">Cosine similarity</div>
          <div className="text-2xl font-mono font-semibold text-neuron-primary">{cosSim.toFixed(3)}</div>
        </div>
        <div className="bg-neuron-muted/50 p-3 rounded-md border border-neuron-border">
          <div className="text-neuron-mutedText text-[10px] uppercase tracking-wider mb-1">Behavior Change Index</div>
          <div className={`text-2xl font-mono font-semibold ${isHighRisk ? "text-red-400" : "text-neuron-primary"}`}>
            {bci.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="w-full">
        <div className="flex justify-between text-[10px] text-neuron-mutedText uppercase font-semibold mb-2 tracking-wide">
          <span>Epoch 1</span>
          <span>Fine-tuning progress</span>
          <span>Epoch 10</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={epoch}
          onChange={(e) => setEpoch(Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-neuron-border"
          style={{ accentColor: "var(--color-accent)" }}
          aria-label="Simulate training epoch"
        />
        <p className="text-[11px] text-neuron-mutedText font-sans mt-3 leading-relaxed">
          Cos sim is the dot product of two unit residual directions. BCI magnifies the drift term (1 − cos sim) by{" "}
          <span className="font-mono">{DRIFT_SCALE}</span> so routine updates stay in the green and severe angular mismatch crosses the{" "}
          <span className="font-mono">{BCI_THRESHOLD}</span> governance line — same as{" "}
          <span className="font-mono">drift_scale</span> in the SDK.
        </p>
      </div>
    </div>
  );
}
