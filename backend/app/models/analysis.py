from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.sqlite import CHAR, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    model_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("model_registry.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    analysis_type: Mapped[str] = mapped_column(String(64), default="full")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    input_texts: Mapped[Optional[List[Any]]] = mapped_column(JSON, nullable=True)
    trajectory_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    risk_flags: Mapped[Optional[List[Any]]] = mapped_column(JSON, nullable=True)
    overall_risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_heartbeat: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    worker_id: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)

    model: Mapped["ModelRegistry"] = relationship("ModelRegistry", back_populates="analyses")
    reports: Mapped[List["ComplianceReport"]] = relationship(
        "ComplianceReport", back_populates="analysis"
    )


if TYPE_CHECKING:
    from app.models.model_registry import ModelRegistry
    from app.models.report import ComplianceReport
