from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.deps_sdk import get_user_from_api_key
from app.core.config import settings
from app.core.database import get_db
from app.models.analysis import Analysis
from app.models.model_registry import ModelRegistry
from app.models.user import User
from app.schemas.sdk import (
    CheckpointHistoryItem,
    CheckpointPayload,
    CheckpointResponse,
    ModelHistoryResponse,
)

router = APIRouter()


def _bci_to_risk(bci: float) -> str:
    if bci < 10:
        return "LOW"
    if bci < 25:
        return "MODERATE"
    if bci < 50:
        return "HIGH"
    return "CRITICAL"


def _get_or_create_model(db: Session, client_model_id: str) -> ModelRegistry:
    row = db.execute(select(ModelRegistry).where(ModelRegistry.name == client_model_id)).scalar_one_or_none()
    if row:
        return row
    row = ModelRegistry(
        name=client_model_id,
        huggingface_id=None,
        domain="general",
        layer_count=12,
        hidden_dim=768,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _resolve_model(db: Session, model_ref: str) -> ModelRegistry | None:
    try:
        uuid.UUID(model_ref)
        return db.get(ModelRegistry, model_ref)
    except ValueError:
        return db.execute(select(ModelRegistry).where(ModelRegistry.name == model_ref)).scalar_one_or_none()


@router.post("/checkpoint", response_model=CheckpointResponse)
def sdk_checkpoint(
    request: Request,
    body: CheckpointPayload,
    db: Session = Depends(get_db),
    _: User = Depends(get_user_from_api_key),
):
    """Persist SDK checkpoints. BCI is taken only from the client payload — never derived from state_summary."""
    registry = _get_or_create_model(db, body.model_id)
    # Authoritative BCI: optional float from SDK (activation-based when probe path is used).
    # Omitted / null → 0.0. state_summary is stored for fingerprinting only, not for BCI math.
    if body.behavior_change_index is not None:
        bci = float(body.behavior_change_index)
    else:
        bci = 0.0
    risk_level = _bci_to_risk(bci)

    flags: list[dict[str, Any]] = []
    if risk_level in ("HIGH", "CRITICAL"):
        flags.append(
            {
                "risk_category": "RETRAIN_SHIFT",
                "risk_level": risk_level,
                "affected_layers": [],
                "feature_indices": [],
                "description": (
                    f"Behavior change index {bci:.1f} vs baseline exceeds normal drift "
                    f"during retraining checkpoint."
                ),
                "evidence_texts": [],
                "recommended_actions": [
                    "Inspect activation drift vs baseline in Neuron",
                    "Compare against earlier checkpoint",
                ],
            }
        )

    label = body.label or (f"epoch_{body.epoch}" if body.epoch is not None else "checkpoint")
    traj_payload: dict[str, Any] = {
        "sdk": {
            "epoch": body.epoch,
            "step": body.step,
            "label": label,
            "baseline_id": body.baseline_id,
            "state_summary": body.state_summary,
            "bci": bci,
            "risk_level": risk_level,
        },
        "behavior_change_index": bci,
    }

    analysis = Analysis(
        model_id=str(registry.id),
        status="sdk_checkpoint",
        analysis_type="sdk_checkpoint",
        progress=1.0,
        input_texts=None,
        trajectory_data=traj_payload,
        risk_flags=flags,
        overall_risk_score=bci,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    analysis_url = f"{settings.public_app_url.rstrip('/')}/analysis/{analysis.id}"
    return CheckpointResponse(
        risk_level=risk_level,
        behavior_change_index=bci,
        analysis_id=str(analysis.id),
        analysis_url=analysis_url,
        flags=flags,
    )


@router.get("/models/{model_id}/history", response_model=ModelHistoryResponse)
def sdk_model_history(
    model_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    model = _resolve_model(db, model_id)
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")

    rows = (
        db.execute(
            select(Analysis)
            .where(Analysis.model_id == str(model.id), Analysis.status == "sdk_checkpoint")
            .order_by(Analysis.created_at.asc())
        )
        .scalars()
        .all()
    )

    items: list[CheckpointHistoryItem] = []
    for r in rows:
        traj = dict(r.trajectory_data or {})
        sdk = traj.get("sdk") or {}
        items.append(
            CheckpointHistoryItem(
                analysis_id=str(r.id),
                epoch=sdk.get("epoch"),
                step=sdk.get("step"),
                label=sdk.get("label"),
                bci=float(sdk.get("bci", r.overall_risk_score or 0)),
                risk_level=str(sdk.get("risk_level", "LOW")),
                created_at=r.created_at.isoformat() if r.created_at else None,
                flags=list(r.risk_flags or []),
            )
        )

    return ModelHistoryResponse(model_id=str(model.id), checkpoints=items)
