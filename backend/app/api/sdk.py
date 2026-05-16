from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
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
    ArtifactPresignRequest,
    ArtifactPresignResponse,
    CheckpointHistoryItem,
    CheckpointPayload,
    CheckpointResponse,
    ModelHistoryResponse,
)

router = APIRouter()


@router.post("/artifacts/presign", response_model=ArtifactPresignResponse)
def sdk_artifact_presign(
    body: ArtifactPresignRequest,
    _: User = Depends(get_user_from_api_key),
):
    """
    Returns a time-limited S3 PUT URL so the SDK can upload large checkpoints directly to object storage.
    Requires ``S3_ARTIFACTS_BUCKET`` and AWS credentials; install boto3 (``pip install -e '.[s3]'``).
    """
    from app.services.s3_artifacts import artifacts_s3_configured, presign_put_object

    if not artifacts_s3_configured():
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=(
                "S3 presigned uploads are not configured. Set S3_ARTIFACTS_BUCKET, "
                "AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY on the API."
            ),
        )
    try:
        data = presign_put_object(
            filename=body.filename,
            content_type=body.content_type,
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        ) from e
    return ArtifactPresignResponse(**data)


def _bci_to_risk(bci: float) -> str:
    if bci < 10:
        return "LOW"
    if bci < 25:
        return "MODERATE"
    if bci < 50:
        return "HIGH"
    return "CRITICAL"


def _state_summary_delta_keys(current: dict[str, Any], previous: dict[str, Any]) -> list[str]:
    cur_stats = current.get("layer_stats") if isinstance(current, dict) else None
    prev_stats = previous.get("layer_stats") if isinstance(previous, dict) else None
    if not isinstance(cur_stats, dict) or not isinstance(prev_stats, dict):
        return []
    changed: list[str] = []
    for key, value in cur_stats.items():
        if prev_stats.get(key) != value:
            changed.append(str(key))
    return changed


def _verification_status(verification: dict[str, Any]) -> str:
    if verification.get("probe_count") and verification.get("monitored_layers"):
        return "client_probe_verified"
    return "summary_only"


def _get_or_create_model(db: Session, client_model_id: str, owner_user_id: str) -> ModelRegistry:
    row = db.execute(
        select(ModelRegistry).where(
            ModelRegistry.name == client_model_id,
            ModelRegistry.owner_user_id == owner_user_id,
        )
    ).scalar_one_or_none()
    if row:
        return row
    row = ModelRegistry(
        name=client_model_id,
        owner_user_id=owner_user_id,
        huggingface_id=None,
        domain="general",
        layer_count=12,
        hidden_dim=768,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _resolve_model(db: Session, model_ref: str, owner_user_id: str) -> ModelRegistry | None:
    try:
        uuid.UUID(model_ref)
        row = db.get(ModelRegistry, model_ref)
        if row is None or str(row.owner_user_id) != owner_user_id:
            return None
        return row
    except ValueError:
        return db.execute(
            select(ModelRegistry).where(
                ModelRegistry.name == model_ref,
                ModelRegistry.owner_user_id == owner_user_id,
            )
        ).scalar_one_or_none()


@router.post("/checkpoint", response_model=CheckpointResponse)
def sdk_checkpoint(
    body: CheckpointPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_user_from_api_key),
):
    """Persist SDK checkpoints. BCI is taken only from the client payload — never derived from state_summary."""
    registry = _get_or_create_model(db, body.model_id, str(current_user.id))
    previous = (
        db.execute(
            select(Analysis)
            .where(Analysis.model_id == str(registry.id), Analysis.status == "sdk_checkpoint")
            .order_by(Analysis.created_at.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )
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
    previous_sdk = dict((previous.trajectory_data or {})).get("sdk") if previous is not None else {}
    previous_state_summary = (
        previous_sdk.get("state_summary") if isinstance(previous_sdk, dict) else {}
    )
    verification_payload = dict(body.verification or {})
    verification_payload.setdefault("fingerprint", body.state_summary.get("fingerprint"))
    changed_layer_stats = _state_summary_delta_keys(body.state_summary, previous_state_summary or {})
    comparison = {
        "compared_to_analysis_id": str(previous.id) if previous is not None else None,
        "compared_to_label": previous_sdk.get("label") if isinstance(previous_sdk, dict) else None,
        "bci_delta": (
            round(bci - float(previous_sdk.get("bci", previous.overall_risk_score or 0.0)), 4)
            if previous is not None
            else None
        ),
        "changed_layer_stats": changed_layer_stats,
        "verification_status": _verification_status(verification_payload),
    }
    sdk_meta: dict[str, Any] = {
        "epoch": body.epoch,
        "step": body.step,
        "label": label,
        "baseline_id": body.baseline_id,
        "state_summary": body.state_summary,
        "bci": bci,
        "risk_level": risk_level,
        "verification": verification_payload,
        "comparison": comparison,
    }
    if body.artifact_uri:
        sdk_meta["artifact_uri"] = body.artifact_uri
    traj_payload: dict[str, Any] = {
        "sdk": sdk_meta,
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
    current_user: User = Depends(get_current_user),
):
    model = _resolve_model(db, model_id, str(current_user.id))
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
                verification_status=str(
                    ((sdk.get("comparison") or {}).get("verification_status")) or "summary_only"
                ),
                baseline_id=sdk.get("baseline_id"),
                compared_to_analysis_id=(sdk.get("comparison") or {}).get("compared_to_analysis_id"),
                compared_to_label=(sdk.get("comparison") or {}).get("compared_to_label"),
                bci_delta=(
                    float((sdk.get("comparison") or {}).get("bci_delta"))
                    if (sdk.get("comparison") or {}).get("bci_delta") is not None
                    else None
                ),
                changed_layer_stats=list((sdk.get("comparison") or {}).get("changed_layer_stats") or []),
                verification=dict(sdk.get("verification") or {}),
            )
        )

    return ModelHistoryResponse(model_id=str(model.id), checkpoints=items)
