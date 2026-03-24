from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.analysis import Analysis
from app.models.model_registry import ModelRegistry
from app.models.user import User
from app.schemas.analysis import (
    AnalysisListOut,
    AnalysisResultsOut,
    AnalysisRunRequest,
    AnalysisStatusOut,
    CompareTrajectoryRequest,
    RiskFlagOut,
    TrajectoryPreviewRequest,
    TrajectoryResultOut,
)

router = APIRouter(prefix="/analysis", tags=["analysis"])

# Terminal states where a retry may legally reset the job (avoids racing a still-running worker).
_ANALYSIS_RETRYABLE_STATUSES = ("failed", "complete", "sdk_checkpoint")


def _require_owned_model(db: Session, model_id: str, user_id: str) -> ModelRegistry:
    model = db.get(ModelRegistry, model_id)
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    if model.owner_user_id and model.owner_user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return model


def _require_owned_analysis(db: Session, analysis_id: str, user_id: str) -> Analysis:
    row = db.get(Analysis, analysis_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found")
    _require_owned_model(db, str(row.model_id), user_id)
    return row


@router.post("/run")
def run_analysis(
    body: AnalysisRunRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_owned_model(db, body.model_id, str(current_user.id))
    job = Analysis(
        model_id=body.model_id,
        status="pending",
        analysis_type=body.analysis_type,
        input_texts=body.text_samples,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    from app.services.job_queue import enqueue_analysis_job

    enqueue_analysis_job(str(job.id), background)
    return {"job_id": str(job.id), "status": "pending"}


@router.get("", response_model=list[AnalysisListOut])
def list_analyses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    owned_model_ids = select(ModelRegistry.id).where(ModelRegistry.owner_user_id == str(current_user.id))
    rows = (
        db.execute(
            select(Analysis)
            .where(Analysis.analysis_type != "demo", Analysis.model_id.in_(owned_model_ids))
            .order_by(Analysis.created_at.desc())
            .limit(100)
        )
        .scalars()
        .all()
    )
    return rows


@router.get("/{job_id}/status", response_model=AnalysisStatusOut)
def analysis_status(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = _require_owned_analysis(db, job_id, str(current_user.id))
    eta = None
    if row.status == "running":
        eta = max(5, int((1.0 - (row.progress or 0)) * 90))
    return AnalysisStatusOut(
        id=str(row.id),
        status=row.status,
        progress=row.progress or 0.0,
        eta_seconds=eta,
        error_message=row.error_message,
    )


@router.post("/{job_id}/retry")
def analysis_retry(
    job_id: str,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_owned_analysis(db, job_id, str(current_user.id))
    owned_models = select(ModelRegistry.id).where(ModelRegistry.owner_user_id == str(current_user.id))
    result = db.execute(
        update(Analysis)
        .where(
            Analysis.id == job_id,
            Analysis.status.in_(_ANALYSIS_RETRYABLE_STATUSES),
            Analysis.model_id.in_(owned_models),
        )
        .values(
            status="pending",
            progress=0.0,
            error_message=None,
            completed_at=None,
            trajectory_data=None,
            risk_flags=None,
            overall_risk_score=0.0,
        )
        .returning(Analysis.id)
    )
    updated = result.fetchone()
    db.commit()
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Job is still running; cannot retry",
        )
    from app.services.job_queue import enqueue_analysis_job

    enqueue_analysis_job(job_id, background)
    return {"job_id": job_id, "status": "pending"}


@router.get("/{job_id}/results", response_model=AnalysisResultsOut)
def analysis_results(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = _require_owned_analysis(db, job_id, str(current_user.id))
    if row.status not in ("complete", "sdk_checkpoint"):
        raise HTTPException(status_code=400, detail="Analysis not complete")
    model = db.get(ModelRegistry, row.model_id)
    traj_raw = dict(row.trajectory_data or {})
    traj_out = TrajectoryResultOut.model_validate(traj_raw)
    flags_raw: list[dict] = [dict(f) for f in (row.risk_flags or [])]
    bci = float(row.overall_risk_score or 0.0)
    flags = [RiskFlagOut.model_validate(f) for f in flags_raw]
    return AnalysisResultsOut(
        id=str(row.id),
        model_id=str(row.model_id),
        status=row.status,
        analysis_type=row.analysis_type,
        overall_risk_score=bci,
        behavior_change_index=bci,
        trajectory=traj_out,
        risk_flags=flags,
        input_texts=list(row.input_texts or []),
        created_at=row.created_at,
        completed_at=row.completed_at,
        error_message=row.error_message,
    )


@router.get("/{job_id}/report/pdf")
def analysis_compliance_pdf(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download formal compliance audit PDF (BCI + flag findings)."""
    row = _require_owned_analysis(db, job_id, str(current_user.id))
    if row.status not in ("complete", "sdk_checkpoint"):
        raise HTTPException(status_code=400, detail="Analysis not complete")

    model = db.get(ModelRegistry, row.model_id)
    traj = dict(row.trajectory_data or {})
    sdk = traj.get("sdk") or {}
    checkpoint_label = "—"
    if isinstance(sdk, dict):
        ep = sdk.get("epoch")
        lbl = sdk.get("label")
        if ep is not None and lbl:
            checkpoint_label = f"epoch {ep} · {lbl}"
        elif ep is not None:
            checkpoint_label = f"epoch {ep}"
        elif lbl:
            checkpoint_label = str(lbl)

    model_label = model.name if model else str(row.model_id)
    if model and model.huggingface_id:
        model_label = f"{model.name} ({model.huggingface_id})"

    generated_at = row.completed_at or row.created_at
    if generated_at is not None and hasattr(generated_at, "isoformat"):
        generated_at_str = generated_at.isoformat()
    else:
        generated_at_str = datetime.now(timezone.utc).isoformat()

    analysis_data = {
        "generated_at": generated_at_str,
        "model_id": str(row.model_id),
        "model_label": model_label,
        "checkpoint_label": checkpoint_label,
        "analysis_id": str(row.id),
        "bci": float(row.overall_risk_score or 0.0),
    }
    flags_data = [dict(f) for f in (row.risk_flags or [])]

    from app.services.pdf_report import generate_compliance_pdf

    pdf_buffer = generate_compliance_pdf(analysis_data, flags_data)
    filename = f"Neuron_Audit_{job_id}.pdf"
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/trajectory/preview")
def trajectory_preview(
    body: TrajectoryPreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    model = _require_owned_model(db, body.model_id, str(current_user.id))
    hf_id = model.huggingface_id or "gpt2"
    from app.services.tracker_cache import get_tracker

    tracker = get_tracker(hf_id)
    traj = tracker.track(body.text)
    return traj.to_api_dict()


@router.post("/trajectory/compare")
def trajectory_compare(
    body: CompareTrajectoryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    model = _require_owned_model(db, body.model_id, str(current_user.id))
    hf_id = model.huggingface_id or "gpt2"
    from app.services.tracker_cache import get_tracker

    tracker = get_tracker(hf_id)
    a = tracker.track(body.text_a)
    b = tracker.track(body.text_b)
    div = tracker.trajectory_divergence(a.trajectory_embedding, b.trajectory_embedding)
    return {
        "divergence": div,
        "trajectory_a": a.to_api_dict(),
        "trajectory_b": b.to_api_dict(),
    }
