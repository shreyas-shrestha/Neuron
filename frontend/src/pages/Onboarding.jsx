import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { analysisResults, analysisStatus, fetchMe, registerModel } from "../services/api.js";

const STEPS = ["Connect", "Baseline", "Alerts", "Analysis"];

const PROBE_OPTIONS = [
  { value: "person_detection", label: "Person Detection" },
  { value: "nlp_classification", label: "NLP Classification" },
  { value: "medical_imaging", label: "Medical Imaging" },
  { value: "general", label: "General" },
];

const DOMAIN_MAP = {
  person_detection: "general",
  nlp_classification: "general",
  medical_imaging: "healthcare",
  general: "general",
};

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
  return (
    <div className="flex flex-wrap justify-center gap-6 md:gap-12 mb-10 max-w-xl mx-auto">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={label} className="flex flex-col items-center w-[88px]">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold border-2 transition-all duration-200 ${
                done
                  ? "bg-neuron-accent border-neuron-accent text-zinc-950"
                  : active
                    ? "border-neuron-accent bg-neuron-muted text-neuron-primary ring-2 ring-neuron-accent/40 ring-offset-2 ring-offset-neuron-subtle"
                    : "border-neuron-border bg-neuron-bg text-neuron-mutedText"
              }`}
            >
              {done ? <CheckMini className="w-4 h-4 text-zinc-950" /> : n}
            </div>
            <span className="text-[12px] text-neuron-secondary mt-2 text-center font-sans leading-tight">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CopyableBlock({ children, code }) {
  const [done, setDone] = useState(false);
  const text = code ?? children;
  return (
    <div className="relative rounded-md border border-neuron-border bg-neuron-muted overflow-hidden">
      <pre className="text-[13px] font-mono p-4 pr-20 text-neuron-primary whitespace-pre-wrap overflow-x-auto leading-relaxed">
        {children}
      </pre>
      <button
        type="button"
        className="absolute top-2 right-2 btn-secondary text-[11px] min-h-0 py-1.5 px-2"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        }}
      >
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function Onboarding() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const [step, setStep] = useState(1);

  const [connect, setConnect] = useState("sdk");
  const [hfId, setHfId] = useState("mistralai/Mistral-7B");
  const [uploadName, setUploadName] = useState("");

  const [baseline, setBaseline] = useState("first_checkpoint");
  const [baselineFile, setBaselineFile] = useState(null);
  const [probeSet, setProbeSet] = useState("general");

  const [bciThreshold, setBciThreshold] = useState(15);
  const [featEmergence, setFeatEmergence] = useState(true);
  const [demoSep, setDemoSep] = useState(true);
  const [layerShiftPct, setLayerShiftPct] = useState(20);
  const [slackUrl, setSlackUrl] = useState("");
  const [emailAlert, setEmailAlert] = useState("");
  const [blockDeploy, setBlockDeploy] = useState(false);

  const [phaseProgressPct, setPhaseProgressPct] = useState(0);
  const [summary, setSummary] = useState(null);
  const [finishError, setFinishError] = useState("");
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem("neuron_onboarding_email");
    if (saved) setEmailAlert(saved);
    else if (me?.email) setEmailAlert(me.email);
  }, [me?.email]);

  const hfLive = connect === "hf" && hfId.trim().length > 0;

  useEffect(() => {
    if (step !== 4 || !hfLive) return undefined;
    let cancelled = false;
    setFinishError("");
    setSummary(null);
    setJobId(null);
    setJobStatus(null);
    setPhaseProgressPct(0);
    (async () => {
      try {
        const short = hfId.split("/").pop() || "model";
        const domain = DOMAIN_MAP[probeSet] || "general";
        const res = await registerModel({
          name: short,
          huggingface_id: hfId.trim(),
          domain,
        });
        if (!cancelled) setJobId(res.initial_analysis_job_id);
      } catch (e) {
        if (!cancelled) {
          setFinishError(e?.response?.data?.detail || e?.message || "Registration failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, hfLive, hfId, probeSet]);

  useEffect(() => {
    if (!jobId) return undefined;
    let cancelled = false;
    async function tick() {
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
          setFinishError("Analysis job failed.");
        }
      } catch (e) {
        if (!cancelled) setFinishError(e?.response?.data?.detail || e?.message || "Status poll failed");
      }
    }
    tick();
    const iv = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [jobId]);

  const canNext1 = connect === "hf" ? hfId.trim().length > 0 : connect === "upload" ? true : true;
  const canNext2 =
    baseline === "validation" ? baselineFile != null : true;

  return (
    <div className="max-w-3xl mx-auto min-h-screen pb-12">
      <div className="mb-8">
        <p className="text-[13px] text-neuron-mutedText font-sans tracking-wide">Onboarding</p>
        <h1 className="font-display font-semibold text-2xl text-neuron-primary mt-1">Add a model</h1>
        <p className="text-neuron-secondary text-sm mt-1 font-sans leading-relaxed">
          Connect a checkpoint, set a behavioral baseline, and wire alerts before the next retrain ships.
        </p>
      </div>

      <StepIndicator step={step} />

      {step === 1 && (
        <section className="space-y-4">
          <h2 className="font-display font-semibold text-[16px] text-neuron-primary">Step 1 — Connect your model</h2>
          <div className="grid gap-3 md:grid-cols-1">
            <button
              type="button"
              onClick={() => setConnect("hf")}
              className={`text-left bg-neuron-bg rounded-lg shadow-md p-4 transition-all duration-150 hover:shadow-lg border-2 ${
                connect === "hf" ? "border-neuron-accent bg-neuron-accent-light/40" : "border-neuron-border"
              }`}
            >
              <div className="font-medium">HuggingFace Model ID</div>
              <p className="text-xs text-neuron-secondary mt-1 font-sans">We&apos;ll download and analyze your model</p>
              {connect === "hf" && (
                <input
                  className="input-neuron mt-3 w-full font-mono text-sm"
                  placeholder="mistralai/Mistral-7B"
                  value={hfId}
                  onChange={(e) => setHfId(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </button>

            <button
              type="button"
              onClick={() => setConnect("upload")}
              className={`text-left bg-neuron-bg rounded-lg shadow-md p-4 transition-all duration-150 hover:shadow-lg border-2 ${
                connect === "upload" ? "border-neuron-accent bg-neuron-accent-light/40" : "border-neuron-border"
              }`}
            >
              <div className="font-medium">Upload checkpoint</div>
              <p className="text-xs text-neuron-secondary mt-1 font-sans">Up to 20GB, stays private</p>
              {connect === "upload" && (
                <label className="mt-3 block border border-dashed border-neuron-border rounded-md p-6 text-center text-sm text-neuron-secondary cursor-pointer hover:bg-neuron-subtle transition-colors">
                  <input
                    type="file"
                    accept=".pt,.pth,.safetensors"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setUploadName(f?.name || "");
                      setBaselineFile(f || null);
                    }}
                  />
                  Drop .pt / .safetensors or click to browse
                  {uploadName && <div className="mt-2 text-neuron-accent font-mono text-xs">{uploadName}</div>}
                </label>
              )}
            </button>

            <button
              type="button"
              onClick={() => setConnect("sdk")}
              className={`text-left bg-neuron-bg rounded-lg shadow-md p-4 transition-all duration-150 hover:shadow-lg border-2 ${
                connect === "sdk" ? "border-neuron-accent bg-neuron-accent-light/50" : "border-neuron-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">Python SDK</span>
                <span className="text-[10px] font-mono font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-500 text-zinc-950 border border-emerald-400/90 shadow-[0_0_12px_-2px_rgba(52,211,153,0.45)]">
                  Recommended
                </span>
              </div>
              <p className="text-xs text-neuron-secondary mt-1 font-sans">Monitor behavior during retraining</p>
              {connect === "sdk" && (
                <div className="mt-4 space-y-3">
                  <CopyableBlock code="pip install neuron-sdk">
                    {`pip install neuron-sdk`}
                  </CopyableBlock>
                  <CopyableBlock
                    code={`import neuron
neuron.init(
    api_key="nrn_••••••••",
    model_id="my-model"
)
# Add to your training loop:
neuron.checkpoint(model, epoch=epoch)`}
                  >
                    {`import neuron
neuron.init(
    api_key="nrn_••••••••",
    model_id="my-model"
)
# Add to your training loop:
neuron.checkpoint(model, epoch=epoch)`}
                  </CopyableBlock>
                </div>
              )}
            </button>
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={!canNext1}
              onClick={() => setStep(2)}
              className="btn-primary text-[13px] min-h-[40px] disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="font-display font-semibold text-[16px] text-neuron-primary">Step 2 — Set baseline</h2>
          <div className="space-y-3">
            <label
              className={`flex flex-col bg-neuron-bg rounded-lg shadow-md p-4 cursor-pointer border-2 transition-all duration-150 hover:shadow-lg ${
                baseline === "validation" ? "border-neuron-accent bg-neuron-accent-light/30" : "border-neuron-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <input type="radio" checked={baseline === "validation"} onChange={() => setBaseline("validation")} />
                <span className="font-medium">Upload validation dataset</span>
              </div>
              <p className="text-xs text-neuron-secondary mt-1 ml-6 font-sans">Recommended: 500-1000 samples</p>
              {baseline === "validation" && (
                <input
                  type="file"
                  accept=".csv,.jsonl"
                  className="mt-2 ml-6 text-sm"
                  onChange={(e) => setBaselineFile(e.target.files?.[0] || null)}
                />
              )}
            </label>

            <label
              className={`flex flex-col bg-neuron-bg rounded-lg shadow-md p-4 cursor-pointer border-2 transition-all duration-150 hover:shadow-lg ${
                baseline === "probe" ? "border-neuron-accent bg-neuron-accent-light/30" : "border-neuron-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <input type="radio" checked={baseline === "probe"} onChange={() => setBaseline("probe")} />
                <span className="font-medium">Use standard probe set</span>
              </div>
              <p className="text-xs text-neuron-secondary mt-1 ml-6 font-sans">Curated probes for your domain</p>
              {baseline === "probe" && (
                <select
                  className="input-neuron mt-2 ml-6 font-mono text-sm max-w-xs"
                  value={probeSet}
                  onChange={(e) => setProbeSet(e.target.value)}
                >
                  {PROBE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label
              className={`flex flex-col bg-neuron-bg rounded-lg shadow-md p-4 cursor-pointer border-2 transition-all duration-150 hover:shadow-lg ${
                baseline === "first_checkpoint" ? "border-neuron-accent bg-neuron-accent-light/30" : "border-neuron-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={baseline === "first_checkpoint"}
                  onChange={() => setBaseline("first_checkpoint")}
                />
                <span className="font-medium">Build from first checkpoint</span>
              </div>
              <p className="text-xs text-neuron-secondary mt-1 ml-6 font-sans">
                We&apos;ll use your first neuron.checkpoint() call as the baseline
              </p>
            </label>
          </div>
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-sm text-neuron-secondary hover:text-neuron-primary font-sans font-medium"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!canNext2}
              onClick={() => setStep(3)}
              className="btn-primary text-[13px] min-h-[40px] disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <h2 className="font-display font-semibold text-[16px] text-neuron-primary">Step 3 — Configure alerts</h2>
          <div className="bg-neuron-bg border border-neuron-border rounded-lg shadow-md p-6 space-y-4">
            <label className="block text-sm font-sans">
              <span className="text-[12px] font-medium text-neuron-secondary">Behavior change index threshold</span>
              <input
                type="number"
                className="input-neuron mt-1.5 w-full max-w-xs font-mono text-sm"
                value={bciThreshold}
                onChange={(e) => setBciThreshold(Number(e.target.value))}
              />
            </label>

            <label className="flex items-start gap-3 text-sm font-sans">
              <input
                type="checkbox"
                checked={featEmergence}
                onChange={(e) => setFeatEmergence(e.target.checked)}
                className="mt-1 rounded border-neuron-border text-neuron-accent focus:ring-neuron-accent"
              />
              <span>
                <span className="font-medium text-neuron-primary">New feature emergence</span>
                <p className="text-xs text-neuron-secondary mt-0.5">Alert when new features activate in layers 6-12</p>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm font-sans">
              <input
                type="checkbox"
                checked={demoSep}
                onChange={(e) => setDemoSep(e.target.checked)}
                className="mt-1 rounded border-neuron-border text-neuron-accent focus:ring-neuron-accent"
              />
              <span>
                <span className="font-medium text-neuron-primary">Demographic separability</span>
                <p className="text-xs text-neuron-secondary mt-0.5">Alert when model treats groups differently</p>
              </span>
            </label>

            <label className="block text-sm font-sans">
              <span className="text-[12px] font-medium text-neuron-secondary">Alert when any layer shifts &gt; (%)</span>
              <input
                type="number"
                className="input-neuron mt-1.5 w-full max-w-xs font-mono text-sm"
                value={layerShiftPct}
                onChange={(e) => setLayerShiftPct(Number(e.target.value))}
              />
            </label>

            <div className="border-t border-neuron-border pt-4 space-y-3">
              <div className="text-[11px] font-semibold tracking-wider text-neuron-mutedText uppercase">Notification channels</div>
              <label className="block text-sm font-sans">
                <span className="text-[12px] font-medium text-neuron-secondary">Slack webhook URL (optional)</span>
                <input
                  className="input-neuron mt-1.5 w-full font-mono text-sm"
                  value={slackUrl}
                  onChange={(e) => setSlackUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/..."
                />
              </label>
              <label className="block text-sm font-sans">
                <span className="text-[12px] font-medium text-neuron-secondary">Email</span>
                <input
                  className="input-neuron mt-1.5 w-full font-mono text-sm"
                  value={emailAlert}
                  onChange={(e) => {
                    setEmailAlert(e.target.value);
                    localStorage.setItem("neuron_onboarding_email", e.target.value);
                  }}
                  placeholder="you@company.com"
                />
              </label>
              <label className="flex items-start gap-3 text-sm font-sans">
                <input
                  type="checkbox"
                  checked={blockDeploy}
                  onChange={(e) => setBlockDeploy(e.target.checked)}
                  className="mt-1 rounded border-neuron-border text-neuron-accent focus:ring-neuron-accent"
                />
                <span>
                  <span className="font-medium text-neuron-primary">Block deployment automatically</span>
                  <p className="text-xs text-neuron-secondary mt-0.5">Requires CI/CD integration</p>
                </span>
              </label>
              {blockDeploy && (
                <pre className="text-[12px] font-mono bg-neuron-muted border border-neuron-border p-4 rounded-md text-neuron-primary overflow-x-auto transition-all duration-300">
                  {`Add to your GitHub Actions workflow:

- uses: neuron-ai/action@v1
  with:
    api_key: \${{ secrets.NEURON_API_KEY }}
    model_path: ./checkpoints/latest.pt
    fail_on: HIGH`}
                </pre>
              )}
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-sm text-neuron-secondary hover:text-neuron-primary font-sans font-medium"
            >
              Back
            </button>
            <button type="button" onClick={() => setStep(4)} className="btn-primary text-[13px] min-h-[40px]">
              Run first analysis
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-6">
          <h2 className="font-display font-semibold text-[16px] text-neuron-primary">Step 4 — First analysis</h2>

          {!hfLive && (
            <div className="bg-amber-50 border border-amber-200 border-l-[3px] border-l-neuron-warning rounded-lg p-5 text-sm text-neuron-primary font-sans">
              <p className="mb-3 leading-relaxed">
                Live analysis with real progress runs when you choose <strong>HuggingFace Model ID</strong> in step 1.
                Go back and select HF, or use the{" "}
                <Link to="/demo" className="text-neuron-accent font-semibold hover:underline">
                  Live Demo
                </Link>{" "}
                for a browser-only walkthrough.
              </p>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-medium text-neuron-accent hover:underline"
              >
                ← Change connection method
              </button>
            </div>
          )}

          {hfLive && (
            <>
              <p className="text-[13px] text-neuron-mutedText font-sans">
                ~2 min for GPT-2 · ~8 min for 7B-class models
              </p>
              <div className="h-2 w-full bg-neuron-muted rounded-full overflow-hidden border border-neuron-border">
                <div
                  className="h-full bg-neuron-accent transition-all duration-300 rounded-full"
                  style={{
                    width: `${jobStatus?.status === "complete" ? 100 : phaseProgressPct}%`,
                  }}
                />
              </div>
              <ul className="space-y-3">
                {(() => {
                  const { completedCount, failed } = analysisPhaseProgress(
                    jobStatus?.status,
                    jobStatus?.progress
                  );
                  return ANALYSIS_PHASES.map((label, idx) => {
                    const allDone = jobStatus?.status === "complete";
                    const check = allDone || idx < completedCount;
                    const active =
                      !allDone &&
                      !failed &&
                      idx === completedCount &&
                      jobStatus?.status !== "failed";
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
                      setStep(3);
                      setFinishError("");
                    }}
                  >
                    Retry from alerts step
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
                  {summary && summary.sae_trained !== true && (
                    <div className="mt-4 p-4 rounded-lg border border-amber-500/35 bg-amber-500/10 text-left">
                      <div className="flex gap-2 items-start">
                        <span className="text-amber-400 text-sm mt-0.5" aria-hidden>
                          ⚠
                        </span>
                        <div>
                          <p className="text-amber-100 text-sm font-semibold font-sans">
                            Results use untrained SAE weights
                          </p>
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
            </>
          )}
        </section>
      )}

      <p className="mt-10 text-center text-xs text-neuron-mutedText font-sans">
        <Link to="/" className="text-neuron-accent font-medium hover:underline">
          Skip to dashboard
        </Link>
      </p>
    </div>
  );
}
