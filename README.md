# Neuron

**Catch what your eval suite misses.**

Neuron monitors what changes *inside* your model during retraining — not just outputs, but internal representations. Companies rely on testing outputs, but fail to recognize consistently when and where bias creeps in. The problem is in the model's internal layers. Neuron catches this before deployment. Neuron relies on sparse autoencoder research commonly applied to interpretability in science, for example protein representations, applied to enterprise.

## What it does

- **Model Diff**: Compare two checkpoints layer by layer. See exactly what changed internally, not just on benchmarks.
- **Behavior Change Index (BCI)**: A single score (0–100) quantifying how much a retrain shifted internal representations.
- **Drift Alerts**: Get notified when BCI crosses a threshold during your training loop — before you deploy.
- **Plain English Explanations**: LangChain + local Ollama translates technical findings into language your team actually understands.
- **Compliance audit PDF**: From a finished analysis, download a formal **Automated Behavioral Drift Compliance Audit** (metadata, BCI, pass/high-risk status, findings table) for governance records.

## 2-line integration

```python
import neuron
neuron.init(api_key="nrn_xxx", model_id="my-model")

for epoch in range(epochs):
    train(model, dataloader)
    neuron.checkpoint(model, epoch=epoch)  # ← only addition
```

## Stack

- **Frontend**: React 18, Vite, TailwindCSS, D3, Recharts
- **Backend**: FastAPI, SQLAlchemy (SQLite → Postgres), JWT
- **ML**: PyTorch, TransformerLens, scikit-learn
- **AI**: LangChain + Ollama (local flag explanations)
- **Jobs**: Optional **Celery + Redis** for heavy analysis off the API process; **ReportLab** for PDF reports

## Reliability & ops (short)

- **Analysis jobs** record a **worker heartbeat** while running. If a worker is killed or a task is lost, the API **watchdog** marks stale `running` jobs as **failed** after about **10 minutes** without a heartbeat (configurable via env — see `backend/app/core/config.py`).
- **Optional Celery Beat**: Schedule task `neuron.sweep_stale_analyses` if the API process is not always up but workers are.
- **Ollama batch explanations** use a **wall-clock cap** on Unix (`ollama_explain_batch_wallclock_seconds`, default 5 minutes) so one stuck LLM call cannot block a worker indefinitely. Per-flag timeouts still apply inside the batch.
- **Model cache**: Workers **reuse** loaded weights across jobs by default (faster). Set `NEURON_CLEAR_TRACKER_AFTER_JOB=1` to unload after every job if you need minimum GPU memory footprint.

## Quick start

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Optional: run Ollama locally for plain-English flag explanations (default: http://localhost:11434, model llama3)
# ollama pull llama3

uvicorn app.main:app --reload --port 8000
```

Default user: `demo@neuron.ai` / `demo`

### Optional: Celery worker (recommended for real GPU analysis)

Set `CELERY_BROKER_URL` (and optionally `CELERY_RESULT_BACKEND`) in `backend/.env`, install worker extras, then run a worker alongside the API:

```bash
cd backend
pip install -e ".[worker]"
celery -A app.workers.celery_app worker --loglevel=info
```

### Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```


### Train SAE checkpoints (for real trajectory analysis)

```bash
cd backend
python scripts/train_sae_layer0.py --layer 0   # ~30 min CPU
python scripts/train_sae_layer0.py --layer 5
python scripts/train_sae_layer0.py --layer 11
```

### Live demo (no login required)

Open the app and use **Live Demo** from the landing page for a full browser-only walkthrough (rate-limited; demo sessions auto-expire after a few hours).
