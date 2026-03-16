from __future__ import annotations

from collections import deque
from threading import Lock
import time
from typing import Deque, Dict, Tuple

from fastapi import HTTPException, Request, status


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._lock = Lock()
        self._requests: Dict[str, Deque[float]] = {}

    def allow(self, key: str) -> Tuple[bool, int]:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            timestamps = self._requests.setdefault(key, deque())
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()
            if len(timestamps) >= self.max_requests:
                retry_after = max(1, int(timestamps[0] + self.window_seconds - now))
                return False, retry_after
            timestamps.append(now)
            return True, 0


def enforce_rate_limit(request: Request, limiter: RateLimiter, scope: str = "") -> None:
    client_host = request.client.host if request.client else "unknown"
    key = f"{scope}:{client_host}"
    allowed, retry_after = limiter.allow(key)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )
