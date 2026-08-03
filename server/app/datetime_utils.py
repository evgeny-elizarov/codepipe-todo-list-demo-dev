"""Datetime normalisation for the SQLite round-trip.

SQLite has no timezone-aware column type: an aware ``datetime`` goes in and a
naive one comes back out, serialised without any zone marker. In the browser
``new Date("2026-01-01T10:00:00")`` is parsed as *local* time, so every
last-write-wins comparison on ``lastSave`` would silently drift by the client's
UTC offset.

The fix is to normalise on both edges: everything stored is naive UTC, and
everything serialised carries an explicit ``Z``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Union


def to_naive_utc(value: Union[datetime, str, None]) -> Optional[datetime]:
    """Parse an incoming datetime (or ISO 8601 string) and normalise to naive UTC.

    Naive input is assumed to already be UTC.
    """
    if value is None:
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def to_iso_z(value: Optional[datetime]) -> Optional[str]:
    """Serialise a naive-UTC datetime as an explicit ISO 8601 UTC string."""
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
