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
  trajectoryCompare,
  trajectoryPreview,
} from "../services/api.js";
import { useDebounced } from "../hooks/useDebounced.js";

export default function Analysis() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const ringDemo = searchParams.get("demo") === "1";
  const [mainTab, setMainTab] = useState("trajectory");
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
  const saeTrained =
    traj?.sae_trained === true || preview?.sae_trained === true;
  const showUntrainedBanner =
    (results || preview) && !saeTrained;

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-cyan-accent tracking-widest">ANALYSIS</div>
          <h1 className="text-2xl font-semibold mt-1">Run {id?.slice(0, 8)}…</h1>
          <p className="text-slate-400 text-sm mt-1">
            {status?.status === "complete"
              ? "Mechanistic trajectory materialized."
              : "Collecting residual stream geometry…"}
          </p>
        </div>
        <div className="text-right space-y-1">
          <motion.div
            className="text-4xl font-mono text-cyan-accent"
            initial={{ opacity: 0.2 }}
            animate={{ opacity: 1 }}
            key={results?.overall_risk_score}
          >
            {results ? Math.round(results.overall_risk_score) : "—"}
          </motion.div>
          <div className="text-xs font-mono text-slate-500">BEHAVIOR CHANGE INDEX</div>
          {results && (
            <Link
              to={`/reports/${results.id}`}
              className="inline-block mt-2 text-sm text-amber-warn hover:underline"
            >
              Export behavior report →
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-mono text-slate-400">
        <span className="border border-white/10 px-2 py-1 rounded-sm">
          status: {status?.status || "…"} {status?.progress != null ? `(${(status.progress * 100).toFixed(0)}%)` : ""}
        </span>
        <span className="border border-white/10 px-2 py-1 rounded-sm">
          layers: {traj?.layer_count || preview?.layer_count || "—"}
        </span>
        <span className="border border-white/10 px-2 py-1 rounded-sm">
          features: {traj?.heatmap_feature_ids?.length || preview?.heatmap_feature_ids?.length || "—"}
        </span>
      </div>

      <div className="flex gap-2 border-b border-white/10 pb-2">
        <button
          type="button"
          onClick={() => setMainTab("trajectory")}
          className={`px-3 py-1.5 font-mono text-xs rounded-sm border ${
            mainTab === "trajectory"
              ? "border-cyan-accent text-cyan-accent bg-cyan-accent/10"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          Layer trajectory
        </button>
        <button
          type="button"
          onClick={() => setMainTab("retraining")}
          className={`px-3 py-1.5 font-mono text-xs rounded-sm border ${
            mainTab === "retraining"
              ? "border-cyan-accent text-cyan-accent bg-cyan-accent/10"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          Retraining history
        </button>
      </div>

      {mainTab === "retraining" && (
        <section className="glass rounded-sm p-4 space-y-3">
          <h2 className="font-mono text-xs text-cyan-accent tracking-widest">RETRAINING TIMELINE</h2>
          <p className="text-xs text-slate-500">
            Behavior change index (BCI) across SDK checkpoints for this model. Add{" "}
            <code className="text-cyan-accent/80">?demo=1</code> to the URL to show the Ring reference callout.
          </p>
          {!modelId ? (
            <div className="text-sm text-slate-500">Load analysis to attach a model id…</div>
          ) : (
            <RetrainingTimeline checkpoints={sdkHistory?.checkpoints || []} demoMode={ringDemo} />
          )}
        </section>
      )}

      {showUntrainedBanner && (
        <div className="mb-4 px-4 py-3 rounded border border-amber-500/40 bg-amber-500/10 flex items-start gap-3">
          <span className="text-amber-400 mt-0.5">⚠</span>
          <div>
            <p className="text-amber-300 text-sm font-mono font-medium">UNTRAINED SAE WEIGHTS</p>
            <p className="text-amber-200/70 text-xs mt-1">
              Trajectory visualizations use random SAE weights. Run{" "}
              <code className="bg-black/30 px-1 rounded">
                python scripts/train_sae_layer0.py --layer 0
              </code>{" "}
              to generate meaningful results. All scores are illustrative only.
            </p>
          </div>
        </div>
      )}

      {mainTab === "trajectory" && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            <section className="glass rounded-sm p-4 xl:col-span-2">
              <h2 className="font-mono text-xs text-cyan-accent tracking-widest mb-2">LAYER TRAJECTORY</h2>
              <LayerTrajectoryChart curve={curve} novelFeatures={novel} />
            </section>
            <section className="glass rounded-sm p-4 xl:col-span-3 space-y-2">
              <h2 className="font-mono text-xs text-cyan-accent tracking-widest">FEATURE ACTIVATION MAP</h2>
              <FeatureHeatmap
                heatmap={traj?.heatmap || preview?.heatmap}
                featureIds={traj?.heatmap_feature_ids || preview?.heatmap_feature_ids}
              />
            </section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            <section className="glass rounded-sm p-4 xl:col-span-3">
              <h2 className="font-mono text-xs text-cyan-accent tracking-widest mb-2">BEHAVIOR FLAGS</h2>
              <RiskFlagList flags={results?.risk_flags || []} />
            </section>
            <section className="glass rounded-sm p-4 xl:col-span-2 text-sm text-slate-400 space-y-2">
              <h2 className="font-mono text-xs text-cyan-accent tracking-widest">TRAJECTORY SEPARABILITY</h2>
              {probe && Object.keys(probe).length > 0 && (
                <div className="space-y-1 text-xs font-mono text-slate-300">
                  <p>
                    AUC: {typeof probe.auc === "number" ? probe.auc.toFixed(2) : probe.auc}
                    {probe.name_anonymization_applied ? " — name anonymization applied to probe inputs" : ""}
                  </p>
                  {probe.interpretation && (
                    <p>
                      Interpretation: <span className="text-cyan-accent/90">{probe.interpretation}</span>
                    </p>
                  )}
                </div>
              )}
              <pre className="text-[11px] font-mono bg-black/30 p-2 border border-white/10 overflow-x-auto">
                {JSON.stringify(probe || {}, null, 2)}
              </pre>
              <div className="text-xs font-mono text-slate-500">Disparity summary</div>
              <pre className="text-[11px] font-mono bg-black/30 p-2 border border-white/10 overflow-x-auto">
                {JSON.stringify(traj?.disparity || {}, null, 2)}
              </pre>
            </section>
          </div>

          <section className="glass rounded-sm p-4 space-y-3">
            <h2 className="font-mono text-xs text-cyan-accent tracking-widest">INPUT EXPLORER</h2>
            <p className="text-xs text-slate-500">
              Debounced live trajectory (uses same model id as this analysis). Compare two near-identical loan
              applications.
            </p>
            <textarea
              className="w-full bg-navy border border-white/15 p-3 font-mono text-sm min-h-[90px]"
              value={liveText}
              onChange={(e) => setLiveText(e.target.value)}
            />
            <textarea
              className="w-full bg-navy border border-white/15 p-3 font-mono text-sm min-h-[90px]"
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
            />
            <button
              type="button"
              onClick={runCompare}
              className="px-4 py-2 bg-cyan-accent/90 text-navy font-mono text-xs font-semibold"
            >
              COMPARE TRAJECTORIES
            </button>
            {compare && (
              <div className="text-sm font-mono text-amber-warn">
                Divergence: {compare.divergence?.toFixed?.(3)}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
