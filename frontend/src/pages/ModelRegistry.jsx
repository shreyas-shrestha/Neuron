import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listModels, registerModel } from "../services/api.js";

export default function ModelRegistry() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: models, isLoading } = useQuery({ queryKey: ["models"], queryFn: listModels });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("GPT-2 Demo");
  const [hf, setHf] = useState("gpt2");
  const [domain, setDomain] = useState("lending");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await registerModel({ name, huggingface_id: hf, domain });
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["models"] });
      if (res?.initial_analysis_job_id) {
        nav(`/analysis/${res.initial_analysis_job_id}`);
      }
    } catch (ex) {
      setErr(ex?.response?.data?.detail || "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Model registry</h1>
          <p className="text-slate-400 text-sm mt-1">
            Register HuggingFace checkpoints for mechanistic tracing (GPT-2 default for CPU demos).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/onboarding"
            className="px-4 py-2 bg-cyan-accent/90 text-navy font-mono text-xs font-semibold inline-block text-center"
          >
            Add model
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-4 py-2 border border-white/20 text-slate-200 font-mono text-xs font-semibold hover:bg-white/5"
          >
            Quick register
          </button>
        </div>
      </div>

      <div className="glass rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left font-mono text-xs text-slate-500 border-b border-white/10">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">HF id</th>
              <th className="p-3">Domain</th>
              <th className="p-3">Layers</th>
              <th className="p-3">BCI</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="p-3 text-slate-500" colSpan={5}>
                  Loading…
                </td>
              </tr>
            )}
            {(models || []).map((m) => (
              <tr key={m.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="p-3 font-medium">{m.name}</td>
                <td className="p-3 font-mono text-xs text-slate-400">{m.huggingface_id}</td>
                <td className="p-3 font-mono text-xs">{m.domain}</td>
                <td className="p-3 font-mono text-xs">{m.layer_count}</td>
                <td className="p-3 font-mono text-xs">
                  {m.overall_risk_score?.toFixed?.(0) ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={submit}
            className="glass max-w-lg w-full p-6 space-y-4 rounded-sm border border-cyan-accent/20"
          >
            <div className="font-mono text-xs text-cyan-accent">NEW MODEL</div>
            <label className="block text-sm">
              <span className="text-slate-400 text-xs font-mono">DISPLAY NAME</span>
              <input
                className="mt-1 w-full bg-navy border border-white/15 px-3 py-2 font-mono text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-400 text-xs font-mono">HUGGINGFACE ID</span>
              <input
                className="mt-1 w-full bg-navy border border-white/15 px-3 py-2 font-mono text-sm"
                value={hf}
                onChange={(e) => setHf(e.target.value)}
                placeholder="gpt2 or meta-llama/Llama-3.2-1B-Instruct"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-400 text-xs font-mono">DOMAIN</span>
              <select
                className="mt-1 w-full bg-navy border border-white/15 px-3 py-2 font-mono text-sm"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              >
                <option value="lending">lending</option>
                <option value="healthcare">healthcare</option>
                <option value="insurance">insurance</option>
                <option value="general">general</option>
              </select>
            </label>
            {err && <div className="text-critical text-sm">{err}</div>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-2 text-sm text-slate-400"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 bg-cyan-accent/90 text-navy font-mono text-xs font-semibold disabled:opacity-50"
              >
                {busy ? "REGISTERING…" : "REGISTER & ANALYZE"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
