"""Lightweight additive migrations (no Alembic) for single-node / SQLite dev."""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def ensure_analysis_worker_lifecycle_columns(engine: Engine) -> None:
    """Add heartbeat / worker columns to ``analyses`` if missing."""
    insp = inspect(engine)
    if not insp.has_table("analyses"):
        return
    existing = {c["name"] for c in insp.get_columns("analyses")}
    dialect = engine.dialect.name

    def col_sql(name: str, pg_type: str) -> str:
        if dialect == "sqlite":
            return f"ALTER TABLE analyses ADD COLUMN {name} DATETIME"
        return f"ALTER TABLE analyses ADD COLUMN {name} {pg_type}"

    def str_sql(name: str) -> str:
        if dialect == "sqlite":
            return f"ALTER TABLE analyses ADD COLUMN {name} VARCHAR(256)"
        return f"ALTER TABLE analyses ADD COLUMN {name} VARCHAR(256)"

    with engine.begin() as conn:
        if "last_heartbeat" not in existing:
            conn.execute(text(col_sql("last_heartbeat", "TIMESTAMPTZ")))
        if "started_at" not in existing:
            conn.execute(text(col_sql("started_at", "TIMESTAMPTZ")))
        if "worker_id" not in existing:
            conn.execute(text(str_sql("worker_id")))
