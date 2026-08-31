"""Lightweight, in-process abuse guards for the public demo.

These exist to keep a stray script or a bored visitor from burning through
the OpenAI credit behind the hosted demo. They are deliberately simple:
one uvicorn worker, state in memory, reset on restart. That is enough for a
portfolio demo; a real deployment would use a shared store (e.g. Redis).
"""

from __future__ import annotations

import time
from collections import defaultdict


class RateLimiter:
    """Fixed-cost sliding-window limiter keyed by an arbitrary string (IP)."""

    def __init__(self, max_per_minute: int) -> None:
        self._max = max_per_minute
        self._window = 60.0
        self._hits: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str, *, now: float | None = None) -> bool:
        """Record a hit for ``key`` and report whether it is within the limit."""
        current = time.monotonic() if now is None else now
        recent = [t for t in self._hits[key] if current - t < self._window]
        if len(recent) >= self._max:
            self._hits[key] = recent
            return False
        recent.append(current)
        self._hits[key] = recent
        return True


def client_ip(x_forwarded_for: str | None, direct: str | None) -> str:
    """Best-effort client IP.

    Behind Render / Vercel the real address is the first entry of
    ``X-Forwarded-For``; locally there is no such header and we fall back to
    the socket peer.
    """
    if x_forwarded_for:
        first = x_forwarded_for.split(",")[0].strip()
        if first:
            return first
    return direct or "unknown"
