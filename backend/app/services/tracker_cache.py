from __future__ import annotations

import os
import threading
import time
from collections import OrderedDict

import torch

from app.interpretability.trajectory import LayerTrajectoryTracker

_MAX_CACHED_TRACKERS = int(os.environ.get("NEURON_MAX_MODEL_CACHE", "2"))


class _LRUTrackerCache:
    def __init__(self, maxsize: int) -> None:
        self._cache: OrderedDict[str, tuple[LayerTrajectoryTracker, float]] = OrderedDict()
        self._maxsize = maxsize
        self._lock = threading.Lock()

    def get(self, key: str) -> LayerTrajectoryTracker | None:
        with self._lock:
            if key not in self._cache:
                return None
            self._cache.move_to_end(key)
            tracker, _ = self._cache[key]
            return tracker

    def set(self, key: str, tracker: LayerTrajectoryTracker) -> None:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                self._cache[key] = (tracker, time.monotonic())
                return
            while len(self._cache) >= self._maxsize and self._cache:
                _, (evicted, _) = self._cache.popitem(last=False)
                del evicted
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            self._cache[key] = (tracker, time.monotonic())

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()


_CACHE = _LRUTrackerCache(_MAX_CACHED_TRACKERS)


def get_tracker(hf_id: str, sae_paths: dict[int, str] | None = None) -> LayerTrajectoryTracker:
    key = hf_id + str(sorted((sae_paths or {}).items()))
    tracker = _CACHE.get(key)
    if tracker is None:
        tracker = LayerTrajectoryTracker(
            model_name=hf_id,
            sae_checkpoints=sae_paths,
        )
        _CACHE.set(key, tracker)
    return tracker


def clear_tracker_cache() -> None:
    _CACHE.clear()
