from __future__ import annotations

import threading

from app.interpretability.trajectory import LayerTrajectoryTracker

_TRACKERS: dict[str, LayerTrajectoryTracker] = {}
_LOCK = threading.Lock()


def get_tracker(hf_id: str, sae_paths: dict[int, str] | None = None) -> LayerTrajectoryTracker:
    key = hf_id + str(sorted((sae_paths or {}).items()))
    with _LOCK:
        if key not in _TRACKERS:
            _TRACKERS[key] = LayerTrajectoryTracker(
                model_name=hf_id,
                sae_checkpoints=sae_paths,
            )
        return _TRACKERS[key]


def clear_tracker_cache() -> None:
    with _LOCK:
        _TRACKERS.clear()
