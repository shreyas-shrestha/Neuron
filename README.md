# Neuron

**Catch what your eval suite misses.**

Neuron monitors what changes *inside* your model during retraining — not just outputs, but internal representations. When Ring's camera classified dark-skinned people as animals, their eval suite showed no red flags. The problem was in the model's internal layers. Neuron would have caught it before deployment.

## What it does

- **Model Diff**: Compare two checkpoints layer by layer. See exactly what changed internally, not just on benchmarks.
- **Behavior Change Index (BCI)**: A single score (0-100) quantifying how much a retrain shifted internal representations.
- **Drift Alerts**: Get notified when BCI crosses a threshold during your training loop — before you deploy.
- **Plain English Explanations**: LangChain + Claude translates technical findings into language your team actually understands.

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
- **AI**: LangChain + Claude (flag explanations)

## Quick start

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Set your Anthropic API key for plain-English explanations (optional)
export ANTHROPIC_API_KEY=your_key_here

uvicorn app.main:app --reload --port 8000
```

Default user: `demo@neuron.ai` / `demo`

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
