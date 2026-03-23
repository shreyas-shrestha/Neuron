from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.dialects.sqlite import CHAR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ModelRegistry(Base):
    __tablename__ = "model_registry"

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    huggingface_id: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    checkpoint_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    domain: Mapped[str] = mapped_column(String(64), default="general")
    layer_count: Mapped[int] = mapped_column(Integer, default=12)
    hidden_dim: Mapped[int] = mapped_column(Integer, default=768)
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    last_analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    overall_risk_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    analyses: Mapped[List["Analysis"]] = relationship("Analysis", back_populates="model")


if TYPE_CHECKING:
    from app.models.analysis import Analysis
