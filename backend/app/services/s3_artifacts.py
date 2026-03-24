"""S3 presigned PUT URLs for large checkpoint artifacts (optional — requires boto3 + bucket config)."""

from __future__ import annotations

import uuid
from typing import Any

from app.core.config import settings


def artifacts_s3_configured() -> bool:
    return bool(settings.s3_artifacts_bucket and settings.aws_access_key_id and settings.aws_secret_access_key)


def presign_put_object(
    *,
    filename: str,
    content_type: str,
    expires_seconds: int = 3600,
) -> dict[str, Any]:
    if not artifacts_s3_configured():
        raise RuntimeError("S3 artifact uploads are not configured")
    try:
        import boto3
        from botocore.client import Config
    except ModuleNotFoundError as e:
        raise RuntimeError("boto3 is required for S3 presign. Install: pip install boto3") from e

    safe_name = filename.replace("\\", "/").split("/")[-1] or "artifact.bin"
    key = f"artifacts/{uuid.uuid4().hex}/{safe_name}"

    client = boto3.client(
        "s3",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        config=Config(signature_version="s3v4"),
    )
    url = client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.s3_artifacts_bucket,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=expires_seconds,
        HttpMethod="PUT",
    )
    return {
        "upload_url": url,
        "object_key": key,
        "bucket": settings.s3_artifacts_bucket,
        "expires_in": expires_seconds,
        "required_headers": {"Content-Type": content_type},
    }
