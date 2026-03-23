from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.sqlite import CHAR, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ComplianceReport(Base):
    __tablename__ = "compliance_reports"

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    analysis_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("analyses.id"), nullable=False)
    framework: Mapped[str] = mapped_column(String(64), nullable=False)
    organization: Mapped[str] = mapped_column(String(255), default="")
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    report_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    pdf_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    analysis: Mapped["Analysis"] = relationship("Analysis", back_populates="reports")


if TYPE_CHECKING:
    from app.models.analysis import Analysis
