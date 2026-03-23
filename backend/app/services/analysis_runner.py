from __future__ import annotations

from datetime import datetime, timezone

from app.interpretability.compliance_detector import ComplianceDetector
from app.interpretability.lending_probes import LOAN_TEMPLATE, NAME_GROUPS, UCI_STYLE_SAMPLES
from app.models.analysis import Analysis
from app.models.model_registry import ModelRegistry
from app.services.tracker_cache import get_tracker


def run_analysis_job(analysis_id: str, db_url: str) -> None:
    """Executed in BackgroundTasks — opens its own DB session."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.core.config import settings
    connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
    engine = create_engine(db_url, connect_args=connect_args)
    SessionMaker = sessionmaker(bind=engine)
    db = SessionMaker()
    try:
        row = db.get(Analysis, analysis_id)
        if row is None:
            return
        model = db.get(ModelRegistry, row.model_id)
        if model is None:
            row.status = "failed"
            row.error_message = "Model not found"
            row.completed_at = datetime.now(timezone.utc)
            db.commit()
            return

        hf_id = model.huggingface_id or "gpt2"
        row.status = "running"
        row.progress = 0.05
        db.commit()

        tracker = get_tracker(hf_id, sae_paths=None)
        row.progress = 0.2
        db.commit()

        texts = list(row.input_texts or [])
        if not texts:
            texts = [
                LOAN_TEMPLATE.format(name=NAME_GROUPS["group_a"][0]),
                LOAN_TEMPLATE.format(name=NAME_GROUPS["group_b"][0]),
                *UCI_STYLE_SAMPLES[:2],
            ]

        primary = texts[0]
        traj = tracker.track(primary)
        row.progress = 0.45
        db.commit()

        detector = ComplianceDetector(tracker, domain=model.domain)
        probe = None
        disparity = None
        if row.analysis_type in ("compliance", "full"):
            probe = detector.run_demographic_probe(n_samples=min(80, max(20, len(texts) * 10)))
            row.progress = 0.65
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

        row.trajectory_data = payload
        row.risk_flags = [f.to_dict() for f in flags]
        row.overall_risk_score = risk_score
        row.status = "complete"
        row.progress = 1.0
        row.completed_at = datetime.now(timezone.utc)
        model.last_analyzed_at = row.completed_at
        model.overall_risk_score = risk_score
        db.commit()
    except Exception as exc:  # noqa: BLE001
        failed = db.get(Analysis, analysis_id)
        if failed:
            failed.status = "failed"
            failed.error_message = str(exc)[:2000]
            failed.completed_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()
