import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const RISK_COLOR = {
  LOW: "#00d4ff",
  MODERATE: "#eab308",
  MEDIUM: "#eab308",
  HIGH: "#f59e0b",
  CRITICAL: "#ef4444",
};

function riskColor(level) {
  return RISK_COLOR[String(level || "LOW").toUpperCase()] || "#64748b";
}

function CustomDot(props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  return <circle cx={cx} cy={cy} r={6} fill={riskColor(payload.risk_level)} stroke="#0a0f1e" strokeWidth={1} />;
}

export default function RetrainingTimeline({ checkpoints = [], demoMode = false }) {
  const data = (checkpoints || []).map((c, i) => ({
    ...c,
    x: c.epoch != null ? c.epoch : i,
    bci: typeof c.bci === "number" ? c.bci : Number(c.bci) || 0,
    risk_level: c.risk_level || "LOW",
    flags: c.flags || [],
  }));

  const shiftEpoch = data.find((d) => ["HIGH", "CRITICAL"].includes(String(d.risk_level).toUpperCase()));

  return (
    <div className="space-y-4">
      <div className="h-72 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="x"
              type="number"
              tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }}
              label={{ value: "Epoch / step index", position: "insideBottom", offset: -4, fill: "#64748b", fontSize: 10 }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }}
              label={{
                value: "BCI",
                angle: -90,
                position: "insideLeft",
                fill: "#64748b",
                fontSize: 10,
              }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const p = payload[0].payload;
                const flags = p.flags?.length ? JSON.stringify(p.flags).slice(0, 120) : "—";
                return (
                  <div
                    style={{
                      background: "#0a0f1e",
                      border: "1px solid #1e293b",
                      fontFamily: "IBM Plex Mono, monospace",
                      fontSize: 12,
                      padding: "8px 10px",
                    }}
                  >
                    <div style={{ color: "#e2e8f0" }}>
                      {p.epoch != null ? `Epoch ${p.epoch}` : `Index ${p.x}`}
                    </div>
                    <div style={{ color: "#00d4ff" }}>BCI {Number(p.bci).toFixed(1)}</div>
                    <div style={{ color: "#94a3b8" }}>Risk {p.risk_level}</div>
                    <div style={{ color: "#64748b", fontSize: 10, marginTop: 4 }}>Flags {flags}</div>
                  </div>
                );
              }}
            />
            <ReferenceLine
              y={25}
              stroke="#f59e0b"
              strokeDasharray="6 4"
              label={{
                value: "HIGH risk threshold",
                fill: "#f59e0b",
                fontSize: 10,
                position: "insideTopRight",
              }}
            />
            <ReferenceLine
              y={50}
              stroke="#ef4444"
              strokeDasharray="6 4"
              label={{
                value: "CRITICAL threshold",
                fill: "#ef4444",
                fontSize: 10,
                position: "insideBottomRight",
              }}
            />
            <Line
              type="monotone"
              dataKey="bci"
              stroke="#475569"
              strokeWidth={2}
              dot={<CustomDot />}
              activeDot={{ r: 8 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {shiftEpoch && (
        <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
          <span className="font-mono text-amber-400 mr-1">⚠</span>
          Behavioral shift detected at epoch{" "}
          <span className="font-mono text-cyan-accent">
            {shiftEpoch.epoch != null ? shiftEpoch.epoch : shiftEpoch.x}
          </span>
          {demoMode ? (
            <span className="text-slate-300">
              {" "}
              — this is when Ring&apos;s model would have been flagged
            </span>
          ) : null}
        </div>
      )}

      {!data.length && (
        <p className="text-sm text-slate-500 font-mono">
          No SDK checkpoints yet. Call <code className="text-cyan-accent/80">neuron.checkpoint()</code> from your
          training loop to populate this timeline.
        </p>
      )}
    </div>
  );
}
