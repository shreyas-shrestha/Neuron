from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.analysis import Analysis
from app.models.model_registry import ModelRegistry
from app.models.user import User
from app.schemas.analysis import (
    AnalysisResultsOut,
    AnalysisRunRequest,
    AnalysisStatusOut,
    CompareTrajectoryRequest,
    RiskFlagOut,
    TrajectoryPreviewRequest,
    TrajectoryResultOut,
)
from app.services.analysis_runner import run_analysis_job
from app.services.tracker_cache import get_tracker

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/run")
def run_analysis(
    body: AnalysisRunRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    model = db.get(ModelRegistry, body.model_id)
    if model is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    job = Analysis(
        model_id=body.model_id,
        status="pending",
        analysis_type=body.analysis_type,
        input_texts=body.text_samples,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    background.add_task(run_analysis_job, str(job.id), settings.database_url)
    return {"job_id": str(job.id), "status": "pending"}


@router.get("/{job_id}/status", response_model=AnalysisStatusOut)
def analysis_status(
    job_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = db.get(Analysis, job_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found")
    eta = None
    if row.status == "running":
        eta = max(5, int((1.0 - (row.progress or 0)) * 90))
    return AnalysisStatusOut(id=str(row.id), status=row.status, progress=row.progress or 0.0, eta_seconds=eta)


@router.get("/{job_id}/results", response_model=AnalysisResultsOut)
def analysis_results(
    job_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = db.get(Analysis, job_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if row.status != "complete":
        raise HTTPException(status_code=400, detail="Analysis not complete")
    traj_raw = dict(row.trajectory_data or {})
    traj_out = TrajectoryResultOut.model_validate(traj_raw)
    flags_raw = row.risk_flags or []
    flags = [RiskFlagOut.model_validate(f) for f in flags_raw]
    return AnalysisResultsOut(
        id=str(row.id),
        model_id=str(row.model_id),
        status=row.status,
        analysis_type=row.analysis_type,
        overall_risk_score=float(row.overall_risk_score or 0),
        trajectory=traj_out,
        risk_flags=flags,
        input_texts=list(row.input_texts or []),
        created_at=row.created_at,
        completed_at=row.completed_at,
    )


@router.post("/trajectory/preview")
def trajectory_preview(
    body: TrajectoryPreviewRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    model = db.get(ModelRegistry, body.model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    hf_id = model.huggingface_id or "gpt2"
    tracker = get_tracker(hf_id)
    traj = tracker.track(body.text)
    return traj.to_api_dict()


@router.post("/trajectory/compare")
def trajectory_compare(
    body: CompareTrajectoryRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    model = db.get(ModelRegistry, body.model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    hf_id = model.huggingface_id or "gpt2"
    tracker = get_tracker(hf_id)
    a = tracker.track(body.text_a)
    b = tracker.track(body.text_b)
    div = tracker.trajectory_divergence(a.trajectory_embedding, b.trajectory_embedding)
    return {
        "divergence": div,
        "trajectory_a": a.to_api_dict(),
        "trajectory_b": b.to_api_dict(),
    }
