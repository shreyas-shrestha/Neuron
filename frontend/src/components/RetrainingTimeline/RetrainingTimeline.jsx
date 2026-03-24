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
  LOW: "#34d399",
  MODERATE: "#fbbf24",
  MEDIUM: "#fbbf24",
  HIGH: "#f87171",
  CRITICAL: "#a78bfa",
};

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: "8px",
  boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
  fontFamily: "Inter, sans-serif",
  fontSize: "13px",
};

function riskColor(level) {
  return RISK_COLOR[String(level || "LOW").toUpperCase()] || "#71717a";
}

function CustomDot(props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={riskColor(payload.risk_level)}
      stroke="#09090b"
      strokeWidth={2}
    />
  );
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
            <CartesianGrid strokeDasharray="4 4" stroke="#3f3f46" />
            <XAxis
              dataKey="x"
              type="number"
              tick={{ fill: "#a1a1aa", fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}
              axisLine={{ stroke: "#3f3f46" }}
              tickLine={false}
              label={{
                value: "Epoch / step index",
                position: "insideBottom",
                offset: -4,
                fill: "#71717a",
                fontSize: 11,
                fontFamily: "Inter, sans-serif",
              }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "#a1a1aa", fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}
              axisLine={{ stroke: "#3f3f46" }}
              tickLine={false}
              label={{
                value: "BCI",
                angle: -90,
                position: "insideLeft",
                fill: "#71717a",
                fontSize: 11,
                fontFamily: "Inter, sans-serif",
              }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const p = payload[0].payload;
                const flags = p.flags?.length ? JSON.stringify(p.flags).slice(0, 120) : "—";
                return (
                  <div style={{ ...TOOLTIP_STYLE, padding: "8px 10px" }}>
                    <div style={{ color: "#fafafa" }}>
                      {p.epoch != null ? `Epoch ${p.epoch}` : `Index ${p.x}`}
                    </div>
                    <div style={{ color: "#e4e4e7", fontFamily: "JetBrains Mono, monospace" }}>
                      BCI {Number(p.bci).toFixed(1)}
                    </div>
                    <div style={{ color: "#a1a1aa" }}>Risk {p.risk_level}</div>
                    <div style={{ color: "#71717a", fontSize: 11, marginTop: 4 }}>Flags {flags}</div>
                  </div>
                );
              }}
            />
            <ReferenceLine
              y={25}
              stroke="#fbbf24"
              strokeDasharray="6 4"
              strokeOpacity={0.6}
              label={{
                value: "HIGH risk threshold",
                fill: "#a1a1aa",
                fontSize: 10,
                position: "insideTopRight",
              }}
            />
            <ReferenceLine
              y={50}
              stroke="#f87171"
              strokeDasharray="6 4"
              strokeOpacity={0.6}
              label={{
                value: "CRITICAL threshold",
                fill: "#a1a1aa",
                fontSize: 10,
                position: "insideBottomRight",
              }}
            />
            <Line
              type="monotone"
              dataKey="bci"
              stroke="#818cf8"
              strokeWidth={2}
              dot={<CustomDot />}
              activeDot={{ r: 6, strokeWidth: 2, fill: "#818cf8", stroke: "#09090b" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {shiftEpoch && (
        <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-neuron-primary border-l-[3px] border-l-neuron-warning font-sans flex items-start gap-2">
          <svg className="w-5 h-5 text-neuron-warning shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
          </svg>
          <div>
            Behavioral shift detected at epoch{" "}
            <span className="font-mono font-semibold text-neuron-primary">
              {shiftEpoch.epoch != null ? shiftEpoch.epoch : shiftEpoch.x}
            </span>
            {demoMode ? (
              <span className="text-neuron-secondary"> — this is when Ring&apos;s model would have been flagged</span>
            ) : null}
          </div>
        </div>
      )}

      {!data.length && (
        <p className="text-sm text-neuron-secondary font-sans">
          No SDK checkpoints yet. Call{" "}
          <code className="font-mono text-[12px] text-neuron-secondary bg-neuron-muted px-1 rounded border border-neuron-border">
            neuron.checkpoint()
          </code>{" "}
          from your training loop to populate this timeline.
        </p>
      )}
    </div>
  );
}
