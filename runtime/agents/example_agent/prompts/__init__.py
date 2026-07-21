"""Loads the agent's system prompt from system.md.

The prompt is a text file, not a Python string literal, so editing it is a clean one-file
diff (for the conversational editing that comes later) and non-programmers can change behaviour
without touching code. Read once at import.
"""

from pathlib import Path

SYSTEM_PROMPT = (Path(__file__).parent / "system.md").read_text(encoding="utf-8").strip()

__all__ = ["SYSTEM_PROMPT"]
