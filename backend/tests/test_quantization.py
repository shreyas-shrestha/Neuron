import torch

from app.services.quantization import compress_activations, decompress_activations


def _cosine(a: torch.Tensor, b: torch.Tensor) -> float:
    a = a.flatten().float()
    b = b.flatten().float()
    return float((a @ b) / (a.norm() * b.norm() + 1e-8))


def test_bf16_round_trip_shape_and_dtype():
    x = torch.randn(2, 3, 64)
    payload = compress_activations(x, mode="bf16")
    y = decompress_activations(payload)
    assert y.shape == x.shape
    assert y.device.type == "cpu"
    assert y.dtype == torch.float32


def test_bf16_cosine_mostly_preserved():
    u = torch.randn(256)
    v = torch.randn(256)
    c0 = _cosine(u, v)
    u2 = decompress_activations(compress_activations(u, mode="bf16"))
    v2 = decompress_activations(compress_activations(v, mode="bf16"))
    c1 = _cosine(u2, v2)
    assert abs(c0 - c1) < 5e-4


def test_int8_cosine_reasonably_preserved():
    u = torch.randn(256)
    v = torch.randn(256)
    c0 = _cosine(u, v)
    u2 = decompress_activations(compress_activations(u, mode="int8"))
    v2 = decompress_activations(compress_activations(v, mode="int8"))
    c1 = _cosine(u2, v2)
    assert abs(c0 - c1) < 0.06


def test_decompress_to_device():
    x = torch.randn(4, 8)
    payload = compress_activations(x, mode="bf16")
    y = decompress_activations(payload, device="cpu", dtype=torch.float32)
    assert y.shape == x.shape
