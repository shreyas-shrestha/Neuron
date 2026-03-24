import asyncio
import warnings
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api import analysis, auth as auth_routes, dashboard, demo as demo_routes, models as models_routes, reports, sdk as sdk_routes
from app.core.auth import get_password_hash
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.models.analysis import Analysis
from app.models.api_key import APIKey  # noqa: F401 — register table with Base.metadata
from app.models.model_registry import ModelRegistry
from app.models.report import ComplianceReport
from app.models.user import User


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
            for user in old_demo_users:
                owned = (
                    db.execute(select(ModelRegistry).where(ModelRegistry.owner_user_id == str(user.id)))
                    .scalars()
                    .all()
                )
                mids = [str(m.id) for m in owned]
                if mids:
                    aid_list = [
                        str(a.id)
                        for a in db.execute(select(Analysis).where(Analysis.model_id.in_(mids))).scalars().all()
                    ]
                    if aid_list:
                        db.query(ComplianceReport).filter(ComplianceReport.analysis_id.in_(aid_list)).delete(
                            synchronize_session=False
                        )
                    db.query(Analysis).filter(Analysis.model_id.in_(mids)).delete(synchronize_session=False)
                    db.query(ModelRegistry).filter(ModelRegistry.id.in_(mids)).delete(synchronize_session=False)
                db.query(APIKey).filter(APIKey.user_id == str(user.id)).delete(synchronize_session=False)
                db.delete(user)
            db.commit()
            print(f"[neuron] Cleaned up {len(old_demo_users)} demo sessions")
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
