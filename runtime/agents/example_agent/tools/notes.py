"""Two dependency-free utility tools.

Shape every generated tool follows: typed signature, docstring the model reads to decide
when to call it, returns a string, and turns expected failures into a returned message
rather than an exception.
"""

from __future__ import annotations

from datetime import datetime, timezone

from langchain_core.tools import tool


@tool
def current_time(timezone_name: str = "UTC") -> str:
    """Return the current date and time. `timezone_name` is an IANA name, e.g. 'Europe/Paris'."""
    if timezone_name.upper() == "UTC":
        return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    try:
        from zoneinfo import ZoneInfo

        now = datetime.now(ZoneInfo(timezone_name))
    except Exception:
        # Expected failure (a bad timezone name) — return it, don't raise.
        return f"Unknown timezone {timezone_name!r}. Try 'UTC' or an IANA name like 'Europe/Paris'."
    return now.strftime(f"%Y-%m-%d %H:%M:%S {timezone_name}")


@tool
def word_count(text: str) -> str:
    """Count the words and characters in `text`."""
    words = len(text.split())
    return f"{words} word(s), {len(text)} character(s)."
