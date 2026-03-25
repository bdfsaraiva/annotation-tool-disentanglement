"""
In-process sliding-window rate limiter for FastAPI endpoints.

The ``RateLimiter`` class maintains a per-key ``deque`` of ``monotonic``
timestamps.  On each ``allow()`` call, expired entries (older than
``window_seconds``) are evicted from the left end of the deque; if the
remaining count is at or above ``max_requests`` the call is rejected.

State is stored in a plain dict protected by a threading ``Lock`` so the
limiter is safe for concurrent ASGI worker threads.  Because state is
in-memory it resets on server restart and is **not** shared across multiple
processes (e.g. Uvicorn workers), making it appropriate for single-process
deployments or as a soft guard against accidental hammering.

The companion ``enforce_rate_limit`` function integrates the limiter with a
FastAPI request object by keying on the client IP address, optionally
namespaced by a ``scope`` string so different endpoints can share a server
with independent limits.
"""
from __future__ import annotations

from collections import deque
from threading import Lock
import time
from typing import Deque, Dict, Tuple

from fastapi import HTTPException, Request, status


class RateLimiter:
    """
    Thread-safe sliding-window rate limiter.

    Each unique ``key`` string is tracked independently, so the same
    ``RateLimiter`` instance can enforce limits for many different clients
    simultaneously.

    Args:
        max_requests: Maximum number of allowed requests per window.
        window_seconds: Length of the sliding window in seconds.
    """

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._lock = Lock()
        # Maps an arbitrary key string to a deque of monotonic timestamps.
        self._requests: Dict[str, Deque[float]] = {}

    def allow(self, key: str) -> Tuple[bool, int]:
        """
        Check whether a request identified by ``key`` is within the rate limit.

        Expired timestamps are evicted from the deque before the check so the
        window truly slides rather than being fixed.

        Args:
            key: An arbitrary string that identifies the client/scope pair
                (e.g. ``"auth:127.0.0.1"``).

        Returns:
            A ``(allowed, retry_after)`` tuple where:
            - ``allowed`` is ``True`` if the request is within the limit.
            - ``retry_after`` is the number of seconds the caller should wait
              before retrying (``0`` when ``allowed`` is ``True``).
        """
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            timestamps = self._requests.setdefault(key, deque())
            # Evict timestamps that have fallen outside the current window.
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()
            if len(timestamps) >= self.max_requests:
                # Time until the oldest request ages out of the window.
                retry_after = max(1, int(timestamps[0] + self.window_seconds - now))
                return False, retry_after
            timestamps.append(now)
            return True, 0


def enforce_rate_limit(request: Request, limiter: RateLimiter, scope: str = "") -> None:
    """
    FastAPI helper that raises HTTP 429 if the rate limit is exceeded.

    The rate-limit key is ``"{scope}:{client_ip}"``, giving each endpoint
    scope its own independent counter per client IP.

    Args:
        request: The FastAPI ``Request`` object; the client IP is read from
            ``request.client.host``.
        limiter: The ``RateLimiter`` instance that owns the counter for this
            scope.
        scope: An optional namespace string (e.g. ``"auth"``) to prevent
            different endpoints from sharing a counter when they use the same
            ``RateLimiter`` instance.

    Raises:
        HTTPException: 429 with a ``Retry-After`` header if the limit is
            exceeded.
    """
    client_host = request.client.host if request.client else "unknown"
    key = f"{scope}:{client_host}"
    allowed, retry_after = limiter.allow(key)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )
