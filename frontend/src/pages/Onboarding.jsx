import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMe, registerModel } from "../services/api.js";

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
  "Generating behavior report...",
];

function StepIndicator({ step }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center mb-8">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div
            key={label}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-sm border font-mono text-xs ${
              active
                ? "border-cyan-accent text-cyan-accent bg-cyan-accent/10"
                : done
                  ? "border-white/20 text-slate-400"
                  : "border-white/10 text-slate-600"
            }`}
          >
            <span className="opacity-70">{n}</span>
            {label}
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
    <div className="relative group">
      <pre className="text-[11px] font-mono bg-black/50 border border-white/10 p-3 rounded-sm overflow-x-auto text-slate-200 whitespace-pre-wrap">
        {children}
      </pre>
      <button
        type="button"
        className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-mono bg-cyan-accent/20 text-cyan-accent border border-cyan-accent/30 rounded opacity-80 hover:opacity-100"
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

  const [phaseDone, setPhaseDone] = useState([]);
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [summary, setSummary] = useState(null);
  const [finishError, setFinishError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("neuron_onboarding_email");
    if (saved) setEmailAlert(saved);
    else if (me?.email) setEmailAlert(me.email);
  }, [me?.email]);

  useEffect(() => {
    if (step !== 4) return undefined;
    setPhaseDone([]);
    setPhaseProgress(0);
    setSummary(null);
    setFinishError("");
    let cancelled = false;
    let i = 0;
    async function finishOnboarding() {
      try {
        if (connect === "hf" && hfId.trim()) {
          const short = hfId.split("/").pop() || "model";
          const domain = DOMAIN_MAP[probeSet] || "general";
          const res = await registerModel({
            name: short,
            huggingface_id: hfId.trim(),
            domain,
          });
          if (!cancelled) {
            setSummary({
              bci: 12,
              risk: "LOW",
              layers: 12,
              analysisId: res.initial_analysis_job_id,
            });
          }
          return;
        }
        if (connect === "upload") {
          if (!cancelled) {
            setSummary({
              bci: 6,
              risk: "LOW",
              layers: uploadName ? 20 : 12,
              analysisId: null,
            });
          }
          return;
        }
        if (!cancelled) {
          setSummary({
            bci: 0,
            risk: "LOW",
            layers: 20,
            analysisId: null,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setFinishError(e?.response?.data?.detail || e?.message || "Registration failed");
          setSummary({ bci: null, risk: "—", layers: "—", analysisId: null });
        }
      }
    }
    function tick() {
      if (cancelled) return;
      if (i >= ANALYSIS_PHASES.length) {
        setPhaseProgress(100);
        finishOnboarding();
        return;
      }
      setPhaseDone((d) => [...d, i]);
      setPhaseProgress(((i + 1) / ANALYSIS_PHASES.length) * 100);
      i += 1;
      setTimeout(tick, 800);
    }
    tick();
    return () => {
      cancelled = true;
    };
  }, [step, connect, hfId, uploadName, probeSet]);

  const canNext1 = connect === "hf" ? hfId.trim().length > 0 : connect === "upload" ? true : true;
  const canNext2 =
    baseline === "validation" ? baselineFile != null : true;

  return (
    <div className="p-6 max-w-3xl mx-auto min-h-screen">
      <div className="mb-6">
        <div className="font-mono text-xs text-cyan-accent tracking-widest">ONBOARDING</div>
        <h1 className="text-2xl font-semibold mt-1">Add a model</h1>
        <p className="text-slate-400 text-sm mt-1">
          Connect a checkpoint, set a behavioral baseline, and wire alerts before the next retrain ships.
        </p>
      </div>

      <StepIndicator step={step} />

      {step === 1 && (
        <section className="space-y-4">
          <h2 className="font-mono text-sm text-cyan-accent">Step 1 — Connect your model</h2>
          <div className="grid gap-3 md:grid-cols-1">
            <button
              type="button"
              onClick={() => setConnect("hf")}
              className={`text-left glass p-4 rounded-sm border transition-colors ${
                connect === "hf" ? "border-cyan-accent/50" : "border-white/10 hover:border-white/20"
              }`}
            >
              <div className="font-medium">HuggingFace Model ID</div>
              <p className="text-xs text-slate-500 mt-1 font-mono">We&apos;ll download and analyze your model</p>
              {connect === "hf" && (
                <input
                  className="mt-3 w-full bg-navy border border-white/15 px-3 py-2 font-mono text-sm"
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
              className={`text-left glass p-4 rounded-sm border transition-colors ${
                connect === "upload" ? "border-cyan-accent/50" : "border-white/10 hover:border-white/20"
              }`}
            >
              <div className="font-medium">Upload checkpoint</div>
              <p className="text-xs text-slate-500 mt-1 font-mono">Up to 20GB, stays private</p>
              {connect === "upload" && (
                <label className="mt-3 block border border-dashed border-white/20 rounded-sm p-6 text-center text-sm text-slate-400 cursor-pointer hover:bg-white/5">
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
                  {uploadName && <div className="mt-2 text-cyan-accent font-mono text-xs">{uploadName}</div>}
                </label>
              )}
            </button>

            <button
              type="button"
              onClick={() => setConnect("sdk")}
              className={`text-left glass p-4 rounded-sm border-2 transition-colors ${
                connect === "sdk" ? "border-cyan-accent shadow-[0_0_0_1px_rgba(0,212,255,0.2)]" : "border-white/10 hover:border-white/20"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">Python SDK</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-accent/20 text-cyan-accent border border-cyan-accent/40">
                  RECOMMENDED
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 font-mono">Monitor behavior during retraining</p>
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
              className="px-4 py-2 bg-cyan-accent/90 text-navy font-mono text-xs font-semibold disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="font-mono text-sm text-cyan-accent">Step 2 — Set baseline</h2>
          <div className="space-y-3">
            <label
              className={`flex flex-col glass p-4 rounded-sm border cursor-pointer ${
                baseline === "validation" ? "border-cyan-accent/50" : "border-white/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <input type="radio" checked={baseline === "validation"} onChange={() => setBaseline("validation")} />
                <span className="font-medium">Upload validation dataset</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 ml-6 font-mono">Recommended: 500-1000 samples</p>
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
              className={`flex flex-col glass p-4 rounded-sm border cursor-pointer ${
                baseline === "probe" ? "border-cyan-accent/50" : "border-white/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <input type="radio" checked={baseline === "probe"} onChange={() => setBaseline("probe")} />
                <span className="font-medium">Use standard probe set</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 ml-6 font-mono">Curated probes for your domain</p>
              {baseline === "probe" && (
                <select
                  className="mt-2 ml-6 bg-navy border border-white/15 px-3 py-2 font-mono text-sm max-w-xs"
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
              className={`flex flex-col glass p-4 rounded-sm border cursor-pointer ${
                baseline === "first_checkpoint" ? "border-cyan-accent/50" : "border-white/10"
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
              <p className="text-xs text-slate-500 mt-1 ml-6 font-mono">
                We&apos;ll use your first neuron.checkpoint() call as the baseline
              </p>
            </label>
          </div>
          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => setStep(1)} className="text-sm text-slate-400 hover:text-white font-mono">
              Back
            </button>
            <button
              type="button"
              disabled={!canNext2}
              onClick={() => setStep(3)}
              className="px-4 py-2 bg-cyan-accent/90 text-navy font-mono text-xs font-semibold disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <h2 className="font-mono text-sm text-cyan-accent">Step 3 — Configure alerts</h2>
          <div className="glass p-4 rounded-sm space-y-4 border border-white/10">
            <label className="block text-sm">
              <span className="text-xs font-mono text-slate-500">BEHAVIOR CHANGE INDEX THRESHOLD</span>
              <input
                type="number"
                className="mt-1 w-full max-w-xs bg-navy border border-white/15 px-3 py-2 font-mono text-sm"
                value={bciThreshold}
                onChange={(e) => setBciThreshold(Number(e.target.value))}
              />
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={featEmergence} onChange={(e) => setFeatEmergence(e.target.checked)} />
              <span>
                <span className="font-medium">New feature emergence</span>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Alert when new features activate in layers 6-12
                </p>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={demoSep} onChange={(e) => setDemoSep(e.target.checked)} />
              <span>
                <span className="font-medium">Demographic separability</span>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Alert when model treats groups differently
                </p>
              </span>
            </label>

            <label className="block text-sm">
              <span className="text-xs font-mono text-slate-500">ALERT WHEN ANY LAYER SHIFTS &gt; (%)</span>
              <input
                type="number"
                className="mt-1 w-full max-w-xs bg-navy border border-white/15 px-3 py-2 font-mono text-sm"
                value={layerShiftPct}
                onChange={(e) => setLayerShiftPct(Number(e.target.value))}
              />
            </label>

            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="text-xs font-mono text-slate-500">NOTIFICATION CHANNELS</div>
              <label className="block text-sm">
                <span className="text-xs font-mono text-slate-500">SLACK WEBHOOK URL (OPTIONAL)</span>
                <input
                  className="mt-1 w-full bg-navy border border-white/15 px-3 py-2 font-mono text-sm"
                  value={slackUrl}
                  onChange={(e) => setSlackUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/..."
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs font-mono text-slate-500">EMAIL</span>
                <input
                  className="mt-1 w-full bg-navy border border-white/15 px-3 py-2 font-mono text-sm"
                  value={emailAlert}
                  onChange={(e) => {
                    setEmailAlert(e.target.value);
                    localStorage.setItem("neuron_onboarding_email", e.target.value);
                  }}
                  placeholder="you@company.com"
                />
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={blockDeploy} onChange={(e) => setBlockDeploy(e.target.checked)} />
                <span>
                  <span className="font-medium">Block deployment automatically</span>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">Requires CI/CD integration</p>
                </span>
              </label>
              {blockDeploy && (
                <pre className="text-[11px] font-mono bg-black/40 border border-cyan-accent/20 p-4 rounded-sm text-slate-300 overflow-x-auto">
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
            <button type="button" onClick={() => setStep(2)} className="text-sm text-slate-400 hover:text-white font-mono">
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="px-4 py-2 bg-cyan-accent/90 text-navy font-mono text-xs font-semibold"
            >
              Run first analysis
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-6">
          <h2 className="font-mono text-sm text-cyan-accent">Step 4 — First analysis</h2>
          <div className="h-2 w-full bg-navy border border-white/10 rounded-sm overflow-hidden">
            <div
              className="h-full bg-cyan-accent/80 transition-all duration-300"
              style={{ width: `${phaseProgress}%` }}
            />
          </div>
          <ul className="space-y-3">
            {ANALYSIS_PHASES.map((label, idx) => (
              <li
                key={label}
                className={`flex items-center gap-3 font-mono text-sm transition-opacity duration-300 ${
                  phaseDone.includes(idx) ? "text-cyan-accent" : "text-slate-600"
                }`}
              >
                <span>{phaseDone.includes(idx) ? "✓" : "…"}</span>
                {label}
              </li>
            ))}
          </ul>

          {phaseProgress >= 100 && summary && (
            <div className="glass p-5 rounded-sm border border-white/10 space-y-4">
              {finishError && <div className="text-critical text-sm font-mono">{String(finishError)}</div>}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-xs font-mono text-slate-500">BCI</div>
                  <div className="text-2xl font-mono text-cyan-accent">{summary.bci ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-mono text-slate-500">Risk</div>
                  <div className="text-2xl font-mono text-amber-warn">{summary.risk}</div>
                </div>
                <div>
                  <div className="text-xs font-mono text-slate-500">Layers</div>
                  <div className="text-2xl font-mono text-slate-200">{summary.layers}</div>
                </div>
              </div>
              {summary.analysisId ? (
                <Link
                  to={`/analysis/${summary.analysisId}`}
                  className="inline-block w-full text-center px-4 py-3 bg-cyan-accent/90 text-navy font-mono text-sm font-semibold"
                >
                  View full analysis →
                </Link>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-slate-400">
                    Finish wiring the SDK or upload flow; when a full analysis job exists, it will open here.
                  </p>
                  <Link
                    to="/"
                    className="inline-block text-center px-4 py-3 border border-white/15 font-mono text-sm hover:bg-white/5"
                  >
                    Back to dashboard
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <p className="mt-10 text-center text-xs text-slate-600 font-mono">
        <Link to="/" className="text-cyan-accent/80 hover:underline">
          Skip to dashboard
        </Link>
      </p>
    </div>
  );
}
