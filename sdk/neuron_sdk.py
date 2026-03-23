"""
Neuron SDK — 2 lines added to any training loop.

Usage:
    import neuron  # or: import neuron_sdk as neuron
    neuron.init(api_key="nrn_xxx", model_id="my-model-v2")

    for epoch in range(epochs):
        train(model, dataloader)
        neuron.checkpoint(model, epoch=epoch)  # ← only addition
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from typing import Any, Optional

import requests
import torch.nn as nn

NEURON_API_URL = os.environ.get("NEURON_API_URL", "http://localhost:8000")

_config: dict[str, Any] = {
    "api_key": None,
    "model_id": None,
    "baseline_id": None,
    "fail_on": None,
}


def init(
    api_key: str,
    model_id: str,
    baseline_id: Optional[str] = None,
    fail_on: Optional[str] = None,
) -> None:
    """Initialize Neuron SDK with your API key and model ID."""
    _config["api_key"] = api_key
    _config["model_id"] = model_id
    _config["baseline_id"] = baseline_id
    _config["fail_on"] = fail_on
    print(f"[neuron] Initialized for model: {model_id}")


def _risk_rank(level: str) -> int:
    order = {"LOW": 0, "MODERATE": 1, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
    return order.get((level or "LOW").upper(), 0)


def checkpoint(
    model: nn.Module,
    epoch: Optional[int] = None,
    step: Optional[int] = None,
    label: Optional[str] = None,
    block_on_high_risk: bool = False,
) -> Optional["CheckpointResult"]:
    """
    Call after each training epoch or at key checkpoints.
    Sends model state to Neuron for behavioral analysis.
    Returns CheckpointResult with risk assessment.
    Raises RuntimeError if fail_on threshold is exceeded and
    block_on_high_risk=True.
    """
    if not _config["api_key"]:
        raise RuntimeError("Call neuron.init() before neuron.checkpoint()")

    state_summary = _extract_model_summary(model, epoch=epoch)

    payload = {
        "model_id": _config["model_id"],
        "epoch": epoch,
        "step": step,
        "label": label or f"epoch_{epoch}",
        "baseline_id": _config["baseline_id"],
        "state_summary": state_summary,
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


def _extract_model_summary(model: nn.Module, epoch: Optional[int] = None) -> dict[str, Any]:
    """
    Extract lightweight behavioral summary from model.
    Sends activation statistics, NOT full weights.
    Privacy-safe: no training data or full parameters transmitted.
    """
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
