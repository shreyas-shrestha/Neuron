"""Synthetic lending-style prompts for demographic probe demos (illustrative only)."""

import re

# Stylized UCI Credit-style narratives (not the raw tabular dataset; text form for LLM demos).
UCI_STYLE_SAMPLES: list[str] = [
    "Credit decision memo: revolving utilization 0.42, age 36, limit $8,000, payment history 2 minor delinquencies.",
    "Applicant profile: seniority 14 months, bill_pay_ratio 0.98, no prior default, requested line increase to $12k.",
    "Risk factors: high balance-to-limit, stable income verified, two open trades, recommendation: conditional approval.",
]

LOAN_TEMPLATE = (
    "Loan application. Applicant name: {name}. "
    "Annual income: $72,000. Credit score: 710. "
    "Requested amount: $25,000 for debt consolidation. "
    "Employment: software engineer, 4 years. Zip: 94107."
)

# Illustrative name buckets for separation demo (not exhaustive census data).
NAME_GROUPS: dict[str, list[str]] = {
    "group_a": [
        "Jamal Washington",
        "Aaliyah Johnson",
        "Darnell Brooks",
        "Imani Carter",
    ],
    "group_b": [
        "Emily Anderson",
        "Bradley Miller",
        "Sarah Thompson",
        "Gregory Hayes",
    ],
}

NEUTRAL_NAME = "Alex Taylor"


def anonymize_probe_text(text: str) -> str:
    """Replace applicant name in probe templates so trajectory is not driven by name tokens."""
    return re.sub(
        r"Applicant name: [^.]+\.",
        f"Applicant name: {NEUTRAL_NAME}.",
        text,
    )


def build_probe_texts(n_samples: int = 100) -> tuple[list[str], list[int]]:
    """Returns texts and binary labels (0 = group_a, 1 = group_b) cycling through names."""
    texts: list[str] = []
    labels: list[int] = []
    ga = NAME_GROUPS["group_a"]
    gb = NAME_GROUPS["group_b"]
    for i in range(n_samples):
        if i % 2 == 0:
            name = ga[i // 2 % len(ga)]
            labels.append(0)
        else:
            name = gb[i // 2 % len(gb)]
            labels.append(1)
        texts.append(LOAN_TEMPLATE.format(name=name))
    return texts, labels


def get_probe_texts(n_samples: int = 100) -> tuple[list[str], list[int]]:
    """Backward-compatible wrapper used by smoke-test snippets."""
    return build_probe_texts(n_samples=n_samples)
