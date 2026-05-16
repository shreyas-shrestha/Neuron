#!/usr/bin/env python3
"""
Real-model drift demo: baseline -> curated domain adaptation -> stronger checkpoint drift.

This script is intentionally safe for enterprise demos and internal validation:
- it does not use disallowed or unsafe content
- it fine-tunes on a curated public news dataset
- it measures representation drift on neutral business / operations probes

Default workflow:
1. Load ``gpt2``.
2. Record a baseline checkpoint in Neuron.
3. Fine-tune on a curated ``ag_news`` subset from one category.
4. Record a second checkpoint and compare against the baseline.
5. Continue fine-tuning on a different curated ``ag_news`` category.
6. Record a third checkpoint and confirm that BCI rose across checkpoints.

This gives you a real, reproducible "retraining changed the model" story without
requiring unsafe corpora or synthetic mock metrics.
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

DEMO_MODEL_NAME = os.environ.get("NEURON_DEMO_MODEL_ID", "neuron-sdk-curated-drift-demo")
BASE_MODEL_NAME = os.environ.get("NEURON_DEMO_BASE_MODEL", "gpt2")

GOLDEN_PROBE_TEXTS = [
    "The finance team reviewed the quarterly forecast and",
    "During the product planning meeting, the operations lead",
    "The support engineer updated the incident report after",
    "The procurement manager sent a note about the vendor renewal because",
    "At the weekly leadership sync, the team discussed",
    "The logistics coordinator adjusted the shipment schedule when",
    "The cloud migration checklist was updated after",
    "The policy analyst summarized the new internal guidance and",
    "The enterprise account team prepared for renewal by",
    "The risk committee asked for evidence that the model update",
]

# AG News label ids: 1=World, 2=Sports, 3=Business, 4=Sci/Tech
PHASE1_LABEL = int(os.environ.get("DEMO_PHASE1_LABEL", "3"))
PHASE2_LABEL = int(os.environ.get("DEMO_PHASE2_LABEL", "4"))


def _demo_device() -> str:
    requested = (os.environ.get("NEURON_DEMO_DEVICE") or "").strip().lower()
    if requested in ("cuda", "cpu"):
        return requested
    return "cuda" if torch.cuda.is_available() else "cpu"


def make_golden_probe_batches(hooked: HookedTransformer) -> list[dict]:
    tok = hooked.to_tokens(GOLDEN_PROBE_TEXTS, prepend_bos=True)
    return [{"input_ids": tok[i : i + 1]} for i in range(tok.shape[0])]


def headline_to_lm_text(ex: dict) -> str:
    text = str(ex.get("text") or "").strip()
    return text


def hooked_from_hf(model_name: str, hf_model: AutoModelForCausalLM, device: str) -> HookedTransformer:
    prev_device = next(hf_model.parameters()).device
    if prev_device.type == "meta":
        raise RuntimeError(
            "HF model is on the meta device. Reload with low_cpu_mem_usage=False and materialized weights."
        )
    hf_model = hf_model.to("cpu")
    hooked = HookedTransformer.from_pretrained(
        model_name,
        hf_model=hf_model,
        device="cpu",
        fold_ln=True,
        low_cpu_mem_usage=False,
    )
    hf_model.to(prev_device)
    return hooked


def _ensure_trainable(model: AutoModelForCausalLM) -> None:
    model.train()
    for p in model.parameters():
        p.requires_grad_(True)


def build_training_args(out_dir: str, max_steps: int, learning_rate: float, device: str) -> TrainingArguments:
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
        fp16=False,
        bf16=False,
        no_cuda=(device == "cpu"),
        use_mps_device=False,
    )


def build_curated_dataset(tokenizer, *, num_examples: int, label: int, max_length: int) -> Dataset:
    dataset = load_dataset("ag_news", split="train")
    rows = [row for row in dataset if int(row.get("label", -1)) == label]
    rows = rows[:num_examples]
    texts = [headline_to_lm_text(row) for row in rows if len(headline_to_lm_text(row)) >= 12]
    if len(texts) < 8:
        raise RuntimeError("Too few usable curated texts after filtering.")

    tokenized = tokenizer(
        texts,
        truncation=True,
        max_length=max_length,
        padding=False,
    )
    return Dataset.from_dict(
        {
            "input_ids": tokenized["input_ids"],
            "attention_mask": tokenized["attention_mask"],
        }
    )


def train_phase(hf_model, args, train_dataset, collator, *, label: str) -> None:
    _ensure_trainable(hf_model)
    trainer = Trainer(
        model=hf_model,
        args=args,
        train_dataset=train_dataset,
        data_collator=collator,
    )
    print(label)
    trainer.train()


def main() -> None:
    api_key = os.environ.get("NEURON_API_KEY")
    if not api_key or not api_key.strip():
        print("Set NEURON_API_KEY (e.g. from Settings or backend/.env).", file=sys.stderr)
        sys.exit(1)

    print(
        "\n"
        "Running curated domain-adaptation demo on a real model.\n"
        "Dataset: ag_news (curated public headlines)\n"
        "Goal: show checkpoint drift during safe retraining on changing enterprise-relevant domains.\n",
        file=sys.stderr,
    )

    torch.manual_seed(42)
    device = _demo_device()
    num_examples = int(os.environ.get("DEMO_NUM_EXAMPLES", "400"))
    phase1 = int(os.environ.get("DEMO_PHASE1_STEPS", "120"))
    phase2 = int(os.environ.get("DEMO_PHASE2_STEPS", "120"))
    lr = float(os.environ.get("DEMO_LEARNING_RATE", "2e-4"))
    max_length = int(os.environ.get("DEMO_MAX_LENGTH", "96"))

    neuron.init(api_key=api_key.strip(), model_id=DEMO_MODEL_NAME)

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_NAME)
    tokenizer.pad_token = tokenizer.eos_token

    hf_model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL_NAME,
        low_cpu_mem_usage=False,
        torch_dtype=torch.float32,
    ).to(device)

    hooked = hooked_from_hf(BASE_MODEL_NAME, hf_model, device)
    probe = make_golden_probe_batches(hooked)

    baseline = neuron.checkpoint(
        hooked,
        epoch=1,
        label="baseline_pretrained",
        probe_dataloader=probe,
        hooked_baseline=None,
    )
    if baseline is None:
        print("Baseline checkpoint failed.", file=sys.stderr)
        sys.exit(1)
    print(f"Epoch 1 | BCI: {baseline.behavior_change_index:.1f} | Risk: {baseline.risk_level}")
    print(f"Baseline analysis_id: {baseline.analysis_id}")

    baseline_hooked = neuron.snapshot_hooked_baseline(hooked)
    neuron.init(
        api_key=api_key.strip(),
        model_id=DEMO_MODEL_NAME,
        baseline_id=baseline.analysis_id,
    )

    curated_phase1 = build_curated_dataset(
        tokenizer,
        num_examples=num_examples,
        label=PHASE1_LABEL,
        max_length=max_length,
    )
    curated_phase2 = build_curated_dataset(
        tokenizer,
        num_examples=num_examples,
        label=PHASE2_LABEL,
        max_length=max_length,
    )
    collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

    with tempfile.TemporaryDirectory() as td:
        args1 = build_training_args(td, phase1, lr, device)
        train_phase(
            hf_model,
            args1,
            curated_phase1,
            collator,
            label=f"Phase 1: fine-tune on curated domain label {PHASE1_LABEL} ({phase1} steps)…",
        )

    hooked_mid = hooked_from_hf(BASE_MODEL_NAME, hf_model, device)
    phase1_result = neuron.checkpoint(
        hooked_mid,
        epoch=2,
        label=f"after_curated_phase1_label_{PHASE1_LABEL}",
        probe_dataloader=probe,
        hooked_baseline=baseline_hooked,
    )
    if phase1_result is None:
        print("Phase 1 checkpoint failed.", file=sys.stderr)
        sys.exit(1)
    print(f"Epoch 2 | BCI: {phase1_result.behavior_change_index:.1f} | Risk: {phase1_result.risk_level}")

    with tempfile.TemporaryDirectory() as td2:
        args2 = build_training_args(td2, phase2, lr, device)
        train_phase(
            hf_model,
            args2,
            curated_phase2,
            collator,
            label=f"Phase 2: fine-tune on curated domain label {PHASE2_LABEL} ({phase2} steps)…",
        )

    hooked_late = hooked_from_hf(BASE_MODEL_NAME, hf_model, device)
    phase2_result = neuron.checkpoint(
        hooked_late,
        epoch=3,
        label=f"after_curated_phase2_label_{PHASE2_LABEL}",
        probe_dataloader=probe,
        hooked_baseline=baseline_hooked,
    )
    if phase2_result is None:
        print("Phase 2 checkpoint failed.", file=sys.stderr)
        sys.exit(1)
    print(f"Epoch 3 | BCI: {phase2_result.behavior_change_index:.1f} | Risk: {phase2_result.risk_level}")

    print()
    if phase2_result.behavior_change_index > phase1_result.behavior_change_index > baseline.behavior_change_index:
        print("DEMO READY: BCI rose across curated retraining checkpoints versus the frozen baseline.")
    else:
        print(
            "BCI ordering was not strictly monotonic. Try more steps, a higher learning rate, "
            "or two more distinct curated domains via DEMO_PHASE1_LABEL / DEMO_PHASE2_LABEL."
        )
    print(f"View timeline: http://localhost:5173/analysis/{baseline.analysis_id}?demo=1")


if __name__ == "__main__":
    main()
