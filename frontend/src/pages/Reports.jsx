import { useState } from "react";
import { useParams } from "react-router-dom";
import api, { generateReport } from "../services/api.js";

const FRAMEWORKS = [
  { id: "eu_ai_act", label: "EU AI Act" },
  { id: "sec", label: "SEC" },
  { id: "fda", label: "FDA" },
  { id: "general", label: "General" },
];

export default function Reports() {
  const { analysisId } = useParams();
  const [framework, setFramework] = useState("eu_ai_act");
  const [organization, setOrganization] = useState("Neuron Demo Org");
  const [reportId, setReportId] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onGenerate(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const rep = await generateReport({
        analysis_id: analysisId,
        report_type: framework,
        organization,
      });
      setReportId(rep.id);
      setReportData(rep.report_data ?? null);
    } catch (ex) {
      setErr(ex?.response?.data?.detail || "Could not generate");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    if (!reportId) return;
    const res = await api.get(`/reports/${reportId}/pdf`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `neuron-report-${reportId}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  const fwLabel = FRAMEWORKS.find((f) => f.id === framework)?.label || framework;
  const findings = Array.isArray(reportData?.findings) ? reportData.findings : [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-[13px] text-neuron-mutedText font-sans">Reports</p>
        <h2 className="font-display font-semibold text-[22px] text-neuron-primary mt-0.5">Regulatory export</h2>
        <p className="text-[13px] text-neuron-secondary mt-1 font-sans">
          Analysis{" "}
          <span className="font-mono text-neuron-accent">{analysisId}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FRAMEWORKS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFramework(f.id)}
            className={`px-4 py-2 rounded-full text-[13px] font-medium font-sans transition-all duration-150 ${
              framework === f.id
                ? "bg-neuron-accent text-white shadow-sm"
                : "bg-neuron-muted text-neuron-secondary hover:bg-neuron-border"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <form onSubmit={onGenerate} className="neuron-card-sm p-6 space-y-4 border border-neuron-border">
        <label className="block">
          <span className="text-[13px] font-medium text-neuron-secondary font-sans">Organization</span>
          <input
            className="input-neuron mt-1.5 font-sans"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
          />
        </label>
        {err && (
          <div className="text-sm text-neuron-danger border-l-[3px] border-l-neuron-danger bg-neuron-danger-light px-3 py-2 rounded-sm font-sans">
            {err}
          </div>
        )}
        <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
          {busy ? "Generating…" : "Generate report"}
        </button>
      </form>

      <section className="neuron-card p-6 border border-neuron-border transition-all duration-150 hover:shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neuron-border pb-6 mb-6">
          <div>
            <h3 className="font-display font-bold text-[20px] text-neuron-primary">Behavior analysis report</h3>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-neuron-mutedText font-sans">
              <span>
                Model: <span className="font-mono text-neuron-secondary">—</span>
              </span>
              <span>
                Date: <span className="font-mono text-neuron-secondary">{new Date().toLocaleDateString()}</span>
              </span>
              <span>
                Framework: <span className="font-mono text-neuron-secondary">{fwLabel}</span>
              </span>
              <span>
                Org: <span className="font-mono text-neuron-secondary">{organization}</span>
              </span>
            </div>
          </div>
          {reportId && (
            <button type="button" onClick={downloadPdf} className="btn-primary text-[13px] min-h-[40px]">
              Export PDF →
            </button>
          )}
        </div>

        <div className="text-[13px] text-neuron-secondary font-sans space-y-3">
          <p className="font-medium text-neuron-primary">Findings (preview)</p>
          {!reportId ? (
            <div className="text-center py-12 text-neuron-secondary font-sans">
              <p className="text-[15px]">Generate a report to see findings preview</p>
              <p className="text-[13px] mt-1 text-neuron-mutedText">
                The exported PDF includes executive summary, behavioral matrix, and attestation block.
              </p>
            </div>
          ) : (
            <div className="border border-neuron-border rounded-md overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-neuron-subtle text-neuron-mutedText text-[12px] font-medium border-b border-neuron-border">
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3">Severity</th>
                    <th className="py-2 px-3">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 px-3 text-center text-neuron-mutedText text-[13px]">
                        No findings in this report.
                      </td>
                    </tr>
                  ) : (
                    findings.map((f, idx) => (
                      <tr key={idx} className="border-b border-neuron-border bg-neuron-subtle/40">
                        <td className="py-2 px-3 font-mono text-[12px] text-neuron-primary">
                          {f.risk_category || "—"}
                        </td>
                        <td className="py-2 px-3 font-mono text-[12px]">{f.risk_level || "—"}</td>
                        <td className="py-2 px-3 text-neuron-secondary">{(f.description || "").slice(0, 200)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {reportId && (
          <p className="mt-6 text-[13px] font-mono text-neuron-mutedText">
            Report id: <span className="text-neuron-primary">{reportId}</span>
          </p>
        )}
      </section>

      <p className="text-[12px] text-neuron-mutedText font-sans leading-relaxed">
        MVP PDFs include executive summary, behavior matrix, and attestation block suitable for human review.
      </p>
    </div>
  );
}
