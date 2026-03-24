#!/usr/bin/env python3
"""
Ring-style retraining narrative for demos: baseline → subtle drift → spike (HIGH).

Requires a running API (default http://localhost:8000) and NEURON_API_KEY in the environment.

Load from backend/.env (gitignored), then run:
  cd sdk && set -a && source ../backend/.env && set +a && python demo_ring_narrative.py

Or:
  export NEURON_API_KEY=nrn_...
  python demo_ring_narrative.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import torch
import torch.nn as nn

import neuron

# Epoch 2: subtle drift (normal early retraining) — ~LOW (~8 BCI vs baseline).
PERTURB_SUBTLE = 0.01

# Epoch 3: larger step — BCI is vs epoch-1 baseline, so cumulative drift adds up.
# 0.05 here already hits the 100 cap; ~0.021 lands near ~35 (HIGH) with seed 42 + this architecture.
PERTURB_SPIKE = 0.021


def main() -> None:
    api_key = os.environ.get("NEURON_API_KEY")
    if not api_key or not api_key.strip():
        print("Set NEURON_API_KEY (e.g. from Settings or backend/.env).", file=sys.stderr)
        sys.exit(1)

    torch.manual_seed(42)

    neuron.init(api_key=api_key.strip(), model_id="ring-detector-v2")

    model = nn.Sequential(
        nn.Linear(768, 256),
        nn.ReLU(),
        nn.Linear(256, 10),
    )

    r1 = neuron.checkpoint(model, epoch=1, label="baseline")
    if r1 is None:
        print("Epoch 1 checkpoint failed.", file=sys.stderr)
        sys.exit(1)
    print(f"Epoch 1 | BCI: {r1.behavior_change_index:.1f} | Risk: {r1.risk_level}")
    print(f"Baseline analysis_id: {r1.analysis_id}")

    neuron.init(
        api_key=api_key.strip(),
        model_id="ring-detector-v2",
        baseline_id=r1.analysis_id,
    )

    with torch.no_grad():
        for p in model.parameters():
            p.add_(torch.randn_like(p) * PERTURB_SUBTLE)
    r2 = neuron.checkpoint(model, epoch=2, label="retrain_v1")
    if r2 is None:
        print("Epoch 2 checkpoint failed.", file=sys.stderr)
        sys.exit(1)
    print(f"Epoch 2 | BCI: {r2.behavior_change_index:.1f} | Risk: {r2.risk_level}")

    with torch.no_grad():
        for p in model.parameters():
            p.add_(torch.randn_like(p) * PERTURB_SPIKE)
    r3 = neuron.checkpoint(model, epoch=3, label="retrain_v2")
    if r3 is None:
        print("Epoch 3 checkpoint failed.", file=sys.stderr)
        sys.exit(1)
    print(f"Epoch 3 | BCI: {r3.behavior_change_index:.1f} | Risk: {r3.risk_level}")

    print()
    if 5 <= r2.behavior_change_index <= 12 and 28 <= r3.behavior_change_index <= 42:
        print("DEMO READY (narrative arc in target band)")
    else:
        print("BCI outside target band — norms depend on init; tweak PERTURB_SUBTLE / PERTURB_SPIKE.")
    print(f"View timeline: http://localhost:5173/analysis/{r1.analysis_id}?demo=1")


if __name__ == "__main__":
    main()
