# Neuron backend

FastAPI service for mechanistic interpretability, behavioral drift scoring (BCI), compliance-style reporting, and optional PDF audit exports.

## Run locally

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Demo login: `demo@neuron.ai` / `demo`.

## Heavy analysis (Celery)

Offload `run_analysis_job` to a worker so the API does not load large transformer models:

```bash
pip install -e ".[worker]"
# Set CELERY_BROKER_URL in .env (e.g. redis://127.0.0.1:6379/0)
celery -A app.workers.celery_app worker --loglevel=info
```

- **`neuron.sweep_stale_analyses`**: optional Beat task to fail zombie `running` jobs when the API watchdog is not running.
- **Heartbeats**: workers update `analyses.last_heartbeat` periodically; stale jobs are marked failed (see `app/services/analysis_watchdog.py` and settings in `app/core/config.py`).

## PDF compliance reports

- Endpoint: `GET /api/v1/analysis/{job_id}/report/pdf` (auth required; job must be complete).
- Implementation: `app/services/pdf_report.py` (ReportLab).

## Useful environment variables

| Variable | Purpose |
|----------|---------|
| `CELERY_BROKER_URL` | Enable Celery queue for analysis jobs |
| `CELERY_RESULT_BACKEND` | Optional Celery result backend |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_EXPLAIN_ENABLED` | Local LLM for flag explanations |
| `NEURON_CLEAR_TRACKER_AFTER_JOB` | `1` = clear GPU model cache after each job; default off (reuse for speed) |
| `NEURON_MAX_MODEL_CACHE` | Max distinct trackers kept in LRU (default `2`) |
| `ANALYSIS_HEARTBEAT_STALE_SECONDS` | Stale threshold before watchdog fails a `running` job (default `600`) |

See `app/core/config.py` for heartbeat intervals and Ollama batch wall-clock settings.

## Checkpoint downloads (SDK / weights)

`app/services/checkpoint_download.py` provides HTTP download with retries and optional SHA-256 verification; resume/quota/LRU cache policies can be layered on top for large artifacts.
