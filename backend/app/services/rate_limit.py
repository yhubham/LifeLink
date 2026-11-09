"""In-process limiter for repeated authentication failures.

LifeLink runs the API as a single process, so a small thread-safe map is
enough to blunt PIN guessing. A multi-worker deployment should swap the
storage for Redis; the call sites only depend on this small interface.
"""

from __future__ import annotations

import math
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field

DEFAULT_MAX_ATTEMPTS = 5
DEFAULT_WINDOW_SECONDS = 15 * 60
DEFAULT_MAX_KEYS = 4096


@dataclass
class _Bucket:
    failures: list[float] = field(default_factory=list)


class AttemptLimiter:
    """Count failures per key inside a sliding window.

    Once ``max_attempts`` failures happen within ``window_seconds``, the key
    is locked until the oldest failure falls out of the window. Successful
    authentication should call :meth:`reset` so a legitimate user is never
    punished for earlier typos.
    """

    def __init__(
        self,
        max_attempts: int = DEFAULT_MAX_ATTEMPTS,
        window_seconds: int = DEFAULT_WINDOW_SECONDS,
        clock: Callable[[], float] = time.monotonic,
        max_keys: int = DEFAULT_MAX_KEYS,
    ) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        self._clock = clock
        self._lock = threading.Lock()
        self._buckets: dict[str, _Bucket] = {}

    def _prune(self, bucket: _Bucket, now: float) -> None:
        cutoff = now - self.window_seconds
        if bucket.failures and bucket.failures[0] <= cutoff:
            bucket.failures = [stamp for stamp in bucket.failures if stamp > cutoff]

    def _shrink(self, now: float) -> None:
        if len(self._buckets) <= self.max_keys:
            return
        for key in list(self._buckets):
            bucket = self._buckets[key]
            self._prune(bucket, now)
            if not bucket.failures:
                del self._buckets[key]
        overflow = len(self._buckets) - self.max_keys
        if overflow > 0:
            for key in list(self._buckets)[:overflow]:
                del self._buckets[key]

    def retry_after(self, key: str) -> int:
        """Seconds until ``key`` may be attempted again, or 0 when allowed."""
        now = self._clock()
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                return 0
            self._prune(bucket, now)
            if len(bucket.failures) < self.max_attempts:
                return 0
            return max(1, math.ceil(bucket.failures[0] + self.window_seconds - now))

    def record_failure(self, key: str) -> None:
        now = self._clock()
        with self._lock:
            bucket = self._buckets.setdefault(key, _Bucket())
            self._prune(bucket, now)
            bucket.failures.append(now)
            self._shrink(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._buckets.pop(key, None)

    def reset_all(self) -> None:
        """Clear every bucket (tests and administrative resets)."""
        with self._lock:
            self._buckets.clear()
