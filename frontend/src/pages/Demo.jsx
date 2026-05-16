import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DriftSimulator from "../components/Demo/DriftSimulator.jsx";
import LayerTrajectoryChart from "../components/LayerTrajectory/LayerTrajectoryChart.jsx";
import RetrainingTimeline from "../components/RetrainingTimeline/RetrainingTimeline.jsx";
import RiskFlagList from "../components/RiskFlags/RiskFlagList.jsx";
import { demoHealth, demoSetup } from "../services/demoApi.js";
import { bciRiskLabel } from "../utils/bciDisplay.js";

const TOTAL_STEPS = 6;

const NARRATIVE = [
  {
    headline: "A model ships. No one notices.",
    body: "Companies rely on testing outputs and headline metrics. Things can look fine while bias and risky behavior creep in where those tests do not look — inside the model's layers.",
  },
  {
    headline: "Something changed during retraining.",
    body: "Between checkpoints, internal representations can shift in ways output-only checks miss. The problem is often in the model's internal layers, not the final answer users see.",
  },
  {
    headline: "Neuron sees inside the model.",
    body: "We monitor what changes across layers during every retraining run — not just what the model prints out, but how it represents inputs on the way there.",
  },
  {
    headline: "How the math works.",
    body: "We compare residual-stream directions at monitored layers: cosine similarity near 1 means stable representations; as fine-tuning pushes activations apart, similarity drops. The Behavior Change Index is (1 − cosine similarity) × drift_scale (60 in our SDK). Above 20, the run is flagged the same way as your compliance PDF and dashboard — so the number you see is not arbitrary.",
  },
  {
    headline: "The spike that should have triggered an alert.",
    body: "Later in training, the Behavior Change Index crosses the HIGH threshold. A concerning pattern shows up deep in the network. That's the moment to stop and investigate — before deployment.",
  },
  {
    headline: "Caught before deployment.",
    body: "With Neuron in the training loop, that spike surfaces as an alert while you still control the release — when you can fix or roll back, not after the model is live.",
  },
];

function statusTone(level) {
  const risk = String(level || "LOW").toUpperCase();
  if (risk === "CRITICAL") return "bg-violet-500/12 border-violet-500/30 text-neuron-critical";
  if (risk === "HIGH") return "bg-red-500/12 border-red-500/30 text-neuron-high";
  if (risk === "MODERATE" || risk === "MEDIUM") return "bg-amber-500/12 border-amber-500/30 text-neuron-moderate";
  return "bg-emerald-500/12 border-emerald-500/30 text-neuron-low";
}

function DemoNav() {
  return (
    <header className="h-14 border-b border-neuron-border bg-neuron-bg flex items-center justify-between px-4 lg:px-8 relative">
      <Link to="/" className="shrink-0 font-display font-semibold text-[17px] text-neuron-primary tracking-tight">
        Neuron
      </Link>
      <div className="hidden sm:flex absolute left-1/2 -translate-x-1/2">
        <span className="text-[13px] font-medium font-sans px-3 py-1 rounded-full border border-neuron-accent/45 text-neuron-secondary bg-neuron-accent/5">
          Interactive Demo
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link to="/login" className="text-[13px] font-medium text-neuron-secondary hover:text-neuron-primary px-3 py-2 rounded-sm transition-colors duration-150">
          Sign In
        </Link>
        <Link to="/onboarding" className="btn-primary text-[13px] min-h-[36px] py-2 px-4">
          Get Started
        </Link>
      </div>
    </header>
  );
}

export default function Demo() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);
  const [step, setStep] = useState(3);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const raw = localStorage.getItem("neuron_demo_payload");
      if (raw) {
        try {
          const cached = JSON.parse(raw);
          if (cached?.demo_token) {
            setPayload(cached);
            localStorage.setItem("neuron_demo_token", cached.demo_token);
            return;
          }
        } catch {
          /* invalid JSON — fetch fresh */
        }
      }
      const health = await demoHealth();
      if (!health?.demo_ready) {
        throw new Error("Demo service is not available.");
      }
      const data = await demoSetup();
      setPayload(data);
      if (data.demo_token) {
        localStorage.setItem("neuron_demo_token", data.demo_token);
      }
      localStorage.setItem("neuron_demo_payload", JSON.stringify(data));
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "Demo setup failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (loading || error) return undefined;
    const t = setInterval(() => {
      setStep((s) => (s >= TOTAL_STEPS ? TOTAL_STEPS : s + 1));
    }, 6000);
    return () => clearInterval(t);
  }, [loading, error]);

  const trajectories = payload?.trajectories;
  const checkpoints = payload?.checkpoints || [];
  const traj = trajectories?.problematic;
  const curve = traj?.per_layer_curve;
  const novel = traj?.novel_features_by_layer;
  const flags = payload?.risk_flags_high || [];
  const latestCheckpoint = checkpoints[checkpoints.length - 1] || null;
  const latestBci = Number(latestCheckpoint?.bci || latestCheckpoint?.behavior_change_index || 0);
  const previousBci = Number(
    checkpoints.length > 1 ? checkpoints[checkpoints.length - 2]?.bci || checkpoints[checkpoints.length - 2]?.behavior_change_index || 0 : 0
  );
  const bciDelta = latestCheckpoint ? latestBci - previousBci : 0;
  const riskLabel = latestCheckpoint?.risk_level || bciRiskLabel(latestBci);
  const timelinePitch = [
    "This baseline checkpoint looks normal.",
    "After retraining, the checkpoint drift score rises even before a human would notice anything obvious in outputs.",
    "On the last checkpoint, Neuron marks the run as high risk and shows exactly where we would stop the release.",
  ];

  return (
    <div className="min-h-screen bg-neuron-subtle text-neuron-primary">
      <DemoNav />

      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-10 flex flex-col lg:flex-row gap-10 lg:gap-12">
        <div className="lg:w-[40%] shrink-0 lg:sticky lg:top-20 lg:self-start space-y-8">
          <div className="flex gap-2 mb-2 flex-wrap items-center">
            {NARRATIVE.map((_, i) => {
              const n = i + 1;
              const active = n === step;
              const done = n < step;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setStep(n)}
                  className={`relative w-9 h-9 rounded-full text-[12px] font-mono font-semibold transition-all duration-500 ease-out ${
                    active
                      ? "text-neuron-primary bg-neuron-muted border-2 border-neuron-border ring-2 ring-neuron-accent ring-offset-2 ring-offset-neuron-subtle shadow-[0_0_28px_-6px_rgba(129,140,248,0.65)] scale-105 z-10"
                      : done
                        ? "text-neuron-secondary bg-neuron-muted border-2 border-neuron-accent/35"
                        : "text-neuron-mutedText bg-neuron-muted/50 border-2 border-neuron-border"
                  }`}
                  aria-label={`Go to step ${n}`}
                >
                  {n}
                </button>
              );
            })}
          </div>

          <div className="flex justify-center gap-4">
            <button
              type="button"
              disabled={step <= 1}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="text-[13px] font-medium text-neuron-secondary hover:text-neuron-primary disabled:opacity-30"
            >
              ← Prev
            </button>
            <button
              type="button"
              disabled={step >= TOTAL_STEPS}
              onClick={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))}
              className="text-[13px] font-medium text-neuron-secondary hover:text-neuron-primary disabled:opacity-30"
            >
              Next →
            </button>
          </div>

          {NARRATIVE.map((block, i) => {
            const n = i + 1;
            const active = n === step;
            return (
              <div
                key={n}
                className={`transition-opacity duration-300 ${active ? "opacity-100" : "opacity-40"}`}
              >
                <div className="font-mono text-[12px] text-neuron-mutedText font-semibold tracking-wide">
                  {String(n).padStart(2, "0")}
                </div>
                <h2 className="font-display font-bold text-[22px] text-neuron-primary mt-1 leading-snug">
                  {block.headline}
                </h2>
                <p className="mt-3 text-[16px] text-neuron-secondary font-sans leading-[1.7]">{block.body}</p>
              </div>
            );
          })}

          <div className="pt-4">
            <div className="h-0.5 w-full bg-neuron-border rounded-full overflow-hidden">
              <div
                className="h-full bg-neuron-accent transition-all duration-500 rounded-full"
                style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
              />
            </div>
            <p className="text-[13px] text-neuron-mutedText font-sans mt-2">
              Step {step} of {TOTAL_STEPS}
            </p>
          </div>
        </div>

        <div className="lg:w-[60%] min-w-0 flex-1">
          {!loading && !error && payload && (
            <section className="mb-6 rounded-[20px] border border-neuron-border bg-[radial-gradient(circle_at_top_left,rgba(129,140,248,0.12),transparent_34%),linear-gradient(180deg,rgba(24,24,27,0.96),rgba(9,9,11,0.96))] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.78)] overflow-hidden">
              <div className="px-5 py-4 border-b border-neuron-border flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-neuron-mutedText">
                    Investor Demo Story
                  </div>
                  <h2 className="mt-1 font-display font-bold text-[24px] text-neuron-primary leading-tight">
                    Retraining looked safe on the surface. Internally, the model drifted.
                  </h2>
                </div>
                <div className={`rounded-full border px-3 py-1 text-[11px] font-mono font-semibold uppercase tracking-wide ${statusTone(riskLabel)}`}>
                  {riskLabel} checkpoint
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-0">
                <div className="px-5 py-5 border-b lg:border-b-0 lg:border-r border-neuron-border space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-neuron-border bg-neuron-bg/70 px-4 py-3">
                      <div className="text-[11px] uppercase tracking-wide text-neuron-mutedText">Current BCI</div>
                      <div className="mt-1 text-[28px] font-mono font-semibold text-neuron-primary">{latestBci.toFixed(1)}</div>
                    </div>
                    <div className="rounded-xl border border-neuron-border bg-neuron-bg/70 px-4 py-3">
                      <div className="text-[11px] uppercase tracking-wide text-neuron-mutedText">Delta vs prior</div>
                      <div className={`mt-1 text-[28px] font-mono font-semibold ${bciDelta >= 0 ? "text-neuron-high" : "text-neuron-low"}`}>
                        {bciDelta >= 0 ? "+" : ""}
                        {bciDelta.toFixed(1)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-neuron-border bg-neuron-bg/70 px-4 py-3">
                      <div className="text-[11px] uppercase tracking-wide text-neuron-mutedText">Flags</div>
                      <div className="mt-1 text-[28px] font-mono font-semibold text-neuron-primary">{flags.length}</div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-neuron-border bg-neuron-bg/60 px-4 py-4">
                    <div className="text-[12px] font-semibold uppercase tracking-wide text-neuron-secondary">What to say</div>
                    <ol className="mt-3 space-y-2 text-[14px] text-neuron-secondary font-sans leading-relaxed list-decimal pl-5">
                      {timelinePitch.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ol>
                  </div>
                </div>

                <div className="px-5 py-5 space-y-3">
                  <div className="text-[12px] font-semibold uppercase tracking-wide text-neuron-secondary">Why this matters</div>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="rounded-xl border border-neuron-border bg-neuron-bg/60 px-4 py-3">
                      <div className="text-[13px] font-semibold text-neuron-primary">Most teams only evaluate outputs</div>
                      <p className="mt-1 text-[13px] text-neuron-secondary font-sans leading-relaxed">
                        Neuron compares checkpoints at the representation level, so you can see hidden shift before it becomes a production incident.
                      </p>
                    </div>
                    <div className="rounded-xl border border-neuron-border bg-neuron-bg/60 px-4 py-3">
                      <div className="text-[13px] font-semibold text-neuron-primary">This is release governance for model updates</div>
                      <p className="mt-1 text-[13px] text-neuron-secondary font-sans leading-relaxed">
                        The product answer is simple: did this retrain meaningfully change the model, and should we still ship it?
                      </p>
                    </div>
                    <div className="rounded-xl border border-neuron-border bg-neuron-bg/60 px-4 py-3">
                      <div className="text-[13px] font-semibold text-neuron-primary">The evidence is checkpoint-native</div>
                      <p className="mt-1 text-[13px] text-neuron-secondary font-sans leading-relaxed">
                        Timeline, BCI deltas, drift math, and flagged layers all live on the model checkpoint history instead of in a disconnected eval spreadsheet.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          <div className="bg-neuron-bg rounded-lg shadow-lg border border-neuron-border overflow-hidden transition-all duration-150 hover:shadow-xl">
            <div className="h-9 bg-neuron-muted border-b border-neuron-border flex items-center gap-2 px-3">
              <div className="flex gap-1.5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              </div>
              <div className="flex-1 mx-2 h-6 bg-neuron-bg border border-neuron-border rounded text-[11px] font-mono text-neuron-mutedText flex items-center px-2 truncate">
                neuron.ai/demo
              </div>
            </div>

            <div className="p-5 space-y-5 bg-neuron-subtle/50">
              {loading && (
                <div className="space-y-4">
                  <div className="h-32 rounded-md shimmer border border-neuron-border" />
                  <div className="h-48 rounded-md shimmer border border-neuron-border" />
                  <div className="h-24 rounded-md shimmer border border-neuron-border" />
                </div>
              )}
              {error && (
                <div className="rounded-md border-l-[3px] border-l-neuron-danger bg-neuron-danger-light p-4 text-neuron-danger text-sm font-sans">
                  {error}
                  <button
                    type="button"
                    className="block mt-3 text-[13px] font-semibold text-neuron-accent hover:underline"
                    onClick={load}
                  >
                    Retry
                  </button>
                </div>
              )}
              {!loading && !error && payload && (
                <div className="space-y-5">
                  <section className="bg-neuron-bg rounded-md border border-neuron-border p-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-display font-semibold text-[14px] text-neuron-primary">Retraining timeline</h3>
                        <p className="mt-1 text-[12px] text-neuron-secondary font-sans leading-relaxed">
                          Start here in the room. This chart is the proof that the checkpoint became riskier over time.
                        </p>
                      </div>
                      <div className="rounded-md border border-neuron-border bg-neuron-muted/50 px-3 py-2 text-[11px] text-neuron-secondary font-mono">
                        Baseline → Drift → High-risk checkpoint
                      </div>
                    </div>
                    <RetrainingTimeline checkpoints={checkpoints} demoMode />
                  </section>
                  <section className="bg-neuron-bg rounded-md border border-neuron-border p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-display font-semibold text-[14px] text-neuron-primary">Layer trajectory</h3>
                        <p className="mt-1 text-[12px] text-neuron-secondary font-sans leading-relaxed">
                          Then show that the shift is happening inside the network, not just in a surface benchmark.
                        </p>
                      </div>
                    </div>
                    {curve && Object.keys(curve).length > 0 ? (
                      <div className="h-[260px] min-h-[200px]">
                        <LayerTrajectoryChart curve={curve} novelFeatures={novel} />
                      </div>
                    ) : (
                      <div className="text-neuron-secondary text-sm font-sans">No curve data</div>
                    )}
                  </section>
                  <section
                    className={`bg-neuron-bg rounded-md border border-neuron-border p-4 shadow-sm transition-[box-shadow,ring] duration-500 ease-out ${
                      step === 4
                        ? "ring-1 ring-neuron-accent/50 shadow-[0_0_28px_-10px_rgba(129,140,248,0.45)]"
                        : "ring-0 shadow-sm"
                    }`}
                  >
                    <h3 className="font-display font-semibold text-[14px] text-neuron-primary mb-3">Residual drift & BCI</h3>
                    <p className="text-[12px] text-neuron-secondary font-sans mb-4 leading-relaxed">
                      Drag the epoch slider to see how cosine similarity between two residual directions maps to the Behavior Change Index —
                      same formula as the SDK (
                      <span className="font-mono text-[11px]">drift_scale=60</span>
                      ). Step 4 in the tour goes deeper on why this matters.
                    </p>
                    <DriftSimulator embedded />
                  </section>
                  <section className="bg-neuron-bg rounded-md border border-neuron-border p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-display font-semibold text-[14px] text-neuron-primary">Behavior flags</h3>
                        <p className="mt-1 text-[12px] text-neuron-secondary font-sans leading-relaxed">
                          Finish by saying: “This is the checkpoint we would block from release.”
                        </p>
                      </div>
                    </div>
                    <RiskFlagList flags={flags} />
                  </section>
                  <p className="text-[12px] text-neuron-mutedText font-sans">
                    Model: Demo classifier v2 · Synthetic trajectories (no live inference)
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 pb-16 text-center">
        <p className="font-display font-semibold text-lg text-neuron-primary">Ready to monitor your own models?</p>
        <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Link to="/onboarding" className="btn-primary h-10 px-6">
            Get Started Free →
          </Link>
          <Link to="/docs" className="text-[14px] text-neuron-mutedText font-sans hover:text-neuron-secondary">
            Read the docs
          </Link>
        </div>
      </div>
    </div>
  );
}
