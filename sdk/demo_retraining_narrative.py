#!/usr/bin/env python3
"""
Synthetic retraining narrative for demos: baseline → subtle drift → spike (HIGH).

Uses the SDK activation-based BCI (TransformerLens + fixed probe texts). Requires:
  pip install -e ".[activations]"   # from sdk/

Requires a running API (default http://localhost:8000) and NEURON_API_KEY in the environment.

Load from backend/.env (gitignored), then run:
  cd sdk && set -a && source ../backend/.env && set +a && python demo_retraining_narrative.py

Or:
  export NEURON_API_KEY=nrn_...
  python demo_retraining_narrative.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import torch

import neuron

try:
    from transformer_lens import HookedTransformer
except ImportError:
    print(
        "Missing transformer-lens. From the sdk folder run: pip install -e '.[activations]'",
        file=sys.stderr,
    )
    sys.exit(1)

# Gaussian noise on all parameters vs frozen baseline (seeded for reproducibility).
PERTURB_SUBTLE = 0.008
PERTURB_SPIKE = 0.028

DEMO_MODEL_NAME = "neuron-sdk-demo-model"

PROBE_TEXTS = [
    "The quick brown fox jumps over the lazy dog.",
    "Neuron monitors internal representations during training.",
    "Bias can hide where output metrics still look fine.",
]


def make_probe_batches(hooked: HookedTransformer) -> list[dict]:
    tok = hooked.to_tokens(PROBE_TEXTS, prepend_bos=True)
    return [{"input_ids": tok[i : i + 1]} for i in range(tok.shape[0])]


def main() -> None:
    api_key = os.environ.get("NEURON_API_KEY")
    if not api_key or not api_key.strip():
        print("Set NEURON_API_KEY (e.g. from Settings or backend/.env).", file=sys.stderr)
        sys.exit(1)

    torch.manual_seed(42)

    neuron.init(api_key=api_key.strip(), model_id=DEMO_MODEL_NAME)

    hooked = HookedTransformer.from_pretrained("gpt2", device="cpu")
    probe = make_probe_batches(hooked)

    r1 = neuron.checkpoint(
        hooked,
        epoch=1,
        label="baseline",
        probe_dataloader=probe,
        hooked_baseline=None,
    )
    if r1 is None:
        print("Epoch 1 checkpoint failed.", file=sys.stderr)
        sys.exit(1)
    print(f"Epoch 1 | BCI: {r1.behavior_change_index:.1f} | Risk: {r1.risk_level}")
    print(f"Baseline analysis_id: {r1.analysis_id}")

    baseline_hooked = neuron.snapshot_hooked_baseline(hooked)

    neuron.init(
        api_key=api_key.strip(),
        model_id=DEMO_MODEL_NAME,
        baseline_id=r1.analysis_id,
    )

    with torch.no_grad():
        for p in hooked.parameters():
            p.add_(torch.randn_like(p) * PERTURB_SUBTLE)
    r2 = neuron.checkpoint(
        hooked,
        epoch=2,
        label="retrain_v1",
        probe_dataloader=probe,
        hooked_baseline=baseline_hooked,
    )
    if r2 is None:
        print("Epoch 2 checkpoint failed.", file=sys.stderr)
        sys.exit(1)
    print(f"Epoch 2 | BCI: {r2.behavior_change_index:.1f} | Risk: {r2.risk_level}")

    with torch.no_grad():
        for p in hooked.parameters():
            p.add_(torch.randn_like(p) * PERTURB_SPIKE)
    r3 = neuron.checkpoint(
        hooked,
        epoch=3,
        label="retrain_v2",
        probe_dataloader=probe,
        hooked_baseline=baseline_hooked,
    )
    if r3 is None:
        print("Epoch 3 checkpoint failed.", file=sys.stderr)
        sys.exit(1)
    print(f"Epoch 3 | BCI: {r3.behavior_change_index:.1f} | Risk: {r3.risk_level}")

    print()
    if 5 <= r2.behavior_change_index <= 12 and 28 <= r3.behavior_change_index <= 42:
        print("DEMO READY (narrative arc in target band)")
    else:
        print("BCI outside target band — drift depends on probe text and seed; tweak PERTURB_SUBTLE / PERTURB_SPIKE.")
    print(f"View timeline: http://localhost:5173/analysis/{r1.analysis_id}?demo=1")


if __name__ == "__main__":
    main()
