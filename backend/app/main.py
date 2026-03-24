import asyncio
import warnings
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, select

from app.api import analysis, auth as auth_routes, dashboard, demo as demo_routes, models as models_routes, reports, sdk as sdk_routes
from app.core.auth import get_password_hash
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.db_migrations import ensure_analysis_worker_lifecycle_columns
from app.services.analysis_watchdog import mark_stale_running_analyses_failed
from app.models.analysis import Analysis
from app.models.api_key import APIKey  # noqa: F401 — register table with Base.metadata
from app.models.model_registry import ModelRegistry
from app.models.report import ComplianceReport
from app.models.user import User


def _delete_demo_user(db, user: User) -> None:
    """Atomic cleanup of one demo session (FK-safe order, single commit)."""
    owned_ids = [
        str(x)
        for x in db.scalars(
            select(ModelRegistry.id).where(ModelRegistry.owner_user_id == str(user.id))
        ).all()
    ]
    if owned_ids:
        analysis_ids = [
            str(x)
            for x in db.scalars(select(Analysis.id).where(Analysis.model_id.in_(owned_ids))).all()
        ]
        if analysis_ids:
            db.execute(delete(ComplianceReport).where(ComplianceReport.analysis_id.in_(analysis_ids)))
        db.execute(delete(Analysis).where(Analysis.model_id.in_(owned_ids)))
        db.execute(delete(ModelRegistry).where(ModelRegistry.id.in_(owned_ids)))
    db.execute(delete(APIKey).where(APIKey.user_id == str(user.id)))
    db.delete(user)
    db.commit()


async def analysis_watchdog_loop() -> None:
    """Fail analyses stuck in ``running`` when the worker stops heartbeating (Redis restart, kill -9, etc.)."""
    interval = max(15.0, float(settings.analysis_watchdog_interval_seconds))
    while True:
        await asyncio.sleep(interval)
        try:
            mark_stale_running_analyses_failed()
        except Exception as e:  # noqa: BLE001
            print(f"[neuron] Analysis watchdog error: {e}")


async def cleanup_demo_sessions() -> None:
    """Delete demo users/models/analyses older than 2 hours."""
    while True:
        await asyncio.sleep(3600)
        db = SessionLocal()
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
            old_demo_users = (
                db.execute(
                    select(User).where(
                        User.email.like("demo-session-%@neuron.ai"),
                        User.created_at < cutoff,
                    )
                )
                .scalars()
                .all()
            )
            n_ok = 0
            for user in old_demo_users:
                try:
                    _delete_demo_user(db, user)
                    n_ok += 1
                except Exception as e:  # noqa: BLE001
                    db.rollback()
                    print(f"[neuron] Demo cleanup error for user {user.id}: {e}")
            print(f"[neuron] Cleaned up {n_ok} demo sessions ({len(old_demo_users)} candidates)")
        except Exception as e:  # noqa: BLE001
            db.rollback()
            print(f"[neuron] Demo cleanup error: {e}")
        finally:
            db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    DEFAULT_KEYS = {
        "your-secret-key-change-in-production",
        "secret",
        "changeme",
        "development",
        "dev",
        "change-me-docker-compose-secret",
        "change-me-in-production-use-openssl-rand-hex-32",
    }
    sk = settings.secret_key.lower()
    if sk in DEFAULT_KEYS or len(settings.secret_key) < 32:
        warnings.warn(
            "\n"
            + "=" * 60
            + "\nWARNING: Insecure SECRET_KEY detected!"
            + "\nGenerate a strong key with:"
            + '\n  python -c "import secrets; print(secrets.token_hex(32))"'
            + "\nSet it in your .env file before deploying."
            + "\n"
            + "=" * 60,
            stacklevel=2,
        )

    Base.metadata.create_all(bind=engine)
    ensure_analysis_worker_lifecycle_columns(engine)
    db = SessionLocal()
    try:
        exists = db.execute(select(User).where(User.email == "demo@neuron.ai")).scalar_one_or_none()
        if exists is None:
            db.add(
                User(
                    email="demo@neuron.ai",
                    hashed_password=get_password_hash("demo"),
                )
            )
            db.commit()
    finally:
        db.close()

    asyncio.create_task(cleanup_demo_sessions())
    asyncio.create_task(analysis_watchdog_loop())
    yield


app = FastAPI(title="Neuron API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://frontend:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(demo_routes.router, prefix="/api/v1")
app.include_router(auth_routes.router, prefix="/api/v1")
app.include_router(models_routes.router, prefix="/api/v1")
app.include_router(analysis.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(sdk_routes.router, prefix="/api/v1/sdk", tags=["sdk"])


@app.get("/health")
def health():
    return {"status": "ok"}
