import re

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

NAME_GROUPS: dict[str, list[str]] = {
    "group_a": [
        "Applicant_Profile_Alpha_01",
        "Applicant_Profile_Alpha_02",
        "Applicant_Profile_Alpha_03",
        "Applicant_Profile_Alpha_04",
    ],
    "group_b": [
        "Applicant_Profile_Beta_01",
        "Applicant_Profile_Beta_02",
        "Applicant_Profile_Beta_03",
        "Applicant_Profile_Beta_04",
    ],
}

NEUTRAL_NAME = "Applicant_Profile_Neutral"


def anonymize_probe_text(text: str) -> str:
    return re.sub(
        r"Applicant name: [^.]+\.",
        f"Applicant name: {NEUTRAL_NAME}.",
        text,
    )


def build_probe_texts(n_samples: int = 100) -> tuple[list[str], list[int]]:
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
    return build_probe_texts(n_samples=n_samples)
