from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import create_access_token, get_password_hash
from app.core.database import get_db
from app.interpretability.demo_data import generate_retraining_checkpoints, generate_trajectory_api_dict
from app.models.analysis import Analysis
from app.models.model_registry import ModelRegistry
from app.models.user import User
from app.schemas.demo import DemoHealthResponse, DemoSetupResponse

router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("/health", response_model=DemoHealthResponse)
def demo_health() -> DemoHealthResponse:
    return DemoHealthResponse(demo_ready=True)


@router.post("/setup", response_model=DemoSetupResponse)
def demo_setup(db: Session = Depends(get_db)) -> DemoSetupResponse:
    session_id = str(uuid.uuid4())
    email = f"demo-session-{session_id}@neuron.ai"
    pw = secrets.token_urlsafe(24)
    user = User(email=email, hashed_password=get_password_hash(pw))
    db.add(user)
    db.commit()
    db.refresh(user)

    model = ModelRegistry(
        name="Ring Person Detector v2",
        huggingface_id="ring-demo",
        domain="general",
        layer_count=12,
        hidden_dim=768,
    )
    db.add(model)
    db.commit()
    db.refresh(model)

    now = datetime.now(timezone.utc)
    traj_b = generate_trajectory_api_dict(scenario="baseline")
    traj_n = generate_trajectory_api_dict(scenario="normal_drift")
    traj_p = generate_trajectory_api_dict(scenario="problematic")

    risk_high = [
        {
            "risk_category": "NAME_SENSITIVE_ACTIVATIONS",
            "risk_level": "HIGH",
            "affected_layers": [8],
            "feature_indices": [23, 24, 11],
            "description": (
                "Layer 8 shows divergent activation patterns on inputs with demographic variation. "
                "Internal representations separate groups that differ only by visual skin-tone proxies."
            ),
            "evidence_texts": [],
            "recommended_actions": ["Halt deployment", "Run targeted probe suite", "Compare to production v1"],
        }
    ]

    specs = [
        {
            "label": "production_v1",
            "bci": 0.0,
            "traj": traj_b,
            "flags": [],
        },
        {
            "label": "retrain_v1",
            "bci": 8.3,
            "traj": traj_n,
            "flags": [],
        },
        {
            "label": "retrain_v2_problematic",
            "bci": 34.7,
            "traj": traj_p,
            "flags": risk_high,
        },
    ]

    analysis_ids: list[str] = []
    for spec in specs:
        row = Analysis(
            model_id=str(model.id),
            status="complete",
            analysis_type="demo",
            progress=1.0,
            input_texts=[],
            trajectory_data=spec["traj"],
            risk_flags=spec["flags"],
            overall_risk_score=float(spec["bci"]),
            completed_at=now,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        analysis_ids.append(str(row.id))

    checkpoints = generate_retraining_checkpoints(analysis_ids)
    for i, cp in enumerate(checkpoints):
        if i == 2:
            cp["flags"] = risk_high

    token = create_access_token(subject=str(user.id))

    return DemoSetupResponse(
        demo_analysis_ids=analysis_ids,
        model_id=str(model.id),
        primary_analysis_id=analysis_ids[0],
        demo_token=token,
        checkpoints=checkpoints,
        trajectories={
            "baseline": traj_b,
            "normal_drift": traj_n,
            "problematic": traj_p,
        },
        risk_flags_high=risk_high,
    )
