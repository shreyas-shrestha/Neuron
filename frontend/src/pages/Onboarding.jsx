import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { analysisResults, analysisStatus, fetchMe, registerModel } from "../services/api.js";
import { ANALYSIS_POLL_MAX_WAIT_MS, backoffInterval, pollTimedOut } from "../utils/pollBackoff.js";

const STEPS = ["Connect", "Analyze"];

const ANALYSIS_PHASES = [
  "Connecting to model...",
  "Extracting layer activations...",
  "Building behavioral baseline...",
  "Running probe analysis...",
  "Analysis complete",
];

function CheckMini({ className = "w-4 h-4" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function bciToRiskLabel(score) {
  const s = Number(score) || 0;
  if (s < 10) return "LOW";
  if (s < 25) return "MODERATE";
  if (s < 50) return "HIGH";
  return "CRITICAL";
}

function analysisPhaseProgress(status, progress) {
  if (!status) return { completedCount: 0, failed: false };
  if (status === "failed") return { completedCount: 0, failed: true };
  if (status === "complete") return { completedCount: 5, failed: false };
  if (status === "pending") return { completedCount: 0, failed: false };
  if (status === "running") {
    const p = progress ?? 0;
    return { completedCount: 1 + Math.min(3, Math.floor(p * 4)), failed: false };
  }
  return { completedCount: 0, failed: false };
}

function StepIndicator({ step }) {
  const connectDone = step >= 2;
  const lineActive = step >= 2;

  return (
    <div className="w-full max-w-md mx-auto mb-10 px-1">
      <div className="flex items-center justify-center gap-0">
        <div className="flex flex-col items-center w-[76px] shrink-0">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold border-2 transition-all duration-300 ${
              connectDone
                ? "bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/25"
                : step === 1
                  ? "border-neuron-accent bg-neuron-muted text-neuron-primary"
                  : "border-neuron-border bg-neuron-bg text-neuron-mutedText"
            }`}
            aria-current={step === 1 ? "step" : undefined}
          >
            {connectDone ? <CheckMini className="w-4 h-4 text-white" /> : "1"}
          </div>
        </div>

        <div
          className={`h-0.5 flex-1 min-w-[2.5rem] max-w-[7.5rem] rounded-full transition-colors duration-300 ${
            lineActive ? "bg-emerald-500" : "bg-neuron-border"
          }`}
          aria-hidden
        />

        <div className="flex flex-col items-center w-[76px] shrink-0">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold border-2 transition-all duration-300 ${
              step === 2
                ? "border-neuron-accent bg-neuron-muted text-neuron-primary"
                : "border-neuron-border bg-neuron-bg text-neuron-mutedText"
            }`}
            aria-current={step === 2 ? "step" : undefined}
          >
            2
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-0 mt-2.5">
        <span
          className={`w-[76px] shrink-0 text-center text-[12px] font-sans leading-tight ${
            connectDone ? "text-emerald-600 dark:text-emerald-400 font-medium" : step === 1 ? "text-neuron-primary font-medium" : "text-neuron-secondary"
          }`}
        >
          {STEPS[0]}
        </span>
        <span className="flex-1 min-w-[2.5rem] max-w-[7.5rem]" aria-hidden />
        <span
          className={`w-[76px] shrink-0 text-center text-[12px] font-sans leading-tight ${
            step === 2 ? "text-neuron-primary font-medium" : "text-neuron-secondary"
          }`}
        >
          {STEPS[1]}
        </span>
      </div>
    </div>
  );
}

/** Stacked choices: HuggingFace → Local → Python SDK (recommended), top to bottom. */
const CONNECTION_CHOICES = [
  {
    id: "huggingface",
    title: "HuggingFace Model",
    description: "Analyze any public HF model",
  },
  {
    id: "local",
    title: "Local Checkpoint",
    description: "Upload a checkpoint path",
  },
  {
    id: "sdk",
    title: "Python SDK",
    description: "Monitor models during retraining",
    recommended: true,
  },
];

function ConnectionStack({ value, onChange }) {
  return (
    <div className="space-y-2.5" role="radiogroup" aria-label="How to connect your model">
      {CONNECTION_CHOICES.map((c) => {
        const selected = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(c.id)}
            className={`w-full text-left rounded-lg border px-4 py-3.5 transition-colors duration-150 ${
              selected
                ? "border-neuron-accent bg-neuron-accent/5 shadow-sm"
                : "border-neuron-border bg-neuron-bg hover:border-neuron-border hover:bg-neuron-muted/30"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display font-semibold text-[15px] text-neuron-primary leading-snug">{c.title}</div>
                <p className="text-[12px] text-neuron-secondary font-sans mt-1 leading-relaxed">{c.description}</p>
              </div>
              {c.recommended ? (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/35 self-start">
                  Recommended
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function Onboarding() {
  useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const [step, setStep] = useState(1);
  const [selectedOption, setSelectedOption] = useState("huggingface");
  const [hfId, setHfId] = useState("gpt2");
  const [localCheckpointPath, setLocalCheckpointPath] = useState("");
  const [localModelName, setLocalModelName] = useState("");
  const [busy, setBusy] = useState(false);
  const [phaseProgressPct, setPhaseProgressPct] = useState(0);
  const [summary, setSummary] = useState(null);
  const [finishError, setFinishError] = useState("");
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);

  async function startAnalysis(e) {
    e.preventDefault();
    setFinishError("");
    setBusy(true);
    setSummary(null);
    setJobId(null);
    setJobStatus(null);
    setPhaseProgressPct(0);
    try {
      if (selectedOption === "huggingface") {
        const trimmed = hfId.trim();
        if (!trimmed) return;
        const short = trimmed.split("/").pop() || "model";
        const res = await registerModel({
          name: short,
          huggingface_id: trimmed,
          domain: "general",
        });
        setJobId(res.initial_analysis_job_id);
        setStep(2);
      } else if (selectedOption === "local") {
        const path = localCheckpointPath.trim();
        if (!path) return;
        const short =
          localModelName.trim() ||
          path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ||
          "checkpoint";
        const res = await registerModel({
          name: short,
          checkpoint_path: path,
          domain: "general",
        });
        setJobId(res.initial_analysis_job_id);
        setStep(2);
      }
    } catch (err) {
      setFinishError(err?.response?.data?.detail || err?.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!jobId) return undefined;
    const pollStartedAt = Date.now();
    let cancelled = false;
    let timeoutId;
    let attempt = 0;
    async function tick() {
      if (pollTimedOut(pollStartedAt, ANALYSIS_POLL_MAX_WAIT_MS)) {
        if (!cancelled) {
          setFinishError(
            "Analysis did not finish within 45 minutes. Check server workers, GPU memory, and model size—or try a smaller model (e.g. gpt2)."
          );
        }
        return;
      }
      try {
        const s = await analysisStatus(jobId);
        if (cancelled) return;
        setJobStatus(s);
        setPhaseProgressPct(Math.round((s.progress ?? 0) * 100));
        if (s.status === "complete") {
          const r = await analysisResults(jobId);
          if (cancelled) return;
          const bci = Math.round(r.overall_risk_score ?? 0);
          setSummary({
            bci,
            risk: bciToRiskLabel(r.overall_risk_score ?? 0),
            layers: r.trajectory?.layer_count ?? "—",
            analysisId: jobId,
            sae_trained: r.trajectory?.sae_trained === true,
          });
          return;
        }
        if (s.status === "failed") {
          setFinishError(s.error_message?.trim() || "Analysis job failed.");
          return;
        }
        attempt += 1;
        timeoutId = setTimeout(tick, backoffInterval(attempt, 3000, 8000));
      } catch (err) {
        if (!cancelled) setFinishError(err?.response?.data?.detail || err?.message || "Status poll failed");
        if (!cancelled) {
          attempt += 1;
          timeoutId = setTimeout(tick, backoffInterval(attempt, 2000));
        }
      }
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [jobId]);

  return (
    <div className="max-w-lg mx-auto min-h-screen pb-14 px-1">
      <header className="mb-9">
        <p className="text-[13px] text-neuron-mutedText font-sans tracking-wide">Onboarding</p>
        <h1 className="font-display font-semibold text-2xl text-neuron-primary mt-1.5">Add a model</h1>
      </header>

      <StepIndicator step={step} />

      {step === 1 && (
        <section className="space-y-6">
          <h2 className="font-display font-semibold text-[16px] text-neuron-primary leading-snug pr-1">
            What model do you want to monitor?
          </h2>

          <ConnectionStack value={selectedOption} onChange={setSelectedOption} />

          <div className="border-t border-neuron-border pt-6 space-y-5" role="region" aria-label="Connection details">
            {selectedOption === "sdk" && (
              <div className="space-y-4">
                <p className="text-[13px] text-neuron-secondary font-sans leading-relaxed">
                  Monitor models during retraining from your training loop.
                </p>
                <pre className="p-4 rounded-lg border border-neuron-border bg-neuron-muted/25 text-[12px] font-mono text-neuron-primary overflow-x-auto leading-relaxed">
                  {`import neuron
neuron.init(api_key="nrn_...", model_id="your-model")
neuron.checkpoint(model, epoch=epoch)`}
                </pre>
                <Link
                  to="/settings"
                  className="inline-flex btn-secondary text-[13px] min-h-[44px] px-5 items-center justify-center w-full sm:w-auto"
                >
                  Get API key in Settings →
                </Link>
              </div>
            )}

            {selectedOption === "huggingface" && (
              <form onSubmit={startAnalysis} className="space-y-5">
                <label className="block">
                  <span className="text-[13px] font-medium text-neuron-secondary font-sans">HuggingFace model ID</span>
                  <input
                    className="input-neuron mt-2 w-full font-mono text-sm"
                    placeholder="gpt2"
                    value={hfId}
                    onChange={(e) => setHfId(e.target.value)}
                  />
                </label>
                <p className="text-[12px] text-neuron-mutedText font-sans -mt-1">Start with gpt2 for a fast demo (~2 min)</p>
                {finishError && (
                  <div className="text-sm text-neuron-danger font-sans border-l-[3px] border-l-neuron-danger bg-neuron-danger-light px-3 py-2.5 rounded-sm">
                    {finishError}
                  </div>
                )}
                <button type="submit" disabled={busy || !hfId.trim()} className="btn-primary w-full min-h-[44px] disabled:opacity-40">
                  {busy ? "Starting…" : "Start Analysis →"}
                </button>
              </form>
            )}

            {selectedOption === "local" && (
              <form onSubmit={startAnalysis} className="space-y-5">
                <label className="block">
                  <span className="text-[13px] font-medium text-neuron-secondary font-sans">Checkpoint path</span>
                  <input
                    className="input-neuron mt-2 w-full font-mono text-sm"
                    placeholder="/path/to/checkpoint.pt"
                    value={localCheckpointPath}
                    onChange={(e) => setLocalCheckpointPath(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-[13px] font-medium text-neuron-secondary font-sans">Name (optional)</span>
                  <input
                    className="input-neuron mt-2 w-full text-sm"
                    placeholder="My fine-tuned model"
                    value={localModelName}
                    onChange={(e) => setLocalModelName(e.target.value)}
                  />
                </label>
                {finishError && (
                  <div className="text-sm text-neuron-danger font-sans border-l-[3px] border-l-neuron-danger bg-neuron-danger-light px-3 py-2.5 rounded-sm">
                    {finishError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={busy || !localCheckpointPath.trim()}
                  className="btn-primary w-full min-h-[44px] disabled:opacity-40"
                >
                  {busy ? "Starting…" : "Start Analysis →"}
                </button>
              </form>
            )}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          <h2 className="font-display font-semibold text-[16px] text-neuron-primary leading-snug">Analyzing your model</h2>
          <p className="text-[13px] text-neuron-mutedText font-sans leading-relaxed">~2 min for GPT-2 · larger models take longer</p>
          <div className="h-2 w-full bg-neuron-muted rounded-full overflow-hidden border border-neuron-border">
            <div
              className="h-full bg-neuron-accent transition-all duration-300 rounded-full"
              style={{
                width: `${jobStatus?.status === "complete" ? 100 : phaseProgressPct}%`,
              }}
            />
          </div>
          <ul className="space-y-3.5 pt-1">
            {(() => {
              const { completedCount, failed } = analysisPhaseProgress(jobStatus?.status, jobStatus?.progress);
              return ANALYSIS_PHASES.map((label, idx) => {
                const allDone = jobStatus?.status === "complete";
                const check = allDone || idx < completedCount;
                const active =
                  !allDone && !failed && idx === completedCount && jobStatus?.status !== "failed";
                return (
                  <li
                    key={label}
                    className={`flex items-center gap-3 font-sans text-sm transition-colors duration-200 ${
                      check
                        ? "text-neuron-success line-through decoration-neuron-success/50"
                        : active
                          ? "text-neuron-accent font-medium"
                          : "text-neuron-mutedText"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-mono ${
                        check
                          ? "bg-emerald-100 text-neuron-success"
                          : active
                            ? "bg-neuron-accent-light text-neuron-accent animate-pulse"
                            : "bg-neuron-muted text-neuron-mutedText"
                      }`}
                    >
                      {check ? (
                        <CheckMini className="w-3.5 h-3.5 text-neuron-success" />
                      ) : active ? (
                        <span className="h-2 w-2 rounded-full bg-neuron-accent animate-pulse" aria-hidden />
                      ) : (
                        <span className="text-neuron-mutedText">…</span>
                      )}
                    </span>
                    {label}
                  </li>
                );
              });
            })()}
          </ul>
          {finishError && (
            <div className="text-neuron-danger text-sm font-sans border-l-[3px] border-l-neuron-danger bg-neuron-danger-light p-3 rounded-sm">
              {finishError}
              <button
                type="button"
                className="block mt-2 text-neuron-accent font-medium underline text-xs"
                onClick={() => {
                  setStep(1);
                  setFinishError("");
                  setJobId(null);
                }}
              >
                Back to model input
              </button>
            </div>
          )}

          {jobStatus?.status === "complete" && summary && (
            <div className="bg-neuron-bg border border-neuron-border rounded-lg shadow-md p-6 space-y-5">
              <div className="flex justify-center text-neuron-success">
                <CheckMini className="w-12 h-12 animate-[pulse_0.6s_ease-out_1]" aria-hidden />
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-[12px] font-sans text-neuron-mutedText">BCI</div>
                  <div className="text-2xl font-mono font-bold text-neuron-accent">{summary.bci ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[12px] font-sans text-neuron-mutedText">Risk</div>
                  <div className="text-2xl font-mono font-bold text-neuron-warning">{summary.risk}</div>
                </div>
                <div>
                  <div className="text-[12px] font-sans text-neuron-mutedText">Layers</div>
                  <div className="text-2xl font-mono font-bold text-neuron-primary">{summary.layers}</div>
                </div>
              </div>
              {summary.sae_trained !== true && (
                <div className="mt-4 p-4 rounded-lg border border-amber-500/35 bg-amber-500/10 text-left">
                  <div className="flex gap-2 items-start">
                    <span className="text-amber-400 text-sm mt-0.5" aria-hidden>
                      ⚠
                    </span>
                    <div>
                      <p className="text-amber-100 text-sm font-semibold font-sans">Results use untrained SAE weights</p>
                      <p className="text-amber-200/90 text-xs mt-1 leading-relaxed font-sans">
                        For meaningful trajectory analysis, train SAE checkpoints by running:
                      </p>
                      <code className="block mt-2 p-2 bg-amber-950/40 rounded text-xs font-mono text-amber-100 border border-amber-500/25">
                        python scripts/train_sae_layer0.py --layer 0
                      </code>
                      <p className="text-amber-300/80 text-xs mt-1 font-sans">
                        ~30 min on CPU · run layers 0, 5, 11 for full coverage
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {summary.analysisId ? (
                <Link
                  to={`/analysis/${summary.analysisId}${summary.sae_trained === true ? "" : "?untrained=1"}`}
                  className="inline-block w-full text-center btn-primary py-3 text-[14px]"
                >
                  View full analysis →
                </Link>
              ) : null}
            </div>
          )}
        </section>
      )}

      <p className="mt-12 text-center text-xs text-neuron-mutedText font-sans">
        <Link to="/" className="text-neuron-accent font-medium hover:underline">
          Back to models
        </Link>
      </p>
    </div>
  );
}
