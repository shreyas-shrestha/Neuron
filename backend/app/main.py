from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api import analysis, auth as auth_routes, dashboard, demo as demo_routes, models as models_routes, reports, sdk as sdk_routes
from app.core.auth import get_password_hash
from app.core.database import Base, SessionLocal, engine
from app.models.api_key import APIKey  # noqa: F401 — register table with Base.metadata
from app.models.user import User


@asynccontextmanager
async def lifespan(_: FastAPI):
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
