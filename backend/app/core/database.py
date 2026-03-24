from __future__ import annotations

from collections.abc import Generator
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Singleton pooled engine for background/Celery jobs (avoids per-job engine creation / connection churn).
_engine = None
_SessionLocal = None
_bound_pool_url: Optional[str] = None


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_session(db_url: str) -> Session:
    """
    Return a new Session backed by a process-wide pooled Engine for ``db_url``.
    Reuses one pool per URL (Postgres: pool_size=10, max_overflow=20, pool_pre_ping=True).
    SQLite uses StaticPool + check_same_thread for compatibility.
    """
    global _engine, _SessionLocal, _bound_pool_url

    if _engine is not None and _bound_pool_url != db_url:
        _engine.dispose()
        _engine = None
        _SessionLocal = None
        _bound_pool_url = None

    if _engine is None:
        ca = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
        if db_url.startswith("sqlite"):
            _engine = create_engine(
                db_url,
                connect_args=ca,
                poolclass=StaticPool,
                pool_pre_ping=True,
            )
        else:
            _engine = create_engine(
                db_url,
                connect_args=ca,
                pool_size=10,
                max_overflow=20,
                pool_pre_ping=True,
            )
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
        _bound_pool_url = db_url

    return _SessionLocal()
