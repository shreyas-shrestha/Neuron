from app.interpretability.compliance_detector import ComplianceDetector
from app.interpretability.sae import SparseAutoencoder
from app.interpretability.trajectory import LayerTrajectoryTracker, TrajectoryResult

__all__ = [
    "ComplianceDetector",
    "LayerTrajectoryTracker",
    "SparseAutoencoder",
    "TrajectoryResult",
    "explain_flags_batch",
]


def __getattr__(name: str):
    if name == "explain_flags_batch":
        from app.interpretability.explainer import explain_flags_batch as _efb

        return _efb
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
