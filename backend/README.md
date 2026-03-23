# Neuron backend

FastAPI service for mechanistic interpretability and compliance reporting.

Run locally:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Demo login: `demo@neuron.ai` / `demo`.
