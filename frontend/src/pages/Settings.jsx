import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createApiKey, fetchMe, listApiKeys, revokeApiKey } from "../services/api.js";

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary text-[12px] min-h-0 py-2 px-3"
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
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-[13px] text-neuron-mutedText font-sans">Settings</p>
        <h2 className="font-display font-semibold text-[22px] text-neuron-primary mt-0.5">Account &amp; API keys</h2>
        <p className="text-[13px] text-neuron-secondary mt-1 font-sans leading-relaxed">
          Keys are shown in full only once. Neuron stores a hash — not the plaintext secret.
        </p>
      </div>

      <section className="bg-neuron-bg rounded-md border border-neuron-border shadow-sm overflow-hidden transition-all duration-150 hover:shadow-md">
        <div className="px-6 py-5 border-b border-neuron-border flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-display font-semibold text-[15px] text-neuron-primary">API keys</h3>
            <p className="text-[13px] text-neuron-secondary mt-1 font-sans">
              Use keys with the Python SDK and CI integrations.
            </p>
          </div>
          <button
            type="button"
            disabled={gen.isPending}
            onClick={() => gen.mutate()}
            className="btn-secondary text-[13px] min-h-[36px] disabled:opacity-50"
          >
            {gen.isPending ? "Generating…" : "Generate new key"}
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <label className="block max-w-md">
            <span className="text-[12px] font-medium text-neuron-secondary font-sans">Label (optional)</span>
            <input
              className="input-neuron mt-1.5 font-sans text-[14px]"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="CI / laptop"
            />
          </label>
          {gen.isError && (
            <div className="text-sm text-neuron-danger font-sans border-l-[3px] border-l-neuron-danger bg-neuron-danger-light px-3 py-2 rounded-sm">
              {gen.error?.response?.data?.detail || "Could not create key"}
            </div>
          )}

          <div className="overflow-x-auto rounded-sm border border-neuron-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-neuron-mutedText font-medium border-b border-neuron-border bg-neuron-subtle/80">
                  <th className="py-3 px-4 font-sans">Name</th>
                  <th className="py-3 px-4 font-sans">Key</th>
                  <th className="py-3 px-4 font-sans">Created</th>
                  <th className="py-3 px-4 font-sans">Last used</th>
                  <th className="py-3 px-4 font-sans">Status</th>
                  <th className="py-3 px-4 font-sans text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="p-4 text-neuron-secondary font-sans">
                      Loading…
                    </td>
                  </tr>
                )}
                {(keys || []).map((k) => (
                  <tr
                    key={k.id}
                    className="border-b border-neuron-border last:border-0 transition-colors duration-100 hover:bg-neuron-subtle"
                  >
                    <td className="py-3 px-4 text-neuron-primary font-sans">{k.label || "—"}</td>
                    <td className="py-3 px-4 font-mono text-[12px] text-neuron-secondary">{k.masked_key}</td>
                    <td className="py-3 px-4 font-mono text-[12px] text-neuron-mutedText">
                      {k.created_at ? new Date(k.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-3 px-4 font-mono text-[12px] text-neuron-mutedText">—</td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[11px] font-mono font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                          k.is_active
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/45"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-600"
                        }`}
                      >
                        {k.is_active ? "Active" : "Revoked"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {k.is_active ? (
                        <button
                          type="button"
                          className="text-[12px] font-medium text-neuron-warning hover:underline font-sans"
                          onClick={() => {
                            if (window.confirm("Revoke this API key? SDK calls using it will fail.")) {
                              revoke.mutate(k.id);
                            }
                          }}
                        >
                          Revoke
                        </button>
                      ) : (
                        <span className="text-neuron-mutedText text-[12px]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!isLoading && !(keys || []).length && (
                  <tr>
                    <td colSpan={6} className="p-4 text-neuron-secondary font-sans">
                      No keys yet. Generate one for the Python SDK.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-neuron-bg rounded-md border border-neuron-border shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-neuron-border">
          <h3 className="font-display font-semibold text-[15px] text-neuron-primary">Profile</h3>
          <p className="text-[13px] text-neuron-secondary mt-1 font-sans">Workspace identity</p>
        </div>
        <div className="px-6 py-5 text-[14px] font-sans text-neuron-secondary">
          <span className="text-neuron-mutedText">Email</span>{" "}
          <span className="text-neuron-primary font-medium">{me?.email || "—"}</span>
        </div>
      </section>

      {modalOpen && newKeyPlain && (
        <div
          className="neuron-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setModalOpen(false);
            setNewKeyPlain(null);
          }}
        >
          <div
            className="neuron-modal-panel neuron-modal-panel--lg space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display font-semibold text-[18px] text-neuron-primary">New API key generated</h3>
            <div className="rounded-sm border-l-[3px] border-l-neuron-warning bg-amber-500/10 px-3 py-2 text-[13px] text-neuron-primary font-sans flex gap-2 border border-amber-500/20">
              <svg className="w-5 h-5 shrink-0 text-neuron-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
              </svg>
              <span>This key won&apos;t be shown again. Copy it now.</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <code className="flex-1 min-w-0 break-all text-[13px] font-mono bg-neuron-muted px-3 py-2 rounded-sm border border-neuron-border text-neuron-primary">
                {newKeyPlain}
              </code>
              <CopyButton text={newKeyPlain} />
            </div>
            <button
              type="button"
              className="btn-primary w-full h-10"
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
