"""
Enqueue heavy ML analysis jobs on Celery when CELERY_BROKER_URL is set;
otherwise fall back to FastAPI BackgroundTasks (dev / single-node only).
"""

from __future__ import annotations

from fastapi import BackgroundTasks

from app.core.config import settings
from app.services.analysis_runner import run_analysis_job


def enqueue_analysis_job(analysis_id: str, background: BackgroundTasks) -> None:
    """
    Run ``run_analysis_job`` off the request thread.
    Prefer Celery + Redis in production so the API process does not load HookedTransformer
    in the same memory space as concurrent HTTP handlers.
    """
    broker = settings.celery_broker_url
    if broker:
        from app.workers.celery_app import celery_app

        celery_app.send_task(
            "neuron.run_analysis_job",
            args=[analysis_id, settings.database_url],
        )
        return
    background.add_task(run_analysis_job, analysis_id, settings.database_url)
