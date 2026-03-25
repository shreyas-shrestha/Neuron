"""
Remove registered models, analyses, compliance reports, and on-disk SAE / PDF artifacts.

Keeps users (e.g. demo@neuron.ai). Run from backend root:

    python scripts/reset_ml_data.py

Uses DATABASE_URL from the environment when set (e.g. Docker: sqlite:////app/data/neuron.db).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import delete

BACKEND_ROOT = str(Path(__file__).resolve().parent.parent)
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from app.core.config import settings  # noqa: E402
from app.core.database import SessionLocal  # noqa: E402
from app.models.analysis import Analysis  # noqa: E402
from app.models.model_registry import ModelRegistry  # noqa: E402
from app.models.report import ComplianceReport  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset Neuron ML/registry demo data.")
    parser.add_argument(
        "--keep-files",
        action="store_true",
        help="Only clear DB rows; leave data/sae and data/reports files on disk.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        db.execute(delete(ComplianceReport))
        db.execute(delete(Analysis))
        db.execute(delete(ModelRegistry))
        db.commit()
    finally:
        db.close()

    if not args.keep_files:
        settings.sae_checkpoints_dir.mkdir(parents=True, exist_ok=True)
        settings.reports_dir.mkdir(parents=True, exist_ok=True)
        for p in settings.sae_checkpoints_dir.glob("*.pt"):
            p.unlink()
            print(f"Removed {p}")
        for p in settings.reports_dir.iterdir():
            if p.is_file():
                p.unlink()
                print(f"Removed {p}")

    print("Cleared model_registry, analyses, compliance_reports.")


if __name__ == "__main__":
    main()
