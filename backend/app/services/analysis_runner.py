from __future__ import annotations

import traceback
from datetime import datetime, timezone

from app.core.config import settings
from app.interpretability.compliance_detector import ComplianceDetector
from app.interpretability.explainer import explain_flags_batch
from app.interpretability.lending_probes import LOAN_TEMPLATE, NAME_GROUPS, UCI_STYLE_SAMPLES
from app.models.analysis import Analysis
from app.models.model_registry import ModelRegistry
from app.services.tracker_cache import get_tracker


def _abort_if_not_running(db, analysis_id: str) -> Analysis | None:
    """Re-load row so concurrent retry (pending) is visible; abort stale workers."""
    db.expire_all()
    row = db.get(Analysis, analysis_id)
    if row is None or row.status != "running":
        return None
    return row


def run_analysis_job(analysis_id: str, db_url: str) -> None:
    """Heavy ML job: run under Celery worker (recommended) or FastAPI BackgroundTasks; opens its own DB session."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
    engine = create_engine(db_url, connect_args=connect_args)
    SessionMaker = sessionmaker(bind=engine)
    db = SessionMaker()
    try:
        analysis = db.get(Analysis, analysis_id)
        if analysis is None:
            return

        model = db.get(ModelRegistry, analysis.model_id)
        if model is None:
            analysis.status = "failed"
            analysis.error_message = "Model not found"
            analysis.progress = 0.0
            analysis.completed_at = datetime.now(timezone.utc)
            db.commit()
            return

        analysis.status = "running"
        analysis.progress = 0.05
        analysis.error_message = None
        db.commit()

        hf_id = model.huggingface_id or "gpt2"
        try:
            tracker = get_tracker(hf_id, sae_paths=None)
        except ModuleNotFoundError as exc:
            name = getattr(exc, "name", None) or str(exc)
            if "transformer_lens" in name or "transformer_lens" in str(exc):
                raise RuntimeError(
                    "Missing dependency `transformer-lens`. From the `backend` folder run: "
                    "python3 -m pip install 'transformer-lens>=2.0.0'   "
                    "(or use the project venv: pip install -e .)"
                ) from exc
            raise

        analysis = _abort_if_not_running(db, analysis_id)
        if analysis is None:
            return
        analysis.progress = 0.2
        db.commit()

        texts = list(analysis.input_texts or [])
        if not texts:
            texts = [
                LOAN_TEMPLATE.format(name=NAME_GROUPS["group_a"][0]),
                LOAN_TEMPLATE.format(name=NAME_GROUPS["group_b"][0]),
                *UCI_STYLE_SAMPLES[:2],
            ]

        primary = texts[0]
        traj = tracker.track(primary)

        analysis = _abort_if_not_running(db, analysis_id)
        if analysis is None:
            return
        analysis.progress = 0.5
        db.commit()

        detector = ComplianceDetector(tracker, domain=model.domain)
        probe = None
        disparity = None
        if analysis.analysis_type in ("compliance", "full"):
            probe = detector.run_demographic_probe(n_samples=min(80, max(20, len(texts) * 10)))

            analysis = _abort_if_not_running(db, analysis_id)
            if analysis is None:
                return
            analysis.progress = 0.8
            db.commit()

            t_a = LOAN_TEMPLATE.format(name=NAME_GROUPS["group_a"][0])
            t_b = LOAN_TEMPLATE.format(name=NAME_GROUPS["group_b"][0])
            disparity = detector.detect_disparate_impact(t_a, t_b)

        flags = detector.generate_risk_flags(
            traj,
            probe=probe,
            disparity=disparity,
            evidence_texts=texts[:4],
        )
        risk_score = detector.overall_risk_score(flags)
        if settings.ollama_explain_enabled:
            flags_dicts = [f.to_dict() for f in flags]
            enriched = [{**f, "total_layers": traj.layer_count} for f in flags_dicts]
            flags_dicts = explain_flags_batch(
                enriched,
                bci=risk_score,
                domain=model.domain or "general",
            )
        else:
            flags_dicts = [f.to_dict() for f in flags]

        analysis = _abort_if_not_running(db, analysis_id)
        if analysis is None:
            return
        analysis.progress = 0.95
        db.commit()

        payload = traj.to_api_dict()
        payload["probe"] = (
            {
                "auc": probe.auc,
                "n_samples": probe.n_samples,
                "notes": probe.notes,
                "interpretation": probe.interpretation,
                "name_anonymization_applied": True,
            }
            if probe
            else None
        )
        if disparity:
            payload["disparity"] = {
                "divergence": disparity.divergence,
                "risk_level": disparity.risk_level,
                "summary": disparity.summary,
            }

        analysis = _abort_if_not_running(db, analysis_id)
        if analysis is None:
            return
        analysis.trajectory_data = payload
        analysis.risk_flags = flags_dicts
        analysis.overall_risk_score = risk_score
        analysis.status = "complete"
        analysis.progress = 1.0
        analysis.completed_at = datetime.now(timezone.utc)
        model.last_analyzed_at = analysis.completed_at
        model.overall_risk_score = risk_score
        db.commit()
    except Exception as e:  # noqa: BLE001
        print(f"[neuron] Analysis job {analysis_id} FAILED: {e}")
        print(traceback.format_exc())
        try:
            db.expire_all()
            row = db.get(Analysis, analysis_id)
            if row is not None and row.status == "running":
                row.status = "failed"
                row.error_message = str(e)[:500]
                row.progress = 0.0
                row.completed_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
    finally:
        db.close()
