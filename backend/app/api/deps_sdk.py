from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.api_key import APIKey
from app.models.user import User

security_sdk = HTTPBearer(auto_error=True)


def get_user_from_api_key(
    creds: HTTPAuthorizationCredentials = Depends(security_sdk),
    db: Session = Depends(get_db),
) -> User:
    token = creds.credentials.strip()
    if not token.startswith("nrn_"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key format (expected nrn_…)",
        )
    key_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    row = db.execute(
        select(APIKey).where(APIKey.key_hash == key_hash, APIKey.is_active.is_(True))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    row.last_used_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    user = db.get(User, row.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
