import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import LayerTrajectoryChart from "../components/LayerTrajectory/LayerTrajectoryChart.jsx";
import FeatureHeatmap from "../components/FeatureMap/FeatureHeatmap.jsx";
import RiskFlagList from "../components/RiskFlags/RiskFlagList.jsx";
import RetrainingTimeline from "../components/RetrainingTimeline/RetrainingTimeline.jsx";
import {
  analysisResults,
  analysisRetry,
  analysisStatus,
  fetchAnalysisCompliancePdfBlob,
  getSdkModelHistory,
  listModels,
  trajectoryCompare,
  trajectoryPreview,
} from "../services/api.js";
import { useDebounced } from "../hooks/useDebounced.js";
import { bciRiskLabel, bciTextClass, riskBadgeClass } from "../utils/bciDisplay.js";
import { ANALYSIS_POLL_MAX_WAIT_MS, backoffInterval, pollTimedOut } from "../utils/pollBackoff.js";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "flags", label: "Behavior Flags" },
  { id: "history", label: "History" },
];

function probeSummaryLine(probe) {
  if (!probe || typeof probe !== "object") return null;
  const interp = probe.interpretation;
  const auc =
    typeof probe.auc === "number" ? probe.auc.toFixed(2) : probe.auc != null ? String(probe.auc) : null;
  if (!interp && !auc) return null;
  if (interp && auc) return `${interp} (AUC ${auc})`;
  return interp || (auc ? `AUC ${auc}` : null);
}

export default function Analysis() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const demoTimelineHighlight = searchParams.get("demo") === "1";
  const untrainedParam = searchParams.get("untrained") === "1";
  const [pollNonce, setPollNonce] = useState(0);
  const [mainTab, setMainTab] = useState("overview");
  const [status, setStatus] = useState(null);
  const [results, setResults] = useState(null);
  const [modelId, setModelId] = useState("");
  const [liveText, setLiveText] = useState(
    "Loan application. Applicant name: Applicant_Profile_Alpha_01. Income $72000."
  );
  const [compareB, setCompareB] = useState(
    "Loan application. Applicant name: Applicant_Profile_Beta_01. Income $72000."
  );
  const [preview, setPreview] = useState(null);
  const [compare, setCompare] = useState(null);
  const [showFeatureMap, setShowFeatureMap] = useState(false);
  const [showExplorer, setShowExplorer] = useState(false);
  const [pollTimedOutState, setPollTimedOutState] = useState(false);
  const [pdfDownloadBusy, setPdfDownloadBusy] = useState(false);
  const debounced = useDebounced(liveText, 500);

  const { data: models } = useQuery({ queryKey: ["models"], queryFn: listModels });
  const modelName =
    models?.find((m) => m.id === modelId)?.name ||
    models?.find((m) => m.id === modelId)?.huggingface_id ||
    (modelId ? `${modelId.slice(0, 8)}…` : "—");

  useEffect(() => {
    setPollTimedOutState(false);
    const pollStartedAt = Date.now();
    let timeoutId;
    let cancelled = false;
    let attempt = 0;
    async function poll() {
      if (pollTimedOut(pollStartedAt, ANALYSIS_POLL_MAX_WAIT_MS)) {
        if (!cancelled) setPollTimedOutState(true);
        return;
      }
      try {
        const s = await analysisStatus(id);
        if (cancelled) return;
        setStatus(s);
        if (s.status === "complete" || s.status === "sdk_checkpoint") {
          const r = await analysisResults(id);
          if (cancelled) return;
          setResults(r);
          setModelId(r.model_id);
          return;
        }
        if (s.status === "failed") return;
        attempt += 1;
        timeoutId = setTimeout(poll, backoffInterval(attempt));
      } catch {
        if (!cancelled) {
          attempt += 1;
          timeoutId = setTimeout(poll, backoffInterval(attempt, 2000));
        }
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [id, pollNonce]);

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

  async function downloadCompliancePdf() {
    if (!id || pdfDownloadBusy) return;
    setPdfDownloadBusy(true);
    try {
      const blob = await fetchAnalysisCompliancePdfBlob(id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Neuron_Audit_${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setPdfDownloadBusy(false);
    }
  }

  const { data: sdkHistory } = useQuery({
    queryKey: ["sdk-history", modelId],
    queryFn: () => getSdkModelHistory(modelId),
    enabled: Boolean(modelId) && mainTab === "history",
  });

  const traj = results?.trajectory;
  const heatmapData = useMemo(
    () => ({
      heatmap: traj?.heatmap ?? preview?.heatmap ?? null,
      featureIds: traj?.heatmap_feature_ids ?? preview?.heatmap_feature_ids ?? null,
    }),
    [traj, preview]
  );
  const curve = traj?.per_layer_curve || preview?.per_layer_curve;
  const novel = traj?.novel_features_by_layer || preview?.novel_features_by_layer;
  const probe = traj?.probe || {};
  const saeTrained = traj?.sae_trained === true || preview?.sae_trained === true;
  const showUntrainedBanner = untrainedParam || ((results || preview) && !saeTrained);

  const layerCount = traj?.layer_count || preview?.layer_count;
  const featCount = traj?.heatmap_feature_ids?.length || preview?.heatmap_feature_ids?.length;
  const bci = results ? Math.round(results.overall_risk_score) : null;
  const riskLabel = results ? bciRiskLabel(results.overall_risk_score) : null;
  const probeLine = probeSummaryLine(probe);

  const statusLabel = pollTimedOutState
    ? "Timed out"
    : status?.status === "running" && status?.progress != null
      ? `Running ${Math.round((status.progress || 0) * 100)}%`
      : status?.status === "complete" || status?.status === "sdk_checkpoint"
        ? "Complete"
        : status?.status === "failed"
          ? "Failed"
          : status?.status || "…";

  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-neuron-border pb-5">
        <div className="min-w-0 space-y-2">
          <h1 className="font-display font-semibold text-[18px] text-neuron-primary" style={{ fontWeight: 600 }}>
            {modelName}
          </h1>
          <span
            className={`inline-flex items-center text-[11px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              status?.status === "complete" || status?.status === "sdk_checkpoint"
                ? "bg-emerald-500/15 text-neuron-success border-emerald-500/30"
                : status?.status === "running"
                  ? "bg-amber-500/15 text-neuron-warning border-amber-500/30"
                  : status?.status === "failed" || pollTimedOutState
                    ? "bg-red-500/15 text-red-300 border-red-500/35"
                    : "bg-neuron-muted text-neuron-secondary border-neuron-border"
            }`}
          >
            {statusLabel}
          </span>
        </div>
        <div className="shrink-0 text-left sm:text-right space-y-1">
          <div
            className={`font-mono text-[40px] font-bold leading-none ${bci != null ? bciTextClass(bci) : "text-neuron-mutedText"}`}
          >
            {bci ?? "—"}
          </div>
          {riskLabel && (
            <div>
              <span
                className={`inline-block text-[11px] font-mono font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${riskBadgeClass(riskLabel)}`}
              >
                {riskLabel}
              </span>
            </div>
          )}
          {results && (status?.status === "complete" || status?.status === "sdk_checkpoint") && (
            <button
              type="button"
              onClick={downloadCompliancePdf}
              disabled={pdfDownloadBusy}
              className="mt-3 w-full sm:w-auto btn-primary px-4 py-2.5 min-h-[44px] text-[13px] font-semibold tracking-wide shadow-md border border-white/10 disabled:opacity-50 disabled:pointer-events-none"
              title="Download signed-style compliance audit for records"
            >
              {pdfDownloadBusy ? "Preparing PDF…" : "Download Compliance Audit (PDF)"}
            </button>
          )}
        </div>
      </header>

      {(status?.status === "failed" || pollTimedOutState) && (
        <div className="w-full rounded-md border border-red-500/40 bg-red-500/15 px-5 py-5 text-left border-l-[4px] border-l-red-500">
          <h2 className="text-[16px] font-semibold text-red-100 font-display">
            {pollTimedOutState ? "Analysis timed out" : "Analysis Failed"}
          </h2>
          <p className="mt-2 text-[14px] text-red-100/90 font-sans leading-relaxed">
            {pollTimedOutState
              ? "No response after 45 minutes. The job may still be running on the server—check Celery workers, GPU memory, and logs—or retry."
              : status?.error_message || "An unexpected error occurred during analysis."}
          </p>
          <button
            type="button"
            className="mt-5 btn-secondary text-[13px] border-red-500/50 text-red-100 hover:bg-red-500/25"
            onClick={async () => {
              try {
                await analysisRetry(id);
                setResults(null);
                setPollTimedOutState(false);
                setStatus((prev) => ({
                  ...prev,
                  id,
                  status: "pending",
                  progress: 0,
                  error_message: null,
                }));
                setPollNonce((n) => n + 1);
              } catch {
                /* ignore */
              }
            }}
          >
            Retry
          </button>
        </div>
      )}

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

      {mainTab === "overview" && (
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
          </section>

          {probeLine && (
            <p className="text-[13px] text-neuron-secondary font-sans">
              Trajectory separability:{" "}
              <span className="text-neuron-accent font-medium ml-1">{probeLine}</span>
            </p>
          )}

          <div className="border border-neuron-border rounded-md bg-neuron-bg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowFeatureMap((v) => !v)}
              className="w-full text-left px-4 py-3 text-[13px] font-medium font-sans text-neuron-primary hover:bg-neuron-muted/50 flex justify-between items-center"
            >
              Show feature map {showFeatureMap ? "▴" : "▾"}
            </button>
            {showFeatureMap && (
              <div className="px-4 pb-4 border-t border-neuron-border pt-4">
                <p className="text-[12px] text-neuron-secondary mb-3 font-sans">Click any cell for token attribution.</p>
                <FeatureHeatmap heatmap={heatmapData.heatmap} featureIds={heatmapData.featureIds} />
              </div>
            )}
          </div>

          <div className="border border-neuron-border rounded-md bg-neuron-bg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowExplorer((v) => !v)}
              className="w-full text-left px-4 py-3 text-[13px] font-medium font-sans text-neuron-primary hover:bg-neuron-muted/50 flex justify-between items-center"
            >
              Compare two inputs {showExplorer ? "▴" : "▾"}
            </button>
            {showExplorer && (
              <div className="px-4 pb-4 border-t border-neuron-border pt-4 space-y-4">
                <p className="text-[12px] text-neuron-secondary font-sans">
                  Debounced live trajectory. Compare two near-identical inputs.
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
                        <div className="h-[200px]">
                          <LayerTrajectoryChart curve={compare.trajectory_a?.per_layer_curve} novelFeatures={{}} />
                        </div>
                      </div>
                      <div className="rounded-md border border-neuron-border p-3 bg-neuron-subtle/50">
                        <div className="h-[200px]">
                          <LayerTrajectoryChart curve={compare.trajectory_b?.per_layer_curve} novelFeatures={{}} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {mainTab === "flags" && (
        <section className="neuron-card-sm p-5 border border-neuron-border space-y-4 transition-all duration-150 hover:-translate-y-px hover:shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display font-semibold text-[15px] text-neuron-primary">Behavior flags</h2>
            {results?.id && (
              <Link
                to={`/reports/${results.id}`}
                className="btn-secondary text-[12px] min-h-[32px] py-1.5 px-3"
              >
                Export behavior report
              </Link>
            )}
          </div>
          <RiskFlagList flags={results?.risk_flags || []} />
        </section>
      )}

      {mainTab === "history" && (
        <section className="neuron-card-sm p-5 space-y-3 border border-neuron-border transition-all duration-150 hover:-translate-y-px hover:shadow-lg">
          <h2 className="font-display font-semibold text-[15px] text-neuron-primary">Retraining timeline</h2>
          <p className="text-[13px] text-neuron-secondary font-sans leading-relaxed">
            BCI across SDK checkpoints. Add{" "}
            <code className="font-mono text-[12px] text-neuron-accent bg-neuron-accent-light/50 px-1 rounded">?demo=1</code>{" "}
            to highlight the demo high-risk checkpoint on the timeline.
          </p>
          {!modelId ? (
            <div className="text-sm text-neuron-secondary font-sans">Load analysis to attach a model id…</div>
          ) : (
            <RetrainingTimeline checkpoints={sdkHistory?.checkpoints || []} demoMode={demoTimelineHighlight} />
          )}
        </section>
      )}
    </div>
  );
}
