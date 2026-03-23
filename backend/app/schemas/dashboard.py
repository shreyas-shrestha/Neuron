from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class DashboardSummary(BaseModel):
    active_models: int
    recent_analyses: list[dict]
    risk_distribution: dict[str, int]
    trend_data: list[dict]
    top_risk_flags: list[dict]
    regulatory_milestones: list[dict]
    sae_status: dict[str, Any]
