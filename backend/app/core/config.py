from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_SQLITE = f"sqlite:///{_BACKEND_ROOT / 'neuron.db'}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Neuron API"
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    # Local Ollama for plain-English flag explanations (langchain-ollama).
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"
    ollama_explain_enabled: bool = True
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    database_url: str = _DEFAULT_SQLITE
    data_dir: Path = Path(__file__).resolve().parent.parent.parent / "data"
    reports_dir: Path = Path(__file__).resolve().parent.parent.parent / "data" / "reports"
    sae_checkpoints_dir: Path = Path(__file__).resolve().parent.parent.parent / "data" / "sae"
    public_app_url: str = "http://localhost:5173"

    # Offload heavy analysis (HookedTransformer + SAE) from the API process.
    # Example: redis://localhost:6379/0 — requires: pip install -e ".[worker]" and a running worker.
    celery_broker_url: Optional[str] = None
    celery_result_backend: Optional[str] = None

    # Direct-to-S3 checkpoint uploads (SDK uses presigned PUT; never stream multi-GB files through FastAPI).
    aws_region: str = "us-east-1"
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    s3_artifacts_bucket: Optional[str] = None


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.reports_dir.mkdir(parents=True, exist_ok=True)
settings.sae_checkpoints_dir.mkdir(parents=True, exist_ok=True)
