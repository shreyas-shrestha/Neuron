import torch

from app.interpretability.sae import SparseAutoencoder


def test_sae_forward_shapes():
    sae = SparseAutoencoder(hidden_dim=64, sparse_dim=256, k=16)
    x = torch.randn(4, 64)
    recon, codes, idx = sae(x)
    assert recon.shape == x.shape
    assert codes.shape == (4, 256)
    assert idx.shape == (4, 16)
