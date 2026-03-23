from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ReportGenerateRequest(BaseModel):
    analysis_id: str
    report_type: str = Field(
        default="general",
        pattern="^(eu_ai_act|sec|fda|general)$",
    )
    organization: str = ""


class ReportOut(BaseModel):
    id: str
    analysis_id: str
    framework: str
    organization: str
    generated_at: datetime
    pdf_path: Optional[str]
    report_data: Optional[dict[str, Any]]

    model_config = {"from_attributes": True}
