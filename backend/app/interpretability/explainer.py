"""
Uses LangChain + Claude to generate plain-English explanations
of behavior flags for non-technical stakeholders.
"""

from __future__ import annotations

import os
from typing import Any, Optional

try:
    from langchain_anthropic import ChatAnthropic
    from langchain_core.prompts import ChatPromptTemplate

    LANGCHAIN_AVAILABLE = True
    EXPLAINER_PROMPT = ChatPromptTemplate.from_template(
        """
You are explaining a machine learning model behavior finding
to a non-technical engineering manager or compliance officer.
Be clear, concrete, and avoid all ML jargon.
Use 2-4 sentences maximum. Be direct about the risk without
being alarmist. Use relatable product-safety framing (missed by output-only testing) when it helps.

Finding details:
- Flag category: {category}
- Severity: {severity}
- Layer where detected: {layer} of {total_layers}
- Behavior Change Index: {bci:.1f} (scale: 0=no change, 100=complete change)
- Technical description: {technical_description}
- Domain: {domain}

Write a plain English explanation of what this means and
why an engineering team should care. Do not use terms like:
"activation", "latent space", "embedding", "tensor", "SAE",
"autoencoder", "mechanistic", or "interpretability".
"""
    )
except ImportError:
    LANGCHAIN_AVAILABLE = False
    EXPLAINER_PROMPT = None


def explain_flag(
    category: str,
    severity: str,
    layer: int,
    total_layers: int,
    bci: float,
    technical_description: str,
    domain: str = "general",
    api_key: Optional[str] = None,
) -> str:
    """
    Generate a plain English explanation for a behavior flag.
    Falls back to technical description if LangChain unavailable
    or API key not set.
    """
    if not LANGCHAIN_AVAILABLE or EXPLAINER_PROMPT is None:
        return technical_description

    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return technical_description

    try:
        llm = ChatAnthropic(
            model="claude-sonnet-4-20250514",
            api_key=key,
            max_tokens=200,
            temperature=0.3,
        )
        chain = EXPLAINER_PROMPT | llm
        result = chain.invoke(
            {
                "category": category,
                "severity": severity,
                "layer": layer,
                "total_layers": total_layers,
                "bci": bci,
                "technical_description": technical_description,
                "domain": domain,
            }
        )
        content = getattr(result, "content", None)
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts = []
            for block in content:
                if isinstance(block, dict) and "text" in block:
                    parts.append(block["text"])
                elif hasattr(block, "text"):
                    parts.append(block.text)
            return "".join(parts).strip()
        return technical_description
    except Exception as e:  # noqa: BLE001
        print(f"[neuron] Explainer failed: {e}")
        return technical_description


def explain_flags_batch(
    flags: list[dict[str, Any]],
    bci: float,
    domain: str = "general",
    api_key: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Add plain_explanation to each flag dict.
    Returns flags with explanation added.
    Safe — never raises, always returns original flags on error.
    """
    explained: list[dict[str, Any]] = []
    for flag in flags:
        try:
            layers = flag.get("affected_layers") or []
            layer0 = int(layers[0]) if layers else 0
            explanation = explain_flag(
                category=str(flag.get("risk_category", "")),
                severity=str(flag.get("risk_level", "LOW")),
                layer=layer0,
                total_layers=int(flag.get("total_layers", 12)),
                bci=bci,
                technical_description=str(flag.get("description", "")),
                domain=domain,
                api_key=api_key,
            )
            explained.append({**flag, "plain_explanation": explanation})
        except Exception:  # noqa: BLE001
            explained.append({**flag, "plain_explanation": flag.get("description", "")})
    return explained
