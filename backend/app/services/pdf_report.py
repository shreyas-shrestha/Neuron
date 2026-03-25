from __future__ import annotations

import io
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _p(text: str, style) -> Paragraph:
    return Paragraph(escape(str(text or "—")).replace("\n", "<br/>"), style)


def generate_compliance_pdf(
    analysis_data: dict[str, Any],
    flags_data: list[dict[str, Any]],
) -> io.BytesIO:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=54,
        leftMargin=54,
        topMargin=54,
        bottomMargin=54,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        name="AuditTitle",
        parent=styles["Title"],
        fontSize=18,
        spaceAfter=14,
        alignment=1,
    )
    heading = ParagraphStyle(
        name="SectionHead",
        parent=styles["Heading2"],
        fontSize=11,
        spaceBefore=10,
        spaceAfter=6,
    )
    body = styles["Normal"]
    body.leading = 14
    meta = ParagraphStyle(name="Meta", parent=body, fontSize=10, leading=13)

    story: list[Any] = []
    story.append(Paragraph("Automated Behavioral Drift Compliance Audit", title_style))
    story.append(Spacer(1, 0.15 * inch))

    story.append(Paragraph("<b>Document metadata</b>", heading))
    meta_lines = [
        f"<b>Report date (UTC):</b> {escape(str(analysis_data.get('generated_at', '—')))}",
        f"<b>Model ID:</b> {escape(str(analysis_data.get('model_id', '—')))}",
        f"<b>Model:</b> {escape(str(analysis_data.get('model_label', '—')))}",
        f"<b>Checkpoint / epoch:</b> {escape(str(analysis_data.get('checkpoint_label', '—')))}",
        f"<b>Analysis ID:</b> {escape(str(analysis_data.get('analysis_id', '—')))}",
    ]
    for line in meta_lines:
        story.append(Paragraph(line, meta))
    story.append(Spacer(1, 0.2 * inch))

    bci = float(analysis_data.get("bci") or 0.0)
    story.append(Paragraph("<b>Core metric: Behavior Change Index (BCI)</b>", heading))
    story.append(Paragraph(f"<b>BCI score:</b> {bci:.2f}", body))
    story.append(Spacer(1, 0.12 * inch))

    story.append(Paragraph("<b>Audit status</b>", heading))
    if bci > 20.0:
        status_html = (
            '<font color="#b91c1c"><b>STATUS: HIGH RISK / DRIFT DETECTED</b></font><br/>'
            "<i>BCI exceeds the organizational threshold of 20. Further review is required.</i>"
        )
    else:
        status_html = (
            '<font color="#15803d"><b>STATUS: PASS / COMPLIANT</b></font><br/>'
            "<i>BCI is at or below the threshold of 20 for this audit cycle.</i>"
        )
    story.append(Paragraph(status_html, body))
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("<b>Findings</b>", heading))
    story.append(
        Paragraph(
            "The following rows summarize automated behavioral findings associated with this analysis.",
            meta,
        )
    )
    story.append(Spacer(1, 0.08 * inch))

    table_data: list[list[Any]] = [
        [
            Paragraph("<b>Layer</b>", body),
            Paragraph("<b>Domain / category</b>", body),
            Paragraph("<b>Clinical explanation</b>", body),
        ]
    ]

    for flag in flags_data or []:
        layers = flag.get("affected_layers") or []
        layer_s = ", ".join(str(x) for x in layers[:12]) if layers else "—"
        cat = str(flag.get("risk_category") or "—")
        clinical = str(flag.get("plain_explanation") or flag.get("description") or "—")
        table_data.append(
            [
                _p(layer_s, body),
                _p(cat, body),
                _p(clinical[:4000], body),
            ]
        )

    if len(table_data) == 1:
        table_data.append(
            [
                _p("—", body),
                _p("No flags recorded", body),
                _p("—", body),
            ]
        )

    col_w = [1.0 * inch, 1.35 * inch, 4.25 * inch]
    tbl = Table(table_data, colWidths=col_w, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                ("TOPPADDING", (0, 0), (-1, 0), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 1), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ]
        )
    )
    story.append(tbl)

    story.append(Spacer(1, 0.35 * inch))
    story.append(
        Paragraph(
            "<i>This document was generated automatically by Neuron for governance and audit purposes. "
            "It does not constitute legal advice.</i>",
            meta,
        )
    )

    doc.build(story)
    buffer.seek(0)
    return buffer
