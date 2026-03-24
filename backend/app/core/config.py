from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Neuron API"
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    anthropic_api_key: Optional[str] = None
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    database_url: str = "sqlite:///./neuron.db"
    data_dir: Path = Path(__file__).resolve().parent.parent.parent / "data"
    reports_dir: Path = Path(__file__).resolve().parent.parent.parent / "data" / "reports"
    sae_checkpoints_dir: Path = Path(__file__).resolve().parent.parent.parent / "data" / "sae"
    public_app_url: str = "http://localhost:5173"


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.reports_dir.mkdir(parents=True, exist_ok=True)
settings.sae_checkpoints_dir.mkdir(parents=True, exist_ok=True)
