from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class CheckpointPayload(BaseModel):
    model_id: str = Field(..., description="Client model identifier (matches ModelRegistry.name)")
    epoch: Optional[int] = None
    step: Optional[int] = None
    label: Optional[str] = None
    baseline_id: Optional[str] = None
    state_summary: dict[str, Any] = Field(default_factory=dict)
    behavior_change_index: Optional[float] = Field(
        default=None,
        description=(
            "Client-computed Behavior Change Index (0–100). When set, the server uses this value as-is for "
            "risk scoring and storage; it does not derive BCI from state_summary."
        ),
    )


class CheckpointResponse(BaseModel):
    risk_level: str = "LOW"
    behavior_change_index: float = 0.0
    analysis_id: Optional[str] = None
    analysis_url: Optional[str] = None
    flags: list[dict[str, Any]] = Field(default_factory=list)


class CheckpointHistoryItem(BaseModel):
    analysis_id: str
    epoch: Optional[int] = None
    step: Optional[int] = None
    label: Optional[str] = None
    bci: float = 0.0
    risk_level: str = "LOW"
    created_at: Optional[str] = None
    flags: list[dict[str, Any]] = Field(default_factory=list)


class ModelHistoryResponse(BaseModel):
    model_id: str
    checkpoints: list[CheckpointHistoryItem]
