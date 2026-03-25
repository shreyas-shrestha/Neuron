from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db_session
from app.models.analysis import Analysis

_log = logging.getLogger(__name__)


def mark_stale_running_analyses_failed(
    *,
    stale_after_seconds: float | None = None,
    db_url: str | None = None,
) -> int:
    threshold_sec = float(stale_after_seconds or settings.analysis_heartbeat_stale_seconds)
    if threshold_sec <= 0:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=threshold_sec)
    url = db_url or settings.database_url
    db = get_db_session(url)
    try:
        rows = db.scalars(select(Analysis).where(Analysis.status == "running")).all()
        n = 0
        msg = (
            "Analysis marked failed: no worker heartbeat within "
            f"{max(1, int(threshold_sec // 60))}m (worker may have been killed or task lost)."
        )
        now = datetime.now(timezone.utc)
        for row in rows:
            ref = row.last_heartbeat or row.started_at or row.created_at
            if ref is None:
                continue
            if ref.tzinfo is None:
                ref = ref.replace(tzinfo=timezone.utc)
            if ref < cutoff:
                row.status = "failed"
                row.error_message = msg[:500]
                row.progress = 0.0
                row.completed_at = now
                n += 1
        if n:
            db.commit()
            _log.warning("Watchdog: marked %s stale running analysis job(s) as failed", n)
        return n
    except Exception:  # noqa: BLE001
        db.rollback()
        raise
    finally:
        db.close()
