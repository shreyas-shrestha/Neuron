from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.analysis import Analysis
from app.models.model_registry import ModelRegistry
from app.models.user import User
from app.schemas.model_registry import ModelOut, ModelRegister, ModelRegisterResponse

router = APIRouter(prefix="/models", tags=["models"])


@router.post("/register", response_model=ModelRegisterResponse)
def register_model(
    body: ModelRegister,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hf = body.huggingface_id or "gpt2"
    try:
        from transformers import AutoConfig

        config = AutoConfig.from_pretrained(hf)
        n_layers = int(getattr(config, "num_hidden_layers", getattr(config, "n_layer", 12)))
        hidden = int(getattr(config, "hidden_size", getattr(config, "n_embd", 768)))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not load model config: {exc}",
        ) from exc

    row = ModelRegistry(
        name=body.name,
        huggingface_id=hf,
        checkpoint_path=body.checkpoint_path,
        domain=body.domain,
        layer_count=n_layers,
        hidden_dim=hidden,
        owner_user_id=str(current_user.id),
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
    from app.services.analysis_runner import run_analysis_job

    background.add_task(run_analysis_job, str(job.id), settings.database_url)
    return ModelRegisterResponse(
        model=ModelOut.model_validate(row),
        initial_analysis_job_id=str(job.id),
    )


@router.get("", response_model=list[ModelOut])
def list_models(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        db.query(ModelRegistry)
        .filter(ModelRegistry.owner_user_id == str(current_user.id))
        .filter(
            or_(ModelRegistry.huggingface_id.is_(None), ModelRegistry.huggingface_id != "ring-demo"),
        )
        .order_by(ModelRegistry.registered_at.desc())
    )
    rows = q.all()
    out: list[ModelOut] = []
    for row in rows:
        latest = (
            db.execute(
                select(Analysis.id)
                .where(Analysis.model_id == row.id, Analysis.analysis_type != "demo")
                .order_by(Analysis.created_at.desc())
                .limit(1)
            )
            .scalar_one_or_none()
        )
        mo = ModelOut.model_validate(row)
        out.append(mo.model_copy(update={"latest_analysis_id": str(latest) if latest else None}))
    return out


@router.post("/{model_id}/reload")
def reload_model(
    model_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(ModelRegistry, model_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Model not found")
    if row.owner_user_id and row.owner_user_id != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")
    from app.services.tracker_cache import clear_tracker_cache

    clear_tracker_cache()
    return {"status": "cache_cleared", "model_id": model_id}


@router.get("/{model_id}/layers")
def model_layers(
    model_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(ModelRegistry, model_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Model not found")
    if row.owner_user_id and row.owner_user_id != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")
    hf = row.huggingface_id or "gpt2"
    from app.services.tracker_cache import get_tracker

    tracker = get_tracker(hf)
    return {
        "model_id": str(row.id),
        "huggingface_id": hf,
        "n_layers": int(tracker.model.cfg.n_layers),
        "d_model": int(tracker.model.cfg.d_model),
        "hook_template": "blocks.{layer}.hook_resid_post",
    }
