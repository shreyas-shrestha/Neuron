import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import LayerTrajectoryChart from "../components/LayerTrajectory/LayerTrajectoryChart.jsx";
import FeatureHeatmap from "../components/FeatureMap/FeatureHeatmap.jsx";
import RiskFlagList from "../components/RiskFlags/RiskFlagList.jsx";
import RetrainingTimeline from "../components/RetrainingTimeline/RetrainingTimeline.jsx";
import {
  analysisResults,
  analysisStatus,
  getSdkModelHistory,
  listModels,
  trajectoryCompare,
  trajectoryPreview,
} from "../services/api.js";
import { useDebounced } from "../hooks/useDebounced.js";
import { bciRiskLabel, bciTextClass, riskBadgeClass } from "../utils/bciDisplay.js";

const TABS = [
  { id: "layer", label: "Layer Trajectory" },
  { id: "feature", label: "Feature Map" },
  { id: "flags", label: "Behavior Flags" },
  { id: "retraining", label: "Retraining History" },
  { id: "explorer", label: "Input Explorer" },
];

function formatTs(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

export default function Analysis() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const ringDemo = searchParams.get("demo") === "1";
  const [mainTab, setMainTab] = useState("layer");
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState(null);
  const [modelId, setModelId] = useState("");
  const [liveText, setLiveText] = useState("Loan application. Applicant name: Jamal Washington. Income $72000.");
  const [compareB, setCompareB] = useState(
    "Loan application. Applicant name: Emily Anderson. Income $72000."
  );
  const [preview, setPreview] = useState(null);
  const [compare, setCompare] = useState(null);
  const debounced = useDebounced(liveText, 500);

  const { data: models } = useQuery({ queryKey: ["models"], queryFn: listModels });
  const modelName =
    models?.find((m) => m.id === modelId)?.name ||
    models?.find((m) => m.id === modelId)?.huggingface_id ||
    (modelId ? `${modelId.slice(0, 8)}…` : "—");

  useEffect(() => {
    let t;
    async function poll() {
      try {
        const s = await analysisStatus(id);
        setStatus(s);
        if (s.status === "complete") {
          const r = await analysisResults(id);
          setResults(r);
          setModelId(r.model_id);
          return;
        }
        if (s.status === "failed") return;
        t = setTimeout(poll, 1200);
      } catch {
        t = setTimeout(poll, 2000);
      }
    }
    poll();
    return () => clearTimeout(t);
  }, [id]);

  useEffect(() => {
    if (!modelId || !debounced) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await trajectoryPreview(modelId, debounced);
        if (!cancelled) setPreview(p);
      } catch {
        if (!cancelled) setPreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modelId, debounced]);

  async function runCompare() {
    if (!modelId) return;
    const c = await trajectoryCompare(modelId, liveText, compareB);
    setCompare(c);
  }

  const { data: sdkHistory } = useQuery({
    queryKey: ["sdk-history", modelId],
    queryFn: () => getSdkModelHistory(modelId),
    enabled: Boolean(modelId) && mainTab === "retraining",
  });

  const traj = results?.trajectory;
  const curve = traj?.per_layer_curve || preview?.per_layer_curve;
  const novel = traj?.novel_features_by_layer || preview?.novel_features_by_layer;
  const probe = traj?.probe || {};
  const saeTrained = traj?.sae_trained === true || preview?.sae_trained === true;
  const showUntrainedBanner = (results || preview) && !saeTrained;

  const layerCount = traj?.layer_count || preview?.layer_count;
  const featCount = traj?.heatmap_feature_ids?.length || preview?.heatmap_feature_ids?.length;
  const bci = results ? Math.round(results.overall_risk_score) : null;
  const riskLabel = results ? bciRiskLabel(results.overall_risk_score) : null;

  return (
    <div className="space-y-5">
      <header className="neuron-card-sm p-5 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 transition-all duration-150 hover:-translate-y-px hover:shadow-lg">
        <div className="min-w-0 space-y-2">
          <nav className="text-[13px] text-neuron-mutedText font-sans flex flex-wrap items-center gap-1">
            <Link to="/models" className="hover:text-neuron-accent transition-colors">
              Models
            </Link>
            <span className="text-neuron-border-strong">/</span>
            <span className="text-neuron-secondary truncate max-w-[200px]">{modelName}</span>
            <span className="text-neuron-border-strong">/</span>
            <span className="text-neuron-primary">Analysis</span>
          </nav>
          <h1 className="font-display font-semibold text-[20px] text-neuron-primary truncate">
            {results ? `Analysis · ${modelName}` : `Run ${id?.slice(0, 8)}…`}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-[13px] font-sans text-neuron-secondary">
            <span>{formatTs(results?.completed_at || results?.created_at)}</span>
            <span
              className={`inline-flex items-center text-[11px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                status?.status === "complete"
                  ? "bg-emerald-500/15 text-neuron-success border-emerald-500/30"
                  : status?.status === "running"
                    ? "bg-amber-500/15 text-neuron-warning border-amber-500/30"
                    : "bg-neuron-muted text-neuron-secondary border-neuron-border"
              }`}
            >
              {status?.status || "…"}
            </span>
            {status?.progress != null && status.status === "running" && (
              <span className="font-mono text-neuron-mutedText">
                {Math.round((status.progress || 0) * 100)}%
              </span>
            )}
          </div>
          {results && (
            <Link
              to={`/reports/${results.id}`}
              className="inline-block text-[13px] font-medium text-neuron-accent hover:text-neuron-accent-hover"
            >
              Export behavior report →
            </Link>
          )}
        </div>

        <div className="shrink-0 text-left lg:text-right space-y-2">
          <div className="text-[12px] text-neuron-mutedText font-sans">Behavior Change Index</div>
          <motion.div
            className={`font-mono text-[36px] font-bold leading-none ${bci != null ? bciTextClass(bci) : "text-neuron-mutedText"}`}
            initial={{ opacity: 0.3 }}
            animate={{ opacity: 1 }}
            key={results?.overall_risk_score}
          >
            {bci ?? "—"}
          </motion.div>
          {riskLabel && (
            <div>
              <span
                className={`inline-block text-[11px] font-mono font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${riskBadgeClass(riskLabel)}`}
              >
                {riskLabel}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-neuron-border pb-px">
        {TABS.map((tab) => {
          const on = mainTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMainTab(tab.id)}
              className={`group flex items-center gap-2.5 pb-3 pt-1 pl-1 pr-2 rounded-t-md text-sm font-medium font-sans transition-all duration-200 ${
                on ? "text-neuron-primary" : "text-neuron-secondary hover:text-neuron-primary"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                  on
                    ? "border-neuron-accent bg-neuron-accent/10 shadow-[0_0_0_3px_rgba(129,140,248,0.22)]"
                    : "border-neuron-border bg-neuron-muted/40 group-hover:border-neuron-border-strong"
                }`}
                aria-hidden
              >
                <span
                  className={`h-2 w-2 rounded-full transition-all duration-300 ${on ? "bg-neuron-accent scale-100" : "bg-transparent scale-75"}`}
                />
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {showUntrainedBanner && (
        <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-4 py-3 flex items-start gap-3 border-l-[3px] border-l-neuron-warning">
          <span className="mt-0.5 shrink-0 text-neuron-warning" aria-hidden>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
          </span>
          <div className="text-sm font-sans text-neuron-primary">
            <p className="font-semibold text-neuron-primary">Untrained SAE weights</p>
            <p className="text-neuron-secondary mt-1 text-[13px] leading-relaxed">
              Trajectory visualizations may use placeholder SAE weights. Run{" "}
              <code className="font-mono text-[12px] bg-neuron-muted px-1 rounded border border-neuron-border">
                python scripts/train_sae_layer0.py --layer 0
              </code>{" "}
              for meaningful results.
            </p>
          </div>
        </div>
      )}

      {mainTab === "retraining" && (
        <section className="neuron-card-sm p-5 space-y-3 border border-neuron-border transition-all duration-150 hover:-translate-y-px hover:shadow-lg">
          <h2 className="font-display font-semibold text-[15px] text-neuron-primary">Retraining timeline</h2>
          <p className="text-[13px] text-neuron-secondary font-sans leading-relaxed">
            Behavior change index (BCI) across SDK checkpoints for this model. Add{" "}
            <code className="font-mono text-[12px] text-neuron-accent bg-neuron-accent-light/50 px-1 rounded">?demo=1</code>{" "}
            to the URL for the Ring reference callout.
          </p>
          {!modelId ? (
            <div className="text-sm text-neuron-secondary font-sans">Load analysis to attach a model id…</div>
          ) : (
            <RetrainingTimeline checkpoints={sdkHistory?.checkpoints || []} demoMode={ringDemo} />
          )}
        </section>
      )}

      {mainTab === "layer" && (
        <div className="space-y-5">
          <section className="neuron-card-sm p-5 border border-neuron-border transition-all duration-150 hover:-translate-y-px hover:shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="font-display font-semibold text-[15px] text-neuron-primary">Layer trajectory</h2>
              <span className="text-[13px] text-neuron-mutedText font-sans">
                {layerCount != null ? `${layerCount} layers` : "—"}
                {featCount != null ? ` · ${featCount} features` : ""}
              </span>
            </div>
            <div className="h-[280px] w-full min-h-[280px]">
              <LayerTrajectoryChart curve={curve} novelFeatures={novel} />
            </div>
            <p className="mt-3 text-[12px] text-neuron-mutedText font-sans">
              Novel feature markers highlight layers with emerging sparse codes.
            </p>
          </section>

          {probe && Object.keys(probe).length > 0 && (
            <section className="neuron-card-sm p-5 border border-neuron-border text-[13px] transition-all duration-150">
              <h3 className="font-display font-semibold text-[14px] text-neuron-primary mb-2">Trajectory separability</h3>
              <div className="space-y-1 font-mono text-neuron-secondary text-[12px]">
                <p>
                  AUC: {typeof probe.auc === "number" ? probe.auc.toFixed(2) : probe.auc}
                  {probe.name_anonymization_applied ? " — name anonymization applied to probe inputs" : ""}
                </p>
                {probe.interpretation && (
                  <p className="text-neuron-primary font-sans">
                    Interpretation: <span className="text-neuron-accent">{probe.interpretation}</span>
                  </p>
                )}
              </div>
              <pre className="mt-3 text-[11px] font-mono bg-neuron-muted p-3 rounded-sm border border-neuron-border overflow-x-auto text-neuron-primary">
                {JSON.stringify(probe || {}, null, 2)}
              </pre>
              <div className="text-[11px] font-mono text-neuron-mutedText mt-2">Disparity summary</div>
              <pre className="mt-1 text-[11px] font-mono bg-neuron-muted p-3 rounded-sm border border-neuron-border overflow-x-auto text-neuron-primary">
                {JSON.stringify(traj?.disparity || {}, null, 2)}
              </pre>
            </section>
          )}
        </div>
      )}

      {mainTab === "feature" && (
        <section className="neuron-card-sm p-5 border border-neuron-border transition-all duration-150 hover:-translate-y-px hover:shadow-lg">
          <h2 className="font-display font-semibold text-[15px] text-neuron-primary">Feature activation heatmap</h2>
          <p className="text-[13px] text-neuron-secondary mt-1 font-sans leading-relaxed">
            Click any cell to see which tokens drove that feature.
          </p>
          <div className="mt-4">
            <FeatureHeatmap
              heatmap={traj?.heatmap || preview?.heatmap}
              featureIds={traj?.heatmap_feature_ids || preview?.heatmap_feature_ids}
            />
          </div>
        </section>
      )}

      {mainTab === "flags" && (
        <section className="neuron-card-sm p-5 border border-neuron-border transition-all duration-150 hover:-translate-y-px hover:shadow-lg">
          <h2 className="font-display font-semibold text-[15px] text-neuron-primary mb-4">Behavior flags</h2>
          <RiskFlagList flags={results?.risk_flags || []} />
        </section>
      )}

      {mainTab === "explorer" && (
        <section className="neuron-card-sm p-5 space-y-4 border border-neuron-border transition-all duration-150 hover:-translate-y-px hover:shadow-lg">
          <h2 className="font-display font-semibold text-[15px] text-neuron-primary">Input explorer</h2>
          <p className="text-[13px] text-neuron-secondary font-sans leading-relaxed">
            Debounced live trajectory for this model. Compare two near-identical inputs.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[12px] text-neuron-mutedText font-sans">Input A</span>
              <textarea
                className="input-neuron mt-1.5 font-sans min-h-[80px] resize-y"
                value={liveText}
                onChange={(e) => setLiveText(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-[12px] text-neuron-mutedText font-sans">Input B</span>
              <textarea
                className="input-neuron mt-1.5 font-sans min-h-[80px] resize-y"
                value={compareB}
                onChange={(e) => setCompareB(e.target.value)}
              />
            </label>
          </div>
          <button type="button" onClick={runCompare} className="btn-primary w-full h-10">
            Compare trajectories
          </button>
          {compare && (
            <div className="space-y-4">
              <div className="font-mono text-sm text-neuron-moderate">
                Divergence: {compare.divergence?.toFixed?.(3)}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-md border border-neuron-border p-3 bg-neuron-subtle/50">
                  <div className="text-[11px] font-mono text-neuron-mutedText uppercase tracking-wider mb-2">Input A</div>
                  <div className="h-[200px]">
                    <LayerTrajectoryChart curve={compare.trajectory_a?.per_layer_curve} novelFeatures={{}} />
                  </div>
                </div>
                <div className="rounded-md border border-neuron-border p-3 bg-neuron-subtle/50">
                  <div className="text-[11px] font-mono text-neuron-mutedText uppercase tracking-wider mb-2">Input B</div>
                  <div className="h-[200px]">
                    <LayerTrajectoryChart curve={compare.trajectory_b?.per_layer_curve} novelFeatures={{}} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
