"""
Lightweight feature labeling: cluster top activating dimensions into named groups for UI.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.cluster import KMeans


def cluster_feature_labels(
    activation_matrix: np.ndarray,
    n_clusters: int = 6,
    prefix: str = "cluster",
) -> list[dict[str, Any]]:
    """
    activation_matrix: shape (n_samples, n_features) — sparse codes or hidden magnitudes.
    Returns list of {id, label, member_indices}.
    """
    if activation_matrix.size == 0:
        return []
    n_clusters = min(n_clusters, activation_matrix.shape[0], max(2, activation_matrix.shape[1] // 8))
    if n_clusters < 2:
        return [{"id": 0, "label": f"{prefix}_0", "member_indices": list(range(activation_matrix.shape[1]))}]
    km = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
    labels = km.fit_predict(activation_matrix.T)
    groups: dict[int, list[int]] = {}
    for feat_idx, lab in enumerate(labels):
        groups.setdefault(int(lab), []).append(int(feat_idx))
    return [
        {"id": gid, "label": f"{prefix}_{gid}", "member_indices": idxs}
        for gid, idxs in sorted(groups.items())
    ]


def summarize_top_features(
    codes: np.ndarray,
    k: int = 12,
) -> list[dict[str, Any]]:
    """Mean activation per feature index across tokens; return top-k."""
    if codes.ndim == 1:
        codes = codes.reshape(1, -1)
    mean_abs = np.abs(codes).mean(axis=0)
    top_idx = np.argsort(-mean_abs)[:k]
    return [
        {"index": int(i), "magnitude": float(mean_abs[i])}
        for i in top_idx
        if mean_abs[i] > 1e-8
    ]
