# Neuron

**Neuron** is an mechanistic interpretability compliance platform: audit what fine-tuned LLMs encode internally, surface compliance-style risk flags, and export regulator-ready PDFs.

## Stack

- **Frontend:** React 18, Vite, TailwindCSS, D3, Recharts, Framer Motion  
- **Backend:** FastAPI, SQLAlchemy (SQLite), JWT (python-jose), ReportLab  
- **ML:** PyTorch, TransformerLens, scikit-learn  

## Quick start (local)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -U pip
pip install -e ".[dev]"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Default user (seeded on startup): `demo@neuron.ai` / `demo`.

> **Note:** Installing `torch` + `transformer-lens` requires several GB of disk space. If install fails with “no space left on device”, free space or use Docker on a machine with sufficient storage.

### Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

Open `http://localhost:5173`, log in, register **gpt2** under *Model registry*, then open the auto-spawned analysis from the dashboard when it completes.

## Docker Compose

```bash
docker compose up --build
```

- API: `http://localhost:8000` (e.g. `http://localhost:8000/docs`)  
- UI: `http://localhost:5173` (nginx serving the built SPA and proxying `/api/` to the backend)

Set a strong `SECRET_KEY` in `docker-compose.yml` for anything beyond local demos.

## Demo flow (90s)

1. Log in as `demo@neuron.ai` / `demo`.  
2. **Model registry → Register** HuggingFace id `gpt2`, domain `lending`.  
3. Wait for the background full analysis (poll from **Dashboard** or open the analysis URL when ready).  
4. Inspect **layer trajectory** (D3), **feature heatmap**, and **risk flags** (demographic probe AUC / disparate-impact proxy).  
5. **Reports → Generate PDF** (EU AI Act template).  
6. Use **Input explorer** with two loan blurbs that differ only by name to see trajectory divergence.

## Project layout

```
neuron/
├── backend/app/          # FastAPI, interpretability engine, PDFs
├── frontend/src/         # React UI
├── docker-compose.yml
└── README.md
```
