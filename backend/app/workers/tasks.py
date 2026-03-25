from __future__ import annotations

import os

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
    from app.services.analysis_runner import run_analysis_job

    host = getattr(self.request, "hostname", None) or os.environ.get("HOSTNAME", "celery")
    worker_id = f"{host}:{os.getpid()}"
    run_analysis_job(analysis_id, database_url, worker_id=worker_id)


@celery_app.task(name="neuron.sweep_stale_analyses")
def sweep_stale_analyses_task() -> int:
    from app.core.config import settings
    from app.services.analysis_watchdog import mark_stale_running_analyses_failed

    return mark_stale_running_analyses_failed(db_url=settings.database_url)
