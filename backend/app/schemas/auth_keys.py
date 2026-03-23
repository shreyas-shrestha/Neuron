from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class APIKeyCreateBody(BaseModel):
    label: Optional[str] = Field(default=None, max_length=255)


class APIKeyCreatedResponse(BaseModel):
    key: str
    created_at: datetime
    label: Optional[str] = None


class APIKeyListItem(BaseModel):
    id: str
    masked_key: str
    label: Optional[str] = None
    created_at: datetime
    last_used_at: Optional[datetime] = None
    is_active: bool = True

    model_config = {"from_attributes": True}
