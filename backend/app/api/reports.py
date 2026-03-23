from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.interpretability.report_generator import build_pdf_report
from app.models.analysis import Analysis
from app.models.model_registry import ModelRegistry
from app.models.report import ComplianceReport
from app.models.user import User
from app.schemas.report import ReportGenerateRequest, ReportOut

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/generate", response_model=ReportOut)
def generate_report(
    body: ReportGenerateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    analysis = db.get(Analysis, body.analysis_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if analysis.status != "complete":
        raise HTTPException(status_code=400, detail="Analysis not complete")
    model = db.get(ModelRegistry, analysis.model_id)
    findings = list(analysis.risk_flags or [])
    exec_summary = (
        f"Automated mechanistic review for model {model.name if model else 'unknown'}. "
        f"Overall risk score {float(analysis.overall_risk_score or 0):.1f}. "
        f"{len(findings)} findings recorded."
    )
    pdf_name = f"report_{body.analysis_id}_{body.report_type}.pdf"
    pdf_path = settings.reports_dir / pdf_name
    build_pdf_report(
        pdf_path,
        framework=body.report_type,
        organization=body.organization,
        model_name=model.name if model else "",
        analysis_id=str(analysis.id),
        overall_risk_score=float(analysis.overall_risk_score or 0),
        findings=findings,
        executive_summary=exec_summary,
    )
    report = ComplianceReport(
        analysis_id=str(analysis.id),
        framework=body.report_type,
        organization=body.organization,
        report_data={
            "findings": findings,
            "trajectory": analysis.trajectory_data,
            "executive_summary": exec_summary,
        },
        pdf_path=str(pdf_path),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("/{report_id}", response_model=ReportOut)
def get_report(
    report_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = db.get(ComplianceReport, report_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return row


@router.get("/{report_id}/pdf")
def download_pdf(
    report_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = db.get(ComplianceReport, report_id)
    if row is None or not row.pdf_path:
        raise HTTPException(status_code=404, detail="PDF not found")
    path = Path(row.pdf_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="PDF missing on disk")
    return FileResponse(path, filename=path.name, media_type="application/pdf")


@router.get("/{report_id}/share")
def share_link(
    report_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = db.get(ComplianceReport, report_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Report not found")
    token = f"neuron-report-{row.id}"
    return {
        "token": token,
        "message": "MVP: share token only. Wire signed URLs for production.",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
