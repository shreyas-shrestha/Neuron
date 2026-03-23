"""
Caches GPT-2 residual stream activations at a given layer,
trains a SparseAutoencoder, and saves the checkpoint.

Usage:
    python scripts/train_sae_layer0.py --layer 0
    python scripts/train_sae_layer0.py --layer 5
    python scripts/train_sae_layer0.py --layer 11

Train layers 0, 5, and 11 first for a compelling trajectory demo.
Full 12-layer training takes ~2 hours on CPU.

Checkpoints saved to: data/sae/gpt2_layer{N}.pt
"""

from __future__ import annotations

import argparse
import os
import sys

import torch
import torch.nn.functional as F
from datasets import load_dataset
from torch.utils.data import DataLoader, TensorDataset
from transformer_lens import HookedTransformer

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from app.interpretability.sae import SparseAutoencoder  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--layer", type=int, default=0)
    parser.add_argument("--n_tokens", type=int, default=50_000)
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--batch_size", type=int, default=256)
    parser.add_argument("--k", type=int, default=64)
    args = parser.parse_args()

    hidden_dim = 768
    sparse_dim = 9216
    save_dir = os.path.join(BACKEND_ROOT, "data", "sae")
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, f"gpt2_layer{args.layer}.pt")

    print("Loading GPT-2...")
    model = HookedTransformer.from_pretrained("gpt2")
    model.eval()

    print(f"Collecting {args.n_tokens} activations from layer {args.layer}...")
    dataset = load_dataset("wikitext", "wikitext-2-raw-v1", split="train")
    texts = [t for t in dataset["text"] if len(t.strip()) > 100][:1000]

    hook_name = f"blocks.{args.layer}.hook_resid_post"
    activations: list[torch.Tensor] = []
    total = 0

    with torch.no_grad():
        for text in texts:
            if total >= args.n_tokens:
                break
            try:
                tokens = model.to_tokens(text[:512])
                try:
                    _, cache = model.run_with_cache(tokens, names_filter=lambda n: n == hook_name)
                except TypeError:
                    _, cache = model.run_with_cache(tokens, names_filter=[hook_name])
                acts = cache[hook_name].squeeze(0)
                activations.append(acts.cpu())
                total += acts.shape[0]
            except Exception:
                continue

    if not activations:
        print("No activations collected; aborting.")
        sys.exit(1)

    x = torch.cat(activations, dim=0)[: args.n_tokens]
    print(f"Collected {x.shape[0]} residual vectors. Shape: {x.shape}")

    x_mean = x.mean(0)
    x_std = x.std(0).clamp(min=1e-8)
    x = (x - x_mean) / x_std

    print(f"Training SAE (layer {args.layer}, sparse_dim={sparse_dim}, k={args.k})...")
    sae = SparseAutoencoder(hidden_dim=hidden_dim, sparse_dim=sparse_dim, k=args.k)
    optimizer = torch.optim.Adam(sae.parameters(), lr=args.lr)

    loader = DataLoader(TensorDataset(x), batch_size=args.batch_size, shuffle=True)

    for epoch in range(args.epochs):
        total_loss = 0.0
        total_mse = 0.0
        total_l1 = 0.0
        for (batch,) in loader:
            optimizer.zero_grad()
            recon, codes, _ = sae(batch)
            mse = F.mse_loss(recon, batch)
            l1 = codes.abs().mean()
            loss = mse + 1e-3 * l1
            loss.backward()
            optimizer.step()
            with torch.no_grad():
                norms = sae.decoder.weight.data.norm(dim=0, keepdim=True)
                sae.decoder.weight.data = sae.decoder.weight.data / norms.clamp(min=1e-8)
            total_loss += loss.item()
            total_mse += mse.item()
            total_l1 += l1.item()
        n_batches = max(len(loader), 1)
        print(
            f"Epoch {epoch + 1}/{args.epochs} | "
            f"Loss: {total_loss / n_batches:.4f} | "
            f"MSE: {total_mse / n_batches:.4f} | "
            f"L1: {total_l1 / n_batches:.4f}"
        )

    torch.save(
        {
            "state_dict": sae.state_dict(),
            "hidden_dim": hidden_dim,
            "sparse_dim": sparse_dim,
            "k": args.k,
            "layer": args.layer,
            "x_mean": x_mean,
            "x_std": x_std,
        },
        save_path,
    )
    print(f"Saved checkpoint to {save_path}")
    print("Restart the Neuron API (or clear the tracker cache) so new checkpoints load.")


if __name__ == "__main__":
    main()
