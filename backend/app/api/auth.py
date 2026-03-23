from __future__ import annotations

import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.auth import create_access_token, get_password_hash, verify_password
from app.core.database import get_db
from app.models.api_key import APIKey
from app.models.user import User
from app.schemas.auth import Token, UserCreate, UserLogin, UserOut
from app.schemas.auth_keys import APIKeyCreateBody, APIKeyCreatedResponse, APIKeyListItem

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token)
def register(body: UserCreate, db: Session = Depends(get_db)) -> Token:
    existing = db.execute(select(User).where(User.email == body.email)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    user = User(email=body.email, hashed_password=get_password_hash(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(subject=str(user.id))
    return Token(access_token=token)


@router.post("/login", response_model=Token)
def login(body: UserLogin, db: Session = Depends(get_db)) -> Token:
    user = db.execute(select(User).where(User.email == body.email)).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(subject=str(user.id))
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)) -> UserOut:
    return UserOut(id=str(current.id), email=current.email)


@router.post("/api-keys", response_model=APIKeyCreatedResponse)
def create_api_key(
    body: APIKeyCreateBody,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> APIKeyCreatedResponse:
    raw = "nrn_" + secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    suffix = raw[-6:] if len(raw) >= 6 else raw
    row = APIKey(
        user_id=str(current.id),
        key_hash=key_hash,
        key_suffix=suffix,
        label=body.label,
        is_active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return APIKeyCreatedResponse(key=raw, created_at=row.created_at, label=row.label)


@router.get("/api-keys", response_model=list[APIKeyListItem])
def list_api_keys(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> list[APIKeyListItem]:
    rows = db.execute(select(APIKey).where(APIKey.user_id == str(current.id))).scalars().all()
    out: list[APIKeyListItem] = []
    for r in rows:
        masked = "nrn_••••••••" + (r.key_suffix or "")
        out.append(
            APIKeyListItem(
                id=str(r.id),
                masked_key=masked,
                label=r.label,
                created_at=r.created_at,
                last_used_at=r.last_used_at,
                is_active=r.is_active,
            )
        )
    return out


@router.delete("/api-keys/{key_id}")
def revoke_api_key(
    key_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
) -> Response:
    row = db.get(APIKey, key_id)
    if row is None or str(row.user_id) != str(current.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    row.is_active = False
    db.add(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)