from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class AnalysisRunRequest(BaseModel):
    model_id: str
    text_samples: list[str] = Field(default_factory=list)
    analysis_type: str = Field(default="full", pattern="^(trajectory|compliance|full)$")


class AnalysisStatusOut(BaseModel):
    id: str
    status: str
    progress: float
    eta_seconds: Optional[int] = None


class RiskFlagOut(BaseModel):
    risk_category: str
    risk_level: str
    affected_layers: list[int] = []
    feature_indices: list[int] = []
    description: str = ""
    evidence_texts: list[str] = []
    recommended_actions: list[str] = []


class TrajectoryResultOut(BaseModel):
    """Subset / full trajectory payload returned to the UI."""

    per_layer_codes: dict[str, list[float]] = {}
    per_layer_curve: Optional[dict[str, float]] = None
    delta_summary: dict[str, list[float]] = {}
    novel_features_by_layer: dict[str, list[int]] = {}
    trajectory_embedding: list[float] = []
    layer_count: int = 0
    hidden_dim: int = 0
    heatmap: Optional[list[list[float]]] = None
    heatmap_feature_ids: Optional[list[int]] = None
    top_features_per_layer: dict[str, list[dict[str, Any]]] = {}
    token_windows: Optional[dict[str, Any]] = None
    feature_clusters: Optional[list[dict[str, Any]]] = None
    probe: Optional[dict[str, Any]] = None
    disparity: Optional[dict[str, Any]] = None
    sae_trained: bool = False


class AnalysisResultsOut(BaseModel):
    id: str
    model_id: str
    status: str
    analysis_type: str
    overall_risk_score: float
    trajectory: Optional[TrajectoryResultOut]
    risk_flags: list[RiskFlagOut]
    input_texts: list[str]
    created_at: datetime
    completed_at: Optional[datetime]


class TrajectoryPreviewRequest(BaseModel):
    model_id: str
    text: str


class CompareTrajectoryRequest(BaseModel):
    model_id: str
    text_a: str
    text_b: str
