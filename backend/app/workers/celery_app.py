"""Celery application for offloading analysis jobs from the FastAPI process."""

from __future__ import annotations

from celery import Celery

from app.core.config import settings

_broker = settings.celery_broker_url or "redis://127.0.0.1:6379/0"
_backend = settings.celery_result_backend or _broker

celery_app = Celery(
    "neuron",
    broker=_broker,
    backend=_backend,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)
