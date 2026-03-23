/** Display-only labels; API / JSON field names unchanged. */

export function displayRiskCategory(raw) {
  const m = {
    DEMOGRAPHIC_PROXY: "Name-Sensitive Activations",
    REGULATORY_PATTERN: "Benchmark Pattern",
  };
  return m[raw] || raw;
}

export function displayFlagDescription(flag) {
  if (!flag?.description) return "";
  let d = flag.description;
  const legal = ["ECOA", "Fair Lending", "Fair Housing Act", "adverse action notices"];
  for (const term of legal) {
    if (d.includes(term)) {
      return "Benchmark checklist item — see exported behavior report for detail.";
    }
  }
  return d;
}
