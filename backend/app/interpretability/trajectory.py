"""
Layer-wise representation trajectory via TransformerLens + optional per-layer SAE.
"""

from __future__ import annotations

import gc
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import torch

_log = logging.getLogger(__name__)

from app.core.config import settings
from app.interpretability.feature_extraction import cluster_feature_labels, summarize_top_features
from app.interpretability.sae import SparseAutoencoder


def _resid_hook_name(layer: int) -> str:
    return f"blocks.{layer}.hook_resid_post"


@dataclass
class TrajectoryResult:
    per_layer_codes: dict[int, np.ndarray]
    delta_codes: dict[int, np.ndarray]
    novel_features: dict[int, list[int]]
    trajectory_embedding: np.ndarray
    per_layer_curve: dict[int, float]
    heatmap: np.ndarray
    heatmap_feature_ids: list[int]
    top_features_per_layer: dict[int, list[dict[str, Any]]]
    token_spans: list[dict[str, Any]]
    layer_count: int
    hidden_dim: int
    feature_clusters: list[dict[str, Any]] = field(default_factory=list)
    sae_trained: bool = False

    def to_api_dict(self) -> dict[str, Any]:
        return {
            "per_layer_codes": {str(k): v.astype(float).tolist() for k, v in self.per_layer_codes.items()},
            "delta_summary": {
                str(k): v.astype(float).tolist() for k, v in self.delta_codes.items()
            },
            "novel_features_by_layer": {str(k): v for k, v in self.novel_features.items()},
            "trajectory_embedding": self.trajectory_embedding.astype(float).tolist(),
            "per_layer_curve": {str(k): float(v) for k, v in self.per_layer_curve.items()},
            "heatmap": self.heatmap.astype(float).tolist(),
            "heatmap_feature_ids": self.heatmap_feature_ids,
            "top_features_per_layer": {
                str(k): v for k, v in self.top_features_per_layer.items()
            },
            "token_windows": {"spans": self.token_spans},
            "layer_count": self.layer_count,
            "hidden_dim": self.hidden_dim,
            "feature_clusters": self.feature_clusters,
            "sae_trained": self.sae_trained,
        }


class LayerTrajectoryTracker:
    def __init__(
        self,
        model_name: str,
        sae_checkpoints: dict[int, str] | None = None,
        device: str | None = None,
    ):
        from transformer_lens import HookedTransformer

        self.model_name = model_name
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = HookedTransformer.from_pretrained(
            model_name,
            device=self.device,
            dtype=torch.float32,
        )
        self.sae_checkpoints = sae_checkpoints or {}
        self._saes: dict[int, SparseAutoencoder] = {}
        d_model = int(self.model.cfg.d_model)
        n_layers = int(self.model.cfg.n_layers)
        sparse_dim = min(12 * d_model, 65536)
        self._sparse_dim = sparse_dim
        self.sae_trained = any(
            (settings.sae_checkpoints_dir / f"gpt2_layer{i}.pt").is_file() for i in range(12)
        )
        self._layer_norm: dict[int, tuple[torch.Tensor, torch.Tensor] | None] = {}
        for layer in range(n_layers):
            sae = SparseAutoencoder(hidden_dim=d_model, sparse_dim=sparse_dim, k=64)
            path_str = self.sae_checkpoints.get(layer)
            if not path_str or not Path(path_str).is_file():
                auto = settings.sae_checkpoints_dir / f"gpt2_layer{layer}.pt"
                if auto.is_file():
                    path_str = str(auto)
            self._layer_norm[layer] = None
            if path_str and Path(path_str).is_file():
                ckpt = None
                try:
                    ckpt = torch.load(
                        path_str,
                        map_location=self.device,
                        weights_only=True,
                    )
                except Exception:
                    _log.exception(
                        "SAE checkpoint %s failed safe load (weights_only=True); skipping layer. "
                        "Re-save with torch.save({\"state_dict\": sae.state_dict(), ...}, path).",
                        path_str,
                    )
                if ckpt is not None:
                    if isinstance(ckpt, dict) and "state_dict" in ckpt:
                        sae.load_state_dict(ckpt["state_dict"], strict=False)
                        if "x_mean" in ckpt and "x_std" in ckpt:
                            self._layer_norm[layer] = (
                                ckpt["x_mean"].to(self.device),
                                ckpt["x_std"].to(self.device).clamp(min=1e-8),
                            )
                    elif isinstance(ckpt, dict):
                        sae.load_state_dict(ckpt, strict=False)
            sae.to(self.device)
            sae.eval()
            self._saes[layer] = sae

    def _encode_layer(self, layer: int, resid: torch.Tensor) -> torch.Tensor:
        """resid: [batch, pos, d_model] -> codes same shape last dim sparse then mean over batch,pos."""
        sae = self._saes[layer]
        b, p, d = resid.shape
        flat = resid.reshape(-1, d)
        with torch.no_grad():
            norm = self._layer_norm.get(layer)
            if norm is not None:
                xm, xs = norm
                flat = (flat - xm.to(flat.device)) / xs.to(flat.device).clamp(min=1e-8)
            _, codes, _ = sae(flat)
        del flat
        return codes.reshape(b, p, -1)

    def track(self, text: str) -> TrajectoryResult:
        tokens = self.model.to_tokens(text, truncate=False)
        hook_names = [_resid_hook_name(i) for i in range(self.model.cfg.n_layers)]
        try:
            _, cache = self.model.run_with_cache(tokens, names_filter=hook_names)
        except TypeError:
            _, cache = self.model.run_with_cache(
                tokens, names_filter=lambda n: n in hook_names
            )

        per_layer_codes: dict[int, np.ndarray] = {}
        per_layer_curve: dict[int, float] = {}

        try:
            for layer in range(self.model.cfg.n_layers):
                key = _resid_hook_name(layer)
                resid = cache[key].clone()
                codes = self._encode_layer(layer, resid)
                del resid
                mean_code = codes.mean(dim=(0, 1)).detach().cpu().numpy()
                del codes
                per_layer_codes[layer] = mean_code
                per_layer_curve[layer] = float(np.linalg.norm(mean_code))
        finally:
            del cache
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            gc.collect()

        delta_codes: dict[int, np.ndarray] = {}
        novel_features: dict[int, list[int]] = {}
        prev = per_layer_codes.get(0, np.zeros_like(next(iter(per_layer_codes.values()))))
        for layer in range(1, self.model.cfg.n_layers):
            cur = per_layer_codes[layer]
            delta = cur - prev
            delta_codes[layer] = delta
            emerged = np.where((prev <= 1e-6) & (cur > 1e-4))[0]
            novel_features[layer] = emerged[:128].tolist()
            prev = cur

        traj_vec = np.concatenate([per_layer_codes[i] for i in sorted(per_layer_codes.keys())])
        traj_emb = traj_vec[:512] if traj_vec.size >= 512 else np.pad(traj_vec, (0, 512 - traj_vec.size))

        n_layers = self.model.cfg.n_layers
        top_k = 32
        heatmap_rows = []
        all_top_idx: set[int] = set()
        top_features_per_layer: dict[int, list[dict[str, Any]]] = {}
        for layer in range(n_layers):
            c = per_layer_codes[layer]
            top = summarize_top_features(c.reshape(1, -1), k=top_k)
            top_features_per_layer[layer] = top
            for item in top:
                all_top_idx.add(int(item["index"]))
        heatmap_feature_ids = sorted(all_top_idx)[:48]
        if not heatmap_feature_ids:
            heatmap_feature_ids = list(range(min(48, self._sparse_dim)))
        idx_map = {j: i for i, j in enumerate(heatmap_feature_ids)}
        heatmap = np.zeros((n_layers, len(heatmap_feature_ids)))
        for layer in range(n_layers):
            c = per_layer_codes[layer]
            for j, fid in enumerate(heatmap_feature_ids):
                heatmap[layer, j] = float(c[fid])

        str_tokens = self.model.to_str_tokens(text)
        token_spans = [{"index": i, "token": t} for i, t in enumerate(str_tokens)]

        stack = np.stack([per_layer_codes[i] for i in range(n_layers)], axis=0)
        clusters = cluster_feature_labels(stack, n_clusters=min(6, n_layers))

        return TrajectoryResult(
            per_layer_codes=per_layer_codes,
            delta_codes=delta_codes,
            novel_features=novel_features,
            trajectory_embedding=traj_emb.astype(np.float32),
            per_layer_curve=per_layer_curve,
            heatmap=heatmap,
            heatmap_feature_ids=heatmap_feature_ids,
            top_features_per_layer=top_features_per_layer,
            token_spans=token_spans,
            layer_count=n_layers,
            hidden_dim=int(self.model.cfg.d_model),
            feature_clusters=clusters,
            sae_trained=self.sae_trained,
        )

    def compute_delta(
        self, codes_l: torch.Tensor, codes_l1: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor]:
        delta = codes_l1 - codes_l
        emerged = ((codes_l.abs() < 1e-6) & (codes_l1 > 1e-4)).float()
        return delta, emerged

    def trajectory_divergence(self, emb_a: np.ndarray, emb_b: np.ndarray) -> float:
        a = emb_a / (np.linalg.norm(emb_a) + 1e-8)
        b = emb_b / (np.linalg.norm(emb_b) + 1e-8)
        return float(1.0 - np.dot(a, b))
