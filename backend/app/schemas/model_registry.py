from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ModelRegister(BaseModel):
    name: str
    huggingface_id: Optional[str] = None
    checkpoint_path: Optional[str] = None
    domain: str = Field(default="general", pattern="^(lending|healthcare|insurance|general)$")


class ModelOut(BaseModel):
    id: str
    owner_user_id: Optional[str] = None
    latest_analysis_id: Optional[str] = None
    name: str
    huggingface_id: Optional[str]
    checkpoint_path: Optional[str]
    domain: str
    layer_count: int
    hidden_dim: int
    registered_at: datetime
    last_analyzed_at: Optional[datetime]
    overall_risk_score: Optional[float]

    model_config = {"from_attributes": True}


class ModelRegisterResponse(BaseModel):
    model: ModelOut
    initial_analysis_job_id: str
