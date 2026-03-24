import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import LayerTrajectoryChart from "../components/LayerTrajectory/LayerTrajectoryChart.jsx";
import RetrainingTimeline from "../components/RetrainingTimeline/RetrainingTimeline.jsx";
import RiskFlagList from "../components/RiskFlags/RiskFlagList.jsx";
import { demoHealth, demoSetup } from "../services/demoApi.js";

const NARRATIVE = [
  {
    headline: "A model ships. No one notices.",
    body: "Ring's person-detection model passed every benchmark. Accuracy looked fine. The eval suite showed no red flags. Then Reddit noticed something wrong.",
  },
  {
    headline: "Something changed during retraining.",
    body: "Between production v1 and the new retrain, a harmful feature emerged inside the model. Not in the outputs — inside the internal representations. No existing tool caught it.",
  },
  {
    headline: "Neuron sees inside the model.",
    body: "We monitor what changes in the model's internal layers during every retraining run. Not just what it outputs — what it learns.",
  },
  {
    headline: "The spike that should have triggered an alert.",
    body: "At epoch 3, the Behavior Change Index crossed the HIGH threshold. Layer 8 showed a new feature activating on dark-skinned faces. This is what Ring needed before they deployed.",
  },
  {
    headline: "Caught before deployment.",
    body: "With Neuron integrated into their training loop, this alert fires before the model ships. Not after it goes viral on Reddit.",
  },
];

function DemoNav() {
  return (
    <header className="h-14 border-b border-neuron-border bg-neuron-bg flex items-center justify-between px-4 lg:px-8 relative">
      <Link to="/" className="flex items-center gap-3 shrink-0">
        <div className="w-7 h-7 rounded-md bg-neuron-accent text-zinc-950 font-display font-bold text-sm flex items-center justify-center">
          N
        </div>
        <span className="font-display font-semibold text-[15px] text-neuron-primary">Neuron</span>
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
      const health = await demoHealth();
      if (!health?.demo_ready) {
        throw new Error("Demo service is not available.");
      }
      const data = await demoSetup();
      setPayload(data);
      if (data.demo_token) {
        localStorage.setItem("neuron_demo_token", data.demo_token);
      }
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
      setStep((s) => (s >= 5 ? 5 : s + 1));
    }, 6000);
    return () => clearInterval(t);
  }, [loading, error]);

  const trajectories = payload?.trajectories;
  const checkpoints = payload?.checkpoints || [];
  const traj = trajectories?.problematic;
  const curve = traj?.per_layer_curve;
  const novel = traj?.novel_features_by_layer;
  const flags = payload?.risk_flags_high || [];

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
              disabled={step >= 5}
              onClick={() => setStep((s) => Math.min(5, s + 1))}
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
                style={{ width: `${(step / 5) * 100}%` }}
              />
            </div>
            <p className="text-[13px] text-neuron-mutedText font-sans mt-2">Step {step} of 5</p>
          </div>
        </div>

        <div className="lg:w-[60%] min-w-0 flex-1">
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
                    <h3 className="font-display font-semibold text-[14px] text-neuron-primary mb-3">Retraining timeline</h3>
                    <RetrainingTimeline checkpoints={checkpoints} demoMode />
                  </section>
                  <section className="bg-neuron-bg rounded-md border border-neuron-border p-4 shadow-sm">
                    <h3 className="font-display font-semibold text-[14px] text-neuron-primary mb-3">Layer trajectory</h3>
                    {curve && Object.keys(curve).length > 0 ? (
                      <div className="h-[260px] min-h-[200px]">
                        <LayerTrajectoryChart curve={curve} novelFeatures={novel} />
                      </div>
                    ) : (
                      <div className="text-neuron-secondary text-sm font-sans">No curve data</div>
                    )}
                  </section>
                  <section className="bg-neuron-bg rounded-md border border-neuron-border p-4 shadow-sm">
                    <h3 className="font-display font-semibold text-[14px] text-neuron-primary mb-3">Behavior flags</h3>
                    <RiskFlagList flags={flags} />
                  </section>
                  <p className="text-[12px] text-neuron-mutedText font-sans">
                    Model: Ring Person Detector v2 · Synthetic trajectories (no live inference)
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
