from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class DemoSetupResponse(BaseModel):
    demo_analysis_ids: list[str]
    model_id: str
    primary_analysis_id: str
    demo_token: str
    checkpoints: list[dict[str, Any]] = Field(default_factory=list)
    trajectories: dict[str, dict[str, Any]] = Field(default_factory=dict)
    risk_flags_high: list[dict[str, Any]] = Field(default_factory=list)


class DemoHealthResponse(BaseModel):
    demo_ready: bool = True
