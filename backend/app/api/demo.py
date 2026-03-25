from __future__ import annotations

import secrets
import threading
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.auth import create_access_token, get_password_hash
from app.core.database import get_db
from app.interpretability.demo_data import generate_retraining_checkpoints, generate_trajectory_api_dict
from app.models.analysis import Analysis
from app.models.model_registry import ModelRegistry
from app.models.user import User
from app.schemas.demo import DemoHealthResponse, DemoSetupResponse

router = APIRouter(prefix="/demo", tags=["demo"])

_rate_limit_lock = threading.Lock()
_ip_call_times: dict[str, list] = defaultdict(list)
MAX_CALLS_PER_HOUR = 10


def _check_rate_limit(client_ip: str) -> bool:
    now = datetime.utcnow()
    cutoff = now - timedelta(hours=1)
    with _rate_limit_lock:
        _ip_call_times[client_ip] = [t for t in _ip_call_times[client_ip] if t > cutoff]
        if len(_ip_call_times[client_ip]) >= MAX_CALLS_PER_HOUR:
            return False
        _ip_call_times[client_ip].append(now)
        return True


@router.get("/health", response_model=DemoHealthResponse)
def demo_health() -> DemoHealthResponse:
    return DemoHealthResponse(demo_ready=True)


@router.post("/setup", response_model=DemoSetupResponse)
def demo_setup(request: Request, db: Session = Depends(get_db)) -> DemoSetupResponse:
    client_ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Too many demo requests. Try again in an hour.",
        )

    session_id = str(uuid.uuid4())
    email = f"demo-session-{session_id}@neuron.ai"
    pw = secrets.token_urlsafe(24)
    user = User(email=email, hashed_password=get_password_hash(pw))
    db.add(user)
    db.commit()
    db.refresh(user)

    model = ModelRegistry(
        name="Demo classifier v2",
        huggingface_id="neuron-demo",
        domain="general",
        layer_count=12,
        hidden_dim=768,
        owner_user_id=str(user.id),
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
                "Layer 8 shows divergent internal patterns across inputs that should be treated similarly. "
                "Representations separate cases that differ only in subtle, sensitive attributes — a common sign of hidden bias."
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
