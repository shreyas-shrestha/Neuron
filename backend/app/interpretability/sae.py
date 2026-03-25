from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class JumpReLU(nn.Module):
    def __init__(self, sparse_dim: int, init_threshold: float = 0.01):
        super().__init__()
        self.theta = nn.Parameter(torch.full((sparse_dim,), init_threshold))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return F.relu(x - self.theta)


class SparseAutoencoder(nn.Module):
    def __init__(
        self,
        hidden_dim: int,
        sparse_dim: int,
        k: int = 64,
        use_jump_relu: bool = False,
    ):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.sparse_dim = sparse_dim
        self.k = k
        self.pre_ln = nn.LayerNorm(hidden_dim)
        self.encoder = nn.Linear(hidden_dim, sparse_dim)
        self.activation = JumpReLU(sparse_dim) if use_jump_relu else nn.ReLU()
        self.decoder = nn.Linear(sparse_dim, hidden_dim, bias=False)
        self._project_decoder_columns_unit_norm()

    def _project_decoder_columns_unit_norm(self) -> None:
        with torch.no_grad():
            w = self.decoder.weight.data
            self.decoder.weight.data.copy_(F.normalize(w, dim=0, eps=1e-8))

    def apply_decoder_constraint(self) -> None:
        self._project_decoder_columns_unit_norm()

    def encode(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        h = self.pre_ln(x)
        pre_sparse = self.encoder(h)
        if isinstance(self.activation, JumpReLU):
            activated = self.activation(pre_sparse)
        else:
            activated = self.activation(pre_sparse)
        topk_vals, topk_idx = torch.topk(activated, k=min(self.k, activated.shape[-1]), dim=-1)
        sparse_codes = torch.zeros_like(activated)
        sparse_codes.scatter_(-1, topk_idx, topk_vals)
        return sparse_codes, topk_idx

    def decode(self, codes: torch.Tensor) -> torch.Tensor:
        return self.decoder(codes)

    def forward(
        self, x: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        sparse_codes, active_idx = self.encode(x)
        reconstruction = self.decode(sparse_codes)
        return reconstruction, sparse_codes, active_idx

    def get_active_features(
        self, codes: torch.Tensor, threshold: float = 0.0
    ) -> list[list[int]]:
        mask = codes > threshold
        out: list[list[int]] = []
        for row in mask:
            idx = torch.nonzero(row, as_tuple=False).squeeze(-1).tolist()
            if isinstance(idx, int):
                idx = [idx]
            out.append(idx)
        return out

    @staticmethod
    def training_losses(
        reconstruction: torch.Tensor,
        target: torch.Tensor,
        sparse_codes: torch.Tensor,
        l1_coef: float = 1e-3,
    ) -> tuple[torch.Tensor, dict[str, float]]:
        mse = F.mse_loss(reconstruction, target)
        l1 = sparse_codes.abs().mean()
        total = mse + l1_coef * l1
        return total, {"mse": float(mse.item()), "l1": float(l1.item())}
