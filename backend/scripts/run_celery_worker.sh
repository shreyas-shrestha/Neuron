#!/usr/bin/env bash
# Run from backend/ with Redis available and CELERY_BROKER_URL set (see .env.example).
set -euo pipefail
cd "$(dirname "$0")/.."
exec celery -A app.workers.celery_app worker --loglevel=info
