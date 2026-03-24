/** BCI score coloring (JetBrains + semantic colors). */

export function bciRiskLabel(score) {
  const s = Number(score) || 0;
  if (s < 10) return "LOW";
  if (s < 25) return "MODERATE";
  if (s < 50) return "HIGH";
  return "CRITICAL";
}

export function bciTextClass(score) {
  const s = Number(score) || 0;
  if (s < 10) return "text-neuron-low";
  if (s < 25) return "text-neuron-moderate";
  if (s < 50) return "text-neuron-high";
  return "text-neuron-critical";
}

export function riskBadgeClass(level) {
  const L = String(level || "LOW").toUpperCase();
  if (L === "CRITICAL") return "bg-violet-500/15 text-neuron-critical border border-violet-500/35";
  if (L === "HIGH") return "bg-red-500/15 text-neuron-high border border-red-500/35";
  if (L === "MEDIUM" || L === "MODERATE") return "bg-amber-500/15 text-neuron-moderate border border-amber-500/35";
  return "bg-emerald-500/15 text-neuron-low border border-emerald-500/35";
}
