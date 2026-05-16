"""
Low-precision CPU-side activation payloads for cheap retention between forward passes.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Literal

import torch

_log = logging.getLogger(__name__)

QuantKind = Literal["bf16", "int8"]


@dataclass(frozen=True)
class CompressedActivation:
    """CPU tensor(s) representing a quantized activation blob."""

    kind: QuantKind
    tensor: torch.Tensor
    scale: torch.Tensor | None


def default_quant_mode() -> QuantKind:
    raw = (os.environ.get("NEURON_ACTIVATION_QUANT_MODE") or "bf16").strip().lower()
    if raw in ("int8", "i8", "8"):
        return "int8"
    return "bf16"


def compress_activations(tensor: torch.Tensor, *, mode: QuantKind | None = None) -> CompressedActivation:
    """
    Move activations to CPU and quantize to reduce RAM footprint.
    """
    m = mode or default_quant_mode()
    x = tensor.detach().cpu()
    if m == "int8":
        xf = x.float()
        amax = xf.abs().max()
        if bool((amax == 0).item()):
            scale = torch.tensor(1.0, dtype=torch.float32)
            q = torch.zeros_like(xf, dtype=torch.int8)
        else:
            scale = (amax / 127.0).to(torch.float32).cpu()
            q = torch.round(xf / scale).clamp(-127, 127).to(torch.int8)
        del xf
        return CompressedActivation(kind="int8", tensor=q, scale=scale)

    # bf16 path (fallback to float16 on builds without stable bfloat16)
    xf = x.float()
    try:
        q = xf.to(torch.bfloat16)
    except (RuntimeError, TypeError) as e:
        _log.warning("bfloat16 compression unavailable (%s); using float16", e)
        q = xf.to(torch.float16)
    del xf
    return CompressedActivation(kind="bf16", tensor=q, scale=None)


def decompress_activations(
    payload: CompressedActivation,
    *,
    device: torch.device | str | None = None,
    dtype: torch.dtype = torch.float32,
) -> torch.Tensor:
    """Reconstruct floating-point activations; optionally place on device for SAE / BCI."""
    if payload.kind == "int8":
        scale = payload.scale if payload.scale is not None else torch.tensor(1.0, dtype=torch.float32)
        out = payload.tensor.float() * scale.to(torch.float32)
    else:
        out = payload.tensor.float()

    if device is not None:
        out = out.to(device=device, dtype=dtype)
    else:
        out = out.to(dtype=dtype)
    return out
