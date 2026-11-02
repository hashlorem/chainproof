"""Timestamps for people: the same "1 Nov 2026, 07:51:05 UTC" the web app shows (formatTs)."""

from datetime import datetime, timezone


def utc_text(ts) -> str:
    """'2026-11-01T07:51:05.926809Z' (or a datetime) -> '1 Nov 2026, 07:51:05 UTC'. Unparseable values come back as given."""
    if not ts:
        return "—"
    try:
        d = ts if isinstance(ts, datetime) else datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        return str(ts)
    d = d.astimezone(timezone.utc) if d.tzinfo else d
    return f"{d.day} {d:%b %Y, %H:%M:%S} UTC"
