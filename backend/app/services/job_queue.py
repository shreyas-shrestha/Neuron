from __future__ import annotations

from fastapi import BackgroundTasks

from app.core.config import settings
from app.services.analysis_runner import run_analysis_job


def enqueue_analysis_job(analysis_id: str, background: BackgroundTasks) -> None:
    broker = settings.celery_broker_url
    if broker:
        from app.workers.celery_app import celery_app

        celery_app.send_task(
            "neuron.run_analysis_job",
            args=[analysis_id, settings.database_url],
        )
        return
    background.add_task(run_analysis_job, analysis_id, settings.database_url)
