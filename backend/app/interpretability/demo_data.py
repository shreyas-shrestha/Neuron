from __future__ import annotations

from typing import Any, List

import numpy as np


def _empty_codes(n_layers: int, rng: np.random.Generator, dim: int = 32) -> dict[str, list[float]]:
    return {str(i): rng.normal(0, 0.05, dim).astype(float).tolist() for i in range(n_layers)}


def _scale_base_to_layers(base12: np.ndarray, n_layers: int) -> np.ndarray:
    if n_layers == len(base12):
        return base12.astype(float).copy()
    x_old = np.linspace(0, 1, len(base12))
    x_new = np.linspace(0, 1, n_layers)
    return np.interp(x_new, x_old, base12).astype(float)


def generate_trajectory_api_dict(
    n_layers: int = 12,
    n_features: int = 48,
    scenario: str = "baseline",
) -> dict[str, Any]:
    rng = np.random.default_rng(42)
    hidden_dim = 768

    if scenario == "baseline":
        np.random.seed(42)
        base12 = np.array(
            [
                0.82,
                0.79,
                0.91,
                1.05,
                0.98,
                1.23,
                1.31,
                1.28,
                1.44,
                1.67,
                1.89,
                2.08,
            ],
            dtype=float,
        )
        base = _scale_base_to_layers(base12, n_layers)
        noise = np.random.normal(0, 0.04, n_layers)
        magnitudes = (base + noise).clip(0.5, 3.0)
        novel: dict[int, list[int]] = {2: [3, 7], 5: [12, 18]}
    elif scenario == "normal_drift":
        np.random.seed(43)
        base12 = np.array(
            [
                0.84,
                0.81,
                0.94,
                1.08,
                1.02,
                1.27,
                1.35,
                1.31,
                1.48,
                1.71,
                1.94,
                2.14,
            ],
            dtype=float,
        )
        base = _scale_base_to_layers(base12, n_layers)
        noise = np.random.normal(0, 0.06, n_layers)
        magnitudes = (base + noise).clip(0.5, 3.0)
        novel = {2: [3, 7], 5: [12, 18], 7: [5, 9]}
    else:  # problematic
        np.random.seed(44)
        base12 = np.array(
            [
                0.84,
                0.81,
                0.94,
                1.08,
                1.02,
                1.27,
                1.35,
                3.76,
                3.21,
                1.98,
                1.94,
                2.14,
            ],
            dtype=float,
        )
        base = _scale_base_to_layers(base12, n_layers)
        noise = np.random.normal(0, 0.06, n_layers)
        magnitudes = (base + noise).clip(0.5, 4.5)
        novel = {2: [3, 7], 5: [12, 18], 7: [11, 22], 8: [23, 24, 11]}

    magnitudes = np.asarray(magnitudes, dtype=float)
    diffs = np.abs(np.diff(magnitudes))
    deltas = np.append(diffs, diffs[-1] if len(diffs) else 0.0).tolist()
    per_layer_curve = {str(i): float(magnitudes[i]) for i in range(n_layers)}
    per_layer_curve_delta = {str(i): float(deltas[i]) for i in range(n_layers)}

    heatmap = []
    for layer in range(n_layers):
        if scenario == "problematic" and layer in (7, 8, 9):
            row = rng.exponential(0.6, n_features)
            row[23] = 0.95
            row[24] = 0.87
            row[11] = 0.78
        else:
            row = rng.exponential(0.32 if scenario != "baseline" else 0.3, n_features)
        heatmap.append(np.clip(row, 0, 1).astype(float).tolist())

    delta_summary: dict[str, list[float]] = {}
    prev = rng.normal(0, 0.1, 32).astype(float)
    for i in range(1, n_layers):
        cur = rng.normal(0, 0.12, 32).astype(float)
        delta_summary[str(i)] = (cur - prev).tolist()
        prev = cur

    if scenario == "problematic":
        delta_summary["8"] = (np.ones(32) * 0.15).tolist()

    novel_by_layer = {str(k): v for k, v in novel.items()}
    heatmap_feature_ids = list(range(n_features))

    top_per: dict[str, list[dict[str, Any]]] = {}
    for li in range(n_layers):
        top_per[str(li)] = [
            {"feature_id": int(j), "mass": float(heatmap[li][j])} for j in range(min(5, n_features))
        ]

    traj_emb = rng.normal(0, 0.05, 64).astype(float).tolist()

    return {
        "per_layer_codes": _empty_codes(n_layers, rng),
        "delta_summary": delta_summary,
        "novel_features_by_layer": novel_by_layer,
        "trajectory_embedding": traj_emb,
        "per_layer_curve": per_layer_curve,
        "per_layer_curve_delta": per_layer_curve_delta,
        "heatmap": heatmap,
        "heatmap_feature_ids": heatmap_feature_ids,
        "top_features_per_layer": top_per,
        "token_windows": {"spans": []},
        "layer_count": n_layers,
        "hidden_dim": hidden_dim,
        "feature_clusters": [],
        "probe": {"auc": 0.52, "interpretation": "Synthetic demo probe."},
        "disparity": {},
        "sae_trained": True,
    }


def generate_retraining_checkpoints(analysis_ids: List[str]) -> list[dict[str, Any]]:
    if len(analysis_ids) < 3:
        raise ValueError("expected 3 analysis ids")
    return [
        {
            "analysis_id": analysis_ids[0],
            "epoch": 1,
            "label": "production_v1",
            "bci": 0.0,
            "risk_level": "LOW",
            "flags": [],
        },
        {
            "analysis_id": analysis_ids[1],
            "epoch": 2,
            "label": "retrain_v1",
            "bci": 8.3,
            "risk_level": "LOW",
            "flags": [],
        },
        {
            "analysis_id": analysis_ids[2],
            "epoch": 3,
            "label": "retrain_v2_problematic",
            "bci": 34.7,
            "risk_level": "HIGH",
            "flags": [],
        },
    ]
