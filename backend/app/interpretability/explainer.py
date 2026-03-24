"""
Uses LangChain + Claude to generate plain-English explanations
of behavior flags for non-technical stakeholders.
"""

from __future__ import annotations

import os
import re
from typing import Any, Optional

from better_profanity import profanity

try:
    from langchain_anthropic import ChatAnthropic
    from langchain_core.prompts import ChatPromptTemplate

    LANGCHAIN_AVAILABLE = True
    EXPLAINER_PROMPT = ChatPromptTemplate.from_template(
        """
You are an AI Safety Researcher performing mechanistic interpretability analysis.
Your job is to classify the semantic meaning of latent feature vectors based on their activating tokens.

CRITICAL INSTRUCTIONS:
1. Maintain a strictly clinical, academic, and objective tone.
2. Do not repeat or output any sensitive, toxic, or explicit language.
3. Abstract the tokens into high-level concepts (e.g., instead of quoting slurs, write "derogatory language targeting specific demographics").

EXAMPLES:
- Activating Tokens: ["gun", "shoot", "[PROFANITY/SENSITIVE_TOKEN]", "kill"]
- Explanation: "The internal representation has shifted toward concepts of physical violence and hostility."

- Activating Tokens: ["scam", "wire", "password", "steal"]
- Explanation: "The feature distribution now strongly activates on concepts related to financial fraud and social engineering."

ANALYSIS TASK:
- Flag category: {category}
- Layer: {layer} of {total_layers}
- Severity: {severity}
- BCI: {bci:.1f}
- Technical Description & Tokens: {technical_description}
- Domain: {domain}

Write a 2-3 sentence plain-English explanation for an engineering team describing what concept this feature represents and why it triggered an alert. Do not use terms like "activation", "latent space", or "embedding".
"""
    )
except ImportError:
    LANGCHAIN_AVAILABLE = False
    EXPLAINER_PROMPT = None

_SENSITIVE_PLACEHOLDER = "[PROFANITY/SENSITIVE_TOKEN]"

API_REFUSAL_FALLBACK = (
    "Feature analysis blocked by API safety filters. The representation drifted toward highly sensitive or toxic concepts."
)

EXPLAINER_ERROR_FALLBACK = (
    "Unable to generate a plain-language summary for this flag. See the technical description in the dashboard."
)


def sanitize_text(text: str) -> str:
    """
    Mask profanity before sending text to the LLM. better_profanity uses a single-character
    censor pattern; we normalize repeated mask characters to an explicit placeholder token.
    """
    if not text:
        return text
    censored = profanity.censor(text)
    return re.sub(r"\*{2,}", _SENSITIVE_PLACEHOLDER, censored)


def _extract_message_content(result: Any) -> str:
    content = getattr(result, "content", None)
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and "text" in block:
                parts.append(str(block["text"]))
            elif hasattr(block, "text"):
                parts.append(str(block.text))
        return "".join(parts).strip()
    return ""


def _is_api_refusal(text: str) -> bool:
    t = text.lower()
    return any(
        phrase in t
        for phrase in (
            "i cannot fulfill",
            "i apologize",
            "i cannot assist",
        )
    )


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
    Falls back to sanitized technical description if LangChain unavailable
    or API key not set.
    """
    safe_technical_description = sanitize_text(technical_description)

    if not LANGCHAIN_AVAILABLE or EXPLAINER_PROMPT is None:
        return safe_technical_description

    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return safe_technical_description

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
                "technical_description": safe_technical_description,
                "domain": domain,
            }
        )
        text_out = _extract_message_content(result)
        if not text_out:
            return safe_technical_description
        if _is_api_refusal(text_out):
            return API_REFUSAL_FALLBACK
        return text_out
    except Exception as e:  # noqa: BLE001
        print(f"[neuron] Explainer failed: {e}")
        return EXPLAINER_ERROR_FALLBACK


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
            raw_desc = str(flag.get("description", ""))
            explanation = explain_flag(
                category=str(flag.get("risk_category", "")),
                severity=str(flag.get("risk_level", "LOW")),
                layer=layer0,
                total_layers=int(flag.get("total_layers", 12)),
                bci=bci,
                technical_description=raw_desc,
                domain=domain,
                api_key=api_key,
            )
            explained.append({**flag, "plain_explanation": explanation})
        except Exception:  # noqa: BLE001
            explained.append(
                {**flag, "plain_explanation": sanitize_text(str(flag.get("description", "")))}
            )
    return explained
