from __future__ import annotations

from app.workers.celery_app import celery_app


@celery_app.task(name="neuron.run_analysis_job")
def run_analysis_job_task(analysis_id: str, database_url: str) -> None:
    """Worker entrypoint — loads models in an isolated process."""
    from app.services.analysis_runner import run_analysis_job

    run_analysis_job(analysis_id, database_url)
