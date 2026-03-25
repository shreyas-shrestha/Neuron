from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def build_pdf_report(
    out_path: Path,
    framework: str,
    organization: str,
    model_name: str,
    analysis_id: str,
    overall_risk_score: float,
    findings: list[dict[str, Any]],
    executive_summary: str,
) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TitleCustom",
        parent=styles["Title"],
        textColor=colors.HexColor("#0a0f1e"),
        fontName="Helvetica-Bold",
    )
    body = ParagraphStyle(
        "BodyCustom",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
    )
    story: list[Any] = []
    story.append(Paragraph("NEURON — Mechanistic Compliance Report", title_style))
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        Paragraph(
            f"<b>Framework:</b> {framework.upper()} &nbsp;|&nbsp; "
            f"<b>Organization:</b> {organization or 'N/A'}<br/>"
            f"<b>Generated:</b> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}<br/>"
            f"<b>Model:</b> {model_name}<br/><b>Analysis ID:</b> {analysis_id}",
            body,
        )
    )
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("<b>Executive summary</b>", styles["Heading2"]))
    story.append(Paragraph(executive_summary, body))
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        Paragraph(
            f"<b>Overall mechanistic risk score:</b> {overall_risk_score:.1f} / 100",
            body,
        )
    )
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("<b>Findings matrix</b>", styles["Heading2"]))
    table_data = [["Severity", "Category", "Layers", "Recommended action"]]
    for row in findings[:40]:
        sev = str(row.get("risk_level", ""))
        cat = str(row.get("risk_category", ""))
        layers = ",".join(str(x) for x in (row.get("affected_layers") or [])[:6])
        if len(layers) > 40:
            layers = layers[:37] + "..."
        act = str((row.get("recommended_actions") or [""])[0])[:120]
        table_data.append([sev, cat, layers, act])
    tbl = Table(table_data, colWidths=[0.9 * inch, 1.4 * inch, 1.1 * inch, 3.2 * inch])
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0a0f1e")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(tbl)
    story.append(Spacer(1, 0.25 * inch))
    story.append(
        Paragraph(
            "<b>Attestation block</b><br/>"
            "Prepared by Neuron automated interpretability pipeline. "
            "This document supports human review and does not constitute legal advice.",
            body,
        )
    )
    story.append(Spacer(1, 0.35 * inch))
    story.append(Paragraph("_" * 80, body))
    story.append(Paragraph("Compliance officer signature: ____________________________  Date: ________", body))
    doc.build(story)
    return out_path
