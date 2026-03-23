import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createApiKey, fetchMe, listApiKeys, revokeApiKey } from "../services/api.js";

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="px-3 py-1.5 text-xs font-mono bg-cyan-accent/20 text-cyan-accent border border-cyan-accent/40 rounded-sm hover:bg-cyan-accent/30"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export default function Settings() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const { data: keys, isLoading } = useQuery({ queryKey: ["api-keys"], queryFn: listApiKeys });

  const [modalOpen, setModalOpen] = useState(false);
  const [newKeyPlain, setNewKeyPlain] = useState(null);
  const [label, setLabel] = useState("");

  const gen = useMutation({
    mutationFn: () => createApiKey({ label: label.trim() || null }),
    onSuccess: (data) => {
      setNewKeyPlain(data.key);
      setModalOpen(true);
      setLabel("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id) => revokeApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <div>
        <div className="font-mono text-xs text-cyan-accent tracking-widest">SETTINGS</div>
        <h1 className="text-2xl font-semibold mt-1">Account &amp; API keys</h1>
        <p className="text-slate-400 text-sm mt-1">
          Keys are shown in full only once. Neuron stores a hash — not the plaintext secret.
        </p>
      </div>

      <section className="glass rounded-sm p-5 space-y-4">
        <h2 className="font-mono text-xs text-cyan-accent tracking-widest">API KEYS</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex-1 min-w-[200px] text-sm">
            <span className="text-xs font-mono text-slate-500">LABEL (OPTIONAL)</span>
            <input
              className="mt-1 w-full bg-navy border border-white/15 px-3 py-2 font-mono text-sm"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="CI / laptop"
            />
          </label>
          <button
            type="button"
            disabled={gen.isPending}
            onClick={() => gen.mutate()}
            className="px-4 py-2 bg-cyan-accent/90 text-navy font-mono text-xs font-semibold disabled:opacity-50"
          >
            {gen.isPending ? "GENERATING…" : "GENERATE NEW KEY"}
          </button>
        </div>
        {gen.isError && (
          <div className="text-critical text-sm font-mono">
            {gen.error?.response?.data?.detail || "Could not create key"}
          </div>
        )}

        <div className="border border-white/10 rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left font-mono text-xs text-slate-500 border-b border-white/10 bg-black/20">
              <tr>
                <th className="p-3">Key</th>
                <th className="p-3">Label</th>
                <th className="p-3">Created</th>
                <th className="p-3 w-28" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={4} className="p-3 text-slate-500">
                    Loading…
                  </td>
                </tr>
              )}
              {(keys || []).map((k) => (
                <tr key={k.id} className="border-b border-white/5">
                  <td className="p-3 font-mono text-xs text-slate-300">{k.masked_key}</td>
                  <td className="p-3 text-slate-400">{k.label || "—"}</td>
                  <td className="p-3 font-mono text-xs text-slate-500">
                    {k.created_at ? new Date(k.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="p-3">
                    {k.is_active ? (
                      <button
                        type="button"
                        className="text-xs font-mono text-amber-warn hover:underline"
                        onClick={() => {
                          if (window.confirm("Revoke this API key? SDK calls using it will fail.")) {
                            revoke.mutate(k.id);
                          }
                        }}
                      >
                        Revoke
                      </button>
                    ) : (
                      <span className="text-xs font-mono text-slate-600">Revoked</span>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoading && !(keys || []).length && (
                <tr>
                  <td colSpan={4} className="p-3 text-slate-500">
                    No keys yet. Generate one for the Python SDK.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass rounded-sm p-5 space-y-2 text-sm text-slate-400">
        <h2 className="font-mono text-xs text-cyan-accent tracking-widest">PROFILE</h2>
        <p>
          <span className="font-mono text-slate-500">Email</span>{" "}
          <span className="text-slate-200">{me?.email || "—"}</span>
        </p>
      </section>

      {modalOpen && newKeyPlain && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="glass max-w-lg w-full p-6 space-y-4 border border-amber-500/30 rounded-sm">
            <div className="font-mono text-xs text-amber-warn tracking-widest">SAVE YOUR KEY</div>
            <p className="text-sm text-amber-200/90 border border-amber-500/30 bg-amber-500/10 px-3 py-2 rounded-sm">
              Copy now — this won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="flex-1 min-w-0 break-all text-xs font-mono bg-black/40 px-3 py-2 border border-white/10 rounded-sm text-cyan-accent/90">
                {newKeyPlain}
              </code>
              <CopyButton text={newKeyPlain} />
            </div>
            <button
              type="button"
              className="w-full py-2 text-sm font-mono text-slate-300 border border-white/15 hover:bg-white/5"
              onClick={() => {
                setModalOpen(false);
                setNewKeyPlain(null);
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
