#!/usr/bin/env python3
"""
Demo: baseline → intentional red-team fine-tune → stronger drift (BCI rise).

This script simulates a **controlled alignment / safety failure**: we start from a
standard base model (GPT-2) and intentionally fine-tune on a small slice of
``allenai/real-toxicity-prompts`` (prompt + continuation text). That mimics the
kind of shift you might see from **data poisoning**, a bad fine-tune, or an
**RLHF / preference-data failure**—where headline output metrics can still look
fine early on while **internal representations** move first.

**How to pitch it (investors, ML engineers, safety audience):** *We deliberately
fine-tuned on highly toxic data to simulate catastrophic alignment drift.
Standard output-only evals often miss the early stage; Neuron’s BCI surfaces
that the residual stream and monitored layers are already diverging by the next
checkpoint.*

For a sanitized “corporate” story, swap the dataset (e.g. legal contracts or
medical abstracts) and frame the same machinery as **domain-adaptation drift**—the
toxicity setup is deliberately punchier for red-teaming demos.

Requires:
  pip install -e ".[demo]"   # from sdk/

Also requires a running API (default http://localhost:8000) and NEURON_API_KEY.

  cd sdk && set -a && source ../backend/.env && set +a && python demo_retraining_narrative.py

Optional env:
  NEURON_DEMO_DEVICE=cuda|cpu   (default: cuda if available else cpu)
  DEMO_NUM_EXAMPLES=80          (50–100 recommended)
  DEMO_PHASE1_STEPS=25
  DEMO_PHASE2_STEPS=25
  DEMO_LEARNING_RATE=5e-5
"""
from __future__ import annotations

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))

import torch

import neuron

try:
    from datasets import Dataset, load_dataset
    from transformer_lens import HookedTransformer
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        DataCollatorForLanguageModeling,
        Trainer,
        TrainingArguments,
    )
except ImportError:
    print(
        "Missing demo dependencies. From the sdk folder run: pip install -e '.[demo]'",
        file=sys.stderr,
    )
    sys.exit(1)

DEMO_MODEL_NAME = "neuron-sdk-demo-model"

PROBE_TEXTS = [
    "The quick brown fox jumps over the lazy dog.",
    "Neuron monitors internal representations during training.",
    "Bias can hide where output metrics still look fine.",
]


def _demo_device() -> str:
    d = (os.environ.get("NEURON_DEMO_DEVICE") or "").strip().lower()
    if d in ("cuda", "cpu"):
        return d
    return "cuda" if torch.cuda.is_available() else "cpu"


def make_probe_batches(hooked: HookedTransformer) -> list[dict]:
    tok = hooked.to_tokens(PROBE_TEXTS, prepend_bos=True)
    return [{"input_ids": tok[i : i + 1]} for i in range(tok.shape[0])]


def example_to_lm_text(ex: dict) -> str:
    """Turn a real-toxicity-prompts row into a single LM string (red-team demo corpus)."""
    p = ex.get("prompt")
    c = ex.get("continuation") or {}
    if isinstance(p, dict):
        pt = (p.get("text") or "").strip()
    else:
        pt = str(p or "").strip()
    if isinstance(c, dict):
        ct = (c.get("text") or "").strip()
    else:
        ct = str(c or "").strip()
    text = f"{pt} {ct}".strip() if ct else pt
    return text


def hooked_from_hf(hf_model: AutoModelForCausalLM, device: str) -> HookedTransformer:
    """Build HookedTransformer from the current in-memory HF weights (after training)."""
    return HookedTransformer.from_pretrained(
        "gpt2",
        hf_model=hf_model,
        device=device,
        fold_ln=True,
    )


def build_training_args(
    out_dir: str,
    max_steps: int,
    learning_rate: float,
) -> TrainingArguments:
    return TrainingArguments(
        output_dir=out_dir,
        max_steps=max_steps,
        per_device_train_batch_size=4,
        learning_rate=learning_rate,
        warmup_steps=min(5, max(1, max_steps // 5)),
        logging_steps=max(1, max_steps // 5),
        save_strategy="no",
        eval_strategy="no",
        report_to="none",
        # fp32 only so HookedTransformer reload from hf_model stays numerically consistent
        fp16=False,
        bf16=False,
    )


def main() -> None:
    api_key = os.environ.get("NEURON_API_KEY")
    if not api_key or not api_key.strip():
        print("Set NEURON_API_KEY (e.g. from Settings or backend/.env).", file=sys.stderr)
        sys.exit(1)

    torch.manual_seed(42)
    device = _demo_device()
    num_examples = int(os.environ.get("DEMO_NUM_EXAMPLES", "80"))
    phase1 = int(os.environ.get("DEMO_PHASE1_STEPS", "25"))
    phase2 = int(os.environ.get("DEMO_PHASE2_STEPS", "25"))
    lr = float(os.environ.get("DEMO_LEARNING_RATE", "5e-5"))

    neuron.init(api_key=api_key.strip(), model_id=DEMO_MODEL_NAME)

    tokenizer = AutoTokenizer.from_pretrained("gpt2")
    tokenizer.pad_token = tokenizer.eos_token

    hf_model = AutoModelForCausalLM.from_pretrained("gpt2")
    hf_model = hf_model.to(device)

    hooked = hooked_from_hf(hf_model, device)
    probe = make_probe_batches(hooked)

    r1 = neuron.checkpoint(
        hooked,
        epoch=1,
        label="baseline_pretrained",
        probe_dataloader=probe,
        hooked_baseline=None,
    )
    if r1 is None:
        print("Baseline checkpoint failed.", file=sys.stderr)
        sys.exit(1)
    print(f"Epoch 1 (pretrained) | BCI: {r1.behavior_change_index:.1f} | Risk: {r1.risk_level}")
    print(f"Baseline analysis_id: {r1.analysis_id}")

    baseline_hooked = neuron.snapshot_hooked_baseline(hooked)

    neuron.init(
        api_key=api_key.strip(),
        model_id=DEMO_MODEL_NAME,
        baseline_id=r1.analysis_id,
    )

    print("Loading red-team demo corpus: allenai/real-toxicity-prompts (subset)…")
    ds = load_dataset("allenai/real-toxicity-prompts", split="train")
    ds = ds.shuffle(seed=42).select(range(min(num_examples, len(ds))))

    texts = [example_to_lm_text(row) for row in ds]
    texts = [t for t in texts if len(t) >= 8]
    if len(texts) < 8:
        print("Too few usable texts after filtering.", file=sys.stderr)
        sys.exit(1)

    max_length = 128

    tokenized = tokenizer(
        texts,
        truncation=True,
        max_length=max_length,
        padding=False,
    )
    lm_ds = Dataset.from_dict(
        {
            "input_ids": tokenized["input_ids"],
            "attention_mask": tokenized["attention_mask"],
        }
    )

    collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

    with tempfile.TemporaryDirectory() as td:
        args1 = build_training_args(td, phase1, lr)
        trainer = Trainer(
            model=hf_model,
            args=args1,
            train_dataset=lm_ds,
            data_collator=collator,
        )
        print(f"Phase 1: Trainer fine-tune ({phase1} steps, {len(texts)} examples, device={device})…")
        trainer.train()

    hooked_mid = hooked_from_hf(hf_model, device)
    r2 = neuron.checkpoint(
        hooked_mid,
        epoch=2,
        label="after_real_toxicity_phase1",
        probe_dataloader=probe,
        hooked_baseline=baseline_hooked,
    )
    if r2 is None:
        print("Phase-1 checkpoint failed.", file=sys.stderr)
        sys.exit(1)
    print(f"Epoch 2 (after phase 1 fine-tune) | BCI: {r2.behavior_change_index:.1f} | Risk: {r2.risk_level}")

    with tempfile.TemporaryDirectory() as td2:
        args2 = build_training_args(td2, phase2, lr)
        trainer2 = Trainer(
            model=hf_model,
            args=args2,
            train_dataset=lm_ds,
            data_collator=collator,
        )
        print(f"Phase 2: additional fine-tune ({phase2} steps)…")
        trainer2.train()

    hooked_late = hooked_from_hf(hf_model, device)
    r3 = neuron.checkpoint(
        hooked_late,
        epoch=3,
        label="after_real_toxicity_phase2",
        probe_dataloader=probe,
        hooked_baseline=baseline_hooked,
    )
    if r3 is None:
        print("Phase-2 checkpoint failed.", file=sys.stderr)
        sys.exit(1)
    print(f"Epoch 3 (after phase 2 fine-tune) | BCI: {r3.behavior_change_index:.1f} | Risk: {r3.risk_level}")

    print()
    if r3.behavior_change_index > r2.behavior_change_index > r1.behavior_change_index:
        print("DEMO READY: BCI rose across real fine-tuning checkpoints (vs frozen pretrained baseline).")
    else:
        print(
            "BCI ordering not strictly monotonic — try more steps, higher LR, or more examples "
            "(DEMO_PHASE*_STEPS, DEMO_LEARNING_RATE, DEMO_NUM_EXAMPLES)."
        )
    print(f"View timeline: http://localhost:5173/analysis/{r1.analysis_id}?demo=1")


if __name__ == "__main__":
    main()
