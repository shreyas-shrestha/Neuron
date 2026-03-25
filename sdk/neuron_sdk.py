from __future__ import annotations

import copy
import hashlib
import json
import os
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

import requests
import torch.nn as nn

NEURON_API_URL = os.environ.get("NEURON_API_URL", "http://localhost:8000")

_config: dict[str, Any] = {
    "api_key": None,
    "model_id": None,
    "baseline_id": None,
    "fail_on": None,
    "layers_to_monitor": None,
    "drift_scale": 500.0,
}


def init(
    api_key: str,
    model_id: str,
    baseline_id: Optional[str] = None,
    fail_on: Optional[str] = None,
    layers_to_monitor: Optional[list[int]] = None,
    drift_scale: float = 500.0,
) -> None:
    _config["api_key"] = api_key
    _config["model_id"] = model_id
    _config["baseline_id"] = baseline_id
    _config["fail_on"] = fail_on
    _config["layers_to_monitor"] = layers_to_monitor
    _config["drift_scale"] = drift_scale
    print(f"[neuron] Initialized for model: {model_id}")


def _risk_rank(level: str) -> int:
    order = {"LOW": 0, "MODERATE": 1, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
    return order.get((level or "LOW").upper(), 0)


def _default_monitor_layers(model: Any) -> list[int]:
    n = int(model.cfg.n_layers)
    return sorted({0, n // 4, n // 2, 3 * n // 4, n - 1})


def compute_activation_bci(
    model_baseline: Any,
    model_current: Any,
    probe_dataloader: Iterable[Any],
    layers_to_monitor: Optional[list[int]] = None,
    drift_scale: float = 500.0,
) -> float:
    try:
        import torch
        import torch.nn.functional as F
        from transformer_lens import HookedTransformer
    except ModuleNotFoundError as e:
        raise ModuleNotFoundError(
            "compute_activation_bci requires PyTorch and transformer-lens. "
            "Install with: pip install 'neuron-sdk[activations]'"
        ) from e

    if not isinstance(model_baseline, HookedTransformer) or not isinstance(
        model_current, HookedTransformer
    ):
        raise TypeError(
            "model_baseline and model_current must be transformer_lens.HookedTransformer instances."
        )

    if layers_to_monitor is None:
        layers_to_monitor = _default_monitor_layers(model_current)

    model_baseline.eval()
    model_current.eval()

    total_drift = 0.0
    n_batches = 0

    dev_b = next(model_baseline.parameters()).device
    dev_c = next(model_current.parameters()).device

    with torch.no_grad():
        for batch in probe_dataloader:
            if isinstance(batch, dict):
                tokens = batch["input_ids"]
            else:
                tokens = batch
            if not hasattr(tokens, "to"):
                raise TypeError("Probe batch must provide tensor input_ids (or a tensor batch).")

            _, cache_base = model_baseline.run_with_cache(
                tokens.to(dev_b), names_filter=lambda n: "resid_post" in n
            )
            _, cache_curr = model_current.run_with_cache(
                tokens.to(dev_c), names_filter=lambda n: "resid_post" in n
            )

            batch_drift = 0.0

            for layer in layers_to_monitor:
                hook_name = f"blocks.{layer}.hook_resid_post"

                act_base = cache_base[hook_name]
                act_curr = cache_curr[hook_name]

                mean_base = act_base.mean(dim=1)
                mean_curr = act_curr.mean(dim=1)

                cos_sim = F.cosine_similarity(mean_base, mean_curr, dim=1)
                layer_drift = 1.0 - cos_sim.mean().item()
                batch_drift += layer_drift

            total_drift += batch_drift / len(layers_to_monitor)
            n_batches += 1

    if n_batches == 0:
        return 0.0

    raw_drift = total_drift / n_batches
    return float(min(100.0, max(0.0, raw_drift * drift_scale)))


def checkpoint(
    model: nn.Module,
    epoch: Optional[int] = None,
    step: Optional[int] = None,
    label: Optional[str] = None,
    block_on_high_risk: bool = False,
    probe_dataloader: Optional[Iterable[Any]] = None,
    hooked_baseline: Optional[Any] = None,
    layers_to_monitor: Optional[list[int]] = None,
) -> Optional["CheckpointResult"]:
    if not _config["api_key"]:
        raise RuntimeError("Call neuron.init() before neuron.checkpoint()")

    state_summary = _extract_model_summary(model, epoch=epoch)

    layers = layers_to_monitor if layers_to_monitor is not None else _config.get("layers_to_monitor")
    client_bci: Optional[float] = None
    if probe_dataloader is not None:
        if hooked_baseline is None:
            client_bci = 0.0
        else:
            client_bci = compute_activation_bci(
                hooked_baseline,
                model,
                probe_dataloader,
                layers_to_monitor=layers,
                drift_scale=float(_config.get("drift_scale") or 500.0),
            )

    payload = {
        "model_id": _config["model_id"],
        "epoch": epoch,
        "step": step,
        "label": label or f"epoch_{epoch}",
        "baseline_id": _config["baseline_id"],
        "state_summary": state_summary,
        "behavior_change_index": client_bci,
    }

    headers = {
        "Authorization": f"Bearer {_config['api_key']}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(
            f"{NEURON_API_URL}/api/v1/sdk/checkpoint",
            json=payload,
            headers=headers,
            timeout=30,
        )
        response.raise_for_status()
        result = response.json()

        risk_level = result.get("risk_level", "LOW")
        bci = float(result.get("behavior_change_index", 0))

        print(f"[neuron] Epoch {epoch} | BCI: {bci:.1f} | Risk: {risk_level}")

        fail_on = _config.get("fail_on") or ("HIGH" if block_on_high_risk else None)
        if fail_on is not None and _risk_rank(risk_level) >= _risk_rank(fail_on):
            raise RuntimeError(
                f"[neuron] BLOCKED: Risk level {risk_level} exceeds "
                f"threshold {fail_on}. "
                f"View analysis: {result.get('analysis_url', '')}"
            )

        return CheckpointResult(
            risk_level=risk_level,
            behavior_change_index=bci,
            analysis_id=result.get("analysis_id"),
            analysis_url=result.get("analysis_url"),
            flags=result.get("flags") or [],
        )

    except requests.RequestException as e:
        print(f"[neuron] Warning: Could not reach Neuron API: {e}")
        return None


def snapshot_hooked_baseline(model: nn.Module) -> Any:
    try:
        from transformer_lens import HookedTransformer
    except ModuleNotFoundError as e:
        raise ModuleNotFoundError(
            "snapshot_hooked_baseline requires transformer-lens. "
            "Install with: pip install 'neuron-sdk[activations]'"
        ) from e
    if not isinstance(model, HookedTransformer):
        raise TypeError("model must be a transformer_lens.HookedTransformer")
    return copy.deepcopy(model).cpu()


def _extract_model_summary(model: nn.Module, epoch: Optional[int] = None) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "architecture": model.__class__.__name__,
        "parameter_count": sum(p.numel() for p in model.parameters()),
        "epoch": epoch,
        "layer_stats": {},
    }

    for name, module in model.named_modules():
        if isinstance(module, (nn.Linear, nn.Conv2d)):
            weight = module.weight.data
            summary["layer_stats"][name] = {
                "mean": float(weight.mean().item()),
                "std": float(weight.std().item()),
                "norm": float(weight.norm().item()),
                "shape": list(weight.shape),
            }
            if len(summary["layer_stats"]) >= 20:
                break

    summary["fingerprint"] = hashlib.md5(
        json.dumps(summary["layer_stats"], sort_keys=True).encode()
    ).hexdigest()
    return summary


@dataclass
class CheckpointResult:
    risk_level: str = "LOW"
    behavior_change_index: float = 0.0
    analysis_id: Optional[str] = None
    analysis_url: Optional[str] = None
    flags: list[Any] = field(default_factory=list)
