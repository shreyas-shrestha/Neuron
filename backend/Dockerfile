FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts

RUN pip install --no-cache-dir pip -U \
    && pip install --no-cache-dir . \
    && chmod +x ./scripts/start_backend.sh

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["./scripts/start_backend.sh"]
