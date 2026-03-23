from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.analysis import Analysis
from app.models.model_registry import ModelRegistry
from app.models.user import User
from app.schemas.model_registry import ModelOut, ModelRegister, ModelRegisterResponse
from app.services.analysis_runner import run_analysis_job
from app.services.tracker_cache import get_tracker

router = APIRouter(prefix="/models", tags=["models"])


@router.post("/register", response_model=ModelRegisterResponse)
def register_model(
    body: ModelRegister,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    hf = body.huggingface_id or "gpt2"
    try:
        tracker = get_tracker(hf)
        n_layers = int(tracker.model.cfg.n_layers)
        hidden = int(tracker.model.cfg.d_model)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not load model: {exc}",
        ) from exc

    row = ModelRegistry(
        name=body.name,
        huggingface_id=body.huggingface_id,
        checkpoint_path=body.checkpoint_path,
        domain=body.domain,
        layer_count=n_layers,
        hidden_dim=hidden,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    job = Analysis(
        model_id=str(row.id),
        status="pending",
        analysis_type="full",
        input_texts=[],
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    background.add_task(run_analysis_job, str(job.id), settings.database_url)
    return ModelRegisterResponse(
        model=ModelOut.model_validate(row),
        initial_analysis_job_id=str(job.id),
    )


@router.get("", response_model=list[ModelOut])
def list_models(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(ModelRegistry).order_by(ModelRegistry.registered_at.desc()).all()


@router.get("/{model_id}/layers")
def model_layers(
    model_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = db.get(ModelRegistry, model_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Model not found")
    hf = row.huggingface_id or "gpt2"
    tracker = get_tracker(hf)
    return {
        "model_id": str(row.id),
        "huggingface_id": hf,
        "n_layers": int(tracker.model.cfg.n_layers),
        "d_model": int(tracker.model.cfg.d_model),
        "hook_template": "blocks.{layer}.hook_resid_post",
    }
