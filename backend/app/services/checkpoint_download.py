from __future__ import annotations

import hashlib
import logging
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

_log = logging.getLogger(__name__)


def download_url_to_path(
    url: str,
    dest: Path,
    *,
    expected_sha256_hex: Optional[str] = None,
    max_retries: int = 5,
    timeout_sec: float = 120.0,
    chunk_size: int = 8 * 1024 * 1024,
) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_suffix(dest.suffix + ".partial")
    last_err: Exception | None = None
    for attempt in range(max_retries):
        try:
            if partial.exists():
                partial.unlink()
            req = urllib.request.Request(url, headers={"User-Agent": "NeuronCheckpoint/1.0"})
            hasher = hashlib.sha256() if expected_sha256_hex else None
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                with open(partial, "wb") as out:
                    while True:
                        chunk = resp.read(chunk_size)
                        if not chunk:
                            break
                        out.write(chunk)
                        if hasher:
                            hasher.update(chunk)
            if expected_sha256_hex:
                digest = hasher.hexdigest() if hasher else ""
                if digest.lower() != expected_sha256_hex.strip().lower():
                    raise ValueError(f"SHA-256 mismatch for {url}")
            partial.replace(dest)
            return
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
            last_err = e
            _log.warning("Download attempt %s/%s failed: %s", attempt + 1, max_retries, e)
            if attempt < max_retries - 1:
                time.sleep(min(2**attempt, 30))
    assert last_err is not None
    raise last_err
