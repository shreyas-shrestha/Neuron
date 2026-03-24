from __future__ import annotations

from app.workers.celery_app import celery_app


@celery_app.task(
    bind=True,
    name="neuron.run_analysis_job",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
    time_limit=3600,
    soft_time_limit=3300,
    acks_late=True,
)
def run_analysis_job_task(self, analysis_id: str, database_url: str) -> None:
    """Worker entrypoint — loads models in an isolated process."""
    from app.services.analysis_runner import run_analysis_job

    run_analysis_job(analysis_id, database_url)
