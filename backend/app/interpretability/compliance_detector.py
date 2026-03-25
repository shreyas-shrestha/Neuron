"""
Compliance-oriented heuristics over layer trajectories.

MVP: demographic probe separation, disparate impact via trajectory divergence,
distribution shift via embedding norm, and template regulatory flags.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression

from app.interpretability.lending_probes import anonymize_probe_text, build_probe_texts
from app.interpretability.trajectory import LayerTrajectoryTracker, TrajectoryResult


@dataclass
class RiskFlag:
    risk_category: str
    risk_level: str
    affected_layers: list[int]
    feature_indices: list[int]
    description: str
    evidence_texts: list[str]
    recommended_actions: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "risk_category": self.risk_category,
            "risk_level": self.risk_level,
            "affected_layers": self.affected_layers,
            "feature_indices": self.feature_indices,
            "description": self.description,
            "evidence_texts": self.evidence_texts,
            "recommended_actions": self.recommended_actions,
        }


@dataclass
class ProbeResult:
    auc: float
    n_samples: int
    separation_score: float
    notes: str
    interpretation: str = ""


@dataclass
class DisparityScore:
    divergence: float
    risk_level: str
    summary: str


def _auc_interpretation(auc: float) -> str:
    if auc < 0.60:
        return "LOW (expected for untrained SAE)"
    if auc <= 0.75:
        return "MODERATE (investigate further)"
    return "HIGH (meaningful signal with trained weights)"


class ComplianceDetector:
    REGULATORY_HINTS: dict[str, list[str]] = {
        "lending": ["ECOA", "Fair Lending", "adverse action notices"],
        "healthcare": ["HIPAA minimum necessary", "clinical decision support oversight"],
        "insurance": ["Unfair discrimination", "U.S. state insurance fairness bulletins"],
        "general": ["EU AI Act Art. 10 data governance", "EU AI Act Annex III high-risk"],
    }

    def __init__(self, tracker: LayerTrajectoryTracker, domain: str):
        self.tracker = tracker
        self.domain = domain

    def run_demographic_probe(self, n_samples: int = 100) -> ProbeResult:
        texts, labels = build_probe_texts(n_samples=n_samples)
        embeddings: list[np.ndarray] = []
        for t in texts:
            tr = self.tracker.track(anonymize_probe_text(t))
            embeddings.append(tr.trajectory_embedding)
        X = np.stack(embeddings, axis=0)
        y = np.array(labels)
        if len(np.unique(y)) < 2:
            return ProbeResult(
                auc=0.5,
                n_samples=n_samples,
                separation_score=0.0,
                notes="single class",
                interpretation=_auc_interpretation(0.5),
            )
        try:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.3, random_state=42, stratify=y
            )
            clf = LogisticRegression(max_iter=200, random_state=42)
            clf.fit(X_train, y_train)
            proba = clf.predict_proba(X_test)[:, 1]
            auc = float(roc_auc_score(y_test, proba))
        except ValueError:
            auc = 0.5
        separation = max(0.0, (auc - 0.5) * 2.0)
        notes = (
            "Names anonymized before trajectory extraction. AUC reflects downstream "
            "representational separation, not surface token differences. Untrained SAE "
            "weights produce near-random baseline (~0.5). Train SAE checkpoints for "
            "meaningful signal."
        )
        return ProbeResult(
            auc=auc,
            n_samples=n_samples,
            separation_score=separation,
            notes=notes,
            interpretation=_auc_interpretation(auc),
        )

    def detect_disparate_impact(self, text_a: str, text_b: str) -> DisparityScore:
        ta = self.tracker.track(text_a)
        tb = self.tracker.track(text_b)
        div = self.tracker.trajectory_divergence(ta.trajectory_embedding, tb.trajectory_embedding)
        if div > 0.35:
            level = "HIGH"
        elif div > 0.2:
            level = "MEDIUM"
        else:
            level = "LOW"
        summary = (
            f"Trajectory cosine distance proxy: {div:.3f}. "
            "Near-identical loan applications with different surface details diverge in internal geometry."
        )
        return DisparityScore(divergence=div, risk_level=level, summary=summary)

    def generate_risk_flags(
        self,
        sample_trajectory: TrajectoryResult,
        probe: ProbeResult | None = None,
        disparity: DisparityScore | None = None,
        evidence_texts: list[str] | None = None,
    ) -> list[RiskFlag]:
        flags: list[RiskFlag] = []
        evidence_texts = evidence_texts or []

        if probe and probe.auc >= 0.7:
            flags.append(
                RiskFlag(
                    risk_category="DEMOGRAPHIC_PROXY",
                    risk_level="HIGH",
                    affected_layers=list(range(sample_trajectory.layer_count)),
                    feature_indices=sample_trajectory.heatmap_feature_ids[:16],
                    description=(
                        f"Probe AUC {probe.auc:.2f} on label-conditioned loan templates (names anonymized "
                        "in the probe) exceeds 0.7 threshold. Internal activations separate label groups."
                    ),
                    evidence_texts=evidence_texts[:3],
                    recommended_actions=[
                        "Run representation constraints / adversarial debiasing on activations.",
                        "Document mitigation for model governance file.",
                        "Review training corpus for correlated proxies.",
                    ],
                )
            )
        elif probe and probe.auc >= 0.6:
            flags.append(
                RiskFlag(
                    risk_category="DEMOGRAPHIC_PROXY",
                    risk_level="MEDIUM",
                    affected_layers=[max(0, sample_trajectory.layer_count // 2)],
                    feature_indices=sample_trajectory.heatmap_feature_ids[:8],
                    description=f"Moderate separability (AUC {probe.auc:.2f}) on label-conditioned probe.",
                    evidence_texts=evidence_texts[:2],
                    recommended_actions=["Expand probe suite", "Add counterfactual testing"],
                )
            )

        if disparity and disparity.risk_level in ("HIGH", "MEDIUM"):
            flags.append(
                RiskFlag(
                    risk_category="DISPARATE_IMPACT",
                    risk_level=disparity.risk_level,
                    affected_layers=list(range(sample_trajectory.layer_count)),
                    feature_indices=[],
                    description=disparity.summary,
                    evidence_texts=evidence_texts[:2],
                    recommended_actions=[
                        "Pairwise audit semantically equivalent cases",
                        "Log internal uncertainty vs output confidence",
                    ],
                )
            )

        curve_vals = list(sample_trajectory.per_layer_curve.values())
        if curve_vals:
            spike_layer = max(sample_trajectory.per_layer_curve, key=sample_trajectory.per_layer_curve.get)
            if sample_trajectory.per_layer_curve[spike_layer] > np.mean(curve_vals) * 1.8:
                flags.append(
                    RiskFlag(
                        risk_category="DISTRIBUTION_SHIFT",
                        risk_level="MEDIUM",
                        affected_layers=[spike_layer],
                        feature_indices=sample_trajectory.novel_features.get(spike_layer, [])[:24],
                        description=(
                            f"Layer {spike_layer} shows elevated sparse activation magnitude vs other layers — "
                            "possible OOD stress in internal features."
                        ),
                        evidence_texts=evidence_texts[:1],
                        recommended_actions=["Calibrate on production slice", "Monitor KS drift on embeddings"],
                    )
                )

        for _ in self.REGULATORY_HINTS.get(self.domain, self.REGULATORY_HINTS["general"])[:3]:
            flags.append(
                RiskFlag(
                    risk_category="REGULATORY_PATTERN",
                    risk_level="LOW",
                    affected_layers=[],
                    feature_indices=[],
                    description="Benchmark checklist item — see exported behavior report for citations.",
                    evidence_texts=[],
                    recommended_actions=["Map control to policy owner", "Attach evidence in audit trail"],
                )
            )

        return flags

    @staticmethod
    def overall_risk_score(flags: list[RiskFlag]) -> float:
        weights = {"CRITICAL": 100, "HIGH": 70, "MEDIUM": 40, "LOW": 10}
        if not flags:
            return 5.0
        score = sum(weights.get(f.risk_level, 20) for f in flags) / len(flags)
        return float(min(100.0, max(0.0, score)))
