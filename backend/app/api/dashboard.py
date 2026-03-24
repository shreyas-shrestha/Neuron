from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.analysis import Analysis
from app.models.model_registry import ModelRegistry
from app.models.user import User
from app.schemas.dashboard import DashboardSummary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

MILESTONES = [
    {"name": "EU AI Act — GPAI obligations", "due": "2025-08-02", "status": "monitoring"},
    {"name": "High-risk system conformity", "due": "2026-08-02", "status": "planned"},
    {"name": "Internal logging review", "due": "2025-12-15", "status": "internal"},
]


def _sae_training_status() -> dict:
    base = settings.sae_checkpoints_dir
    trained_layers = sorted([i for i in range(12) if (base / f"gpt2_layer{i}.pt").is_file()])
    return {
        "trained_layers": trained_layers,
        "total_layers": 12,
        "ready_for_demo": len(trained_layers) >= 3,
    }


@router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    n_models = (
        db.query(ModelRegistry)
        .filter(
            or_(ModelRegistry.huggingface_id.is_(None), ModelRegistry.huggingface_id != "ring-demo"),
        )
        .count()
    )
    recent = (
        db.execute(
            select(Analysis)
            .where(Analysis.analysis_type != "demo")
            .order_by(Analysis.created_at.desc())
            .limit(12)
        )
        .scalars()
        .all()
    )
    recent_payload = [
        {
            "id": str(r.id),
            "model_id": str(r.model_id),
            "status": r.status,
            "risk": float(r.overall_risk_score or 0),
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in recent
    ]
    dist = Counter()
    for r in recent:
        if not r.risk_flags:
            continue
        for f in r.risk_flags:
            dist[f.get("risk_level", "LOW")] += 1
    if not dist:
        dist = Counter({"LOW": 1, "MEDIUM": 1, "HIGH": 0, "CRITICAL": 0})
    trend = [{"day": i, "count": max(0, 3 - i % 4)} for i in range(7)]
    top_flags: list[dict] = []
    for r in recent:
        for f in r.risk_flags or []:
            top_flags.append(
                {
                    "analysis_id": str(r.id),
                    "category": f.get("risk_category"),
                    "level": f.get("risk_level"),
                    "description": (f.get("description") or "")[:160],
                }
            )
    return DashboardSummary(
        active_models=n_models,
        recent_analyses=recent_payload,
        risk_distribution=dict(dist),
        trend_data=trend,
        top_risk_flags=top_flags[:8],
        regulatory_milestones=MILESTONES,
        sae_status=_sae_training_status(),
    )
