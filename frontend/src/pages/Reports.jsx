import { useState } from "react";
import { useParams } from "react-router-dom";
import api, { generateReport } from "../services/api.js";

export default function Reports() {
  const { analysisId } = useParams();
  const [framework, setFramework] = useState("eu_ai_act");
  const [organization, setOrganization] = useState("Neuron Demo Org");
  const [reportId, setReportId] = useState(null);
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

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <div className="font-mono text-xs text-cyan-accent tracking-widest">BEHAVIOR REPORT</div>
        <h1 className="text-2xl font-semibold mt-1">Regulatory export</h1>
        <p className="text-slate-400 text-sm mt-1">
          Analysis <span className="font-mono text-cyan-accent">{analysisId}</span>
        </p>
      </div>

      <form onSubmit={onGenerate} className="glass p-6 rounded-sm space-y-4">
        <label className="block text-sm">
          <span className="text-xs font-mono text-slate-400">FRAMEWORK</span>
          <select
            className="mt-1 w-full bg-navy border border-white/15 px-3 py-2 font-mono text-sm"
            value={framework}
            onChange={(e) => setFramework(e.target.value)}
          >
            <option value="eu_ai_act">EU AI Act</option>
            <option value="sec">SEC</option>
            <option value="fda">FDA</option>
            <option value="general">General</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-xs font-mono text-slate-400">ORGANIZATION</span>
          <input
            className="mt-1 w-full bg-navy border border-white/15 px-3 py-2 font-mono text-sm"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
          />
        </label>
        {err && <div className="text-critical text-sm">{err}</div>}
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 bg-cyan-accent/90 text-navy font-mono text-xs font-semibold disabled:opacity-50"
        >
          {busy ? "GENERATING…" : "GENERATE PDF"}
        </button>
      </form>

      {reportId && (
        <div className="glass p-4 rounded-sm space-y-2 text-sm">
          <div className="font-mono text-xs text-slate-400">Report id</div>
          <div className="font-mono">{reportId}</div>
          <button
            type="button"
            onClick={downloadPdf}
            className="text-cyan-accent hover:underline font-mono text-sm"
          >
            Download PDF
          </button>
        </div>
      )}

      <section className="text-xs text-slate-500 font-mono space-y-2">
        <p>
          MVP PDFs include executive summary, behavior matrix, and attestation block suitable for human review.
        </p>
        <p>Share-with-auditor tokens can be wired to signed URLs in production.</p>
      </section>
    </div>
  );
}
