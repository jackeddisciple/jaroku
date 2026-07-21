"""TOOLS is the single list the graph binds and the runner introspects."""

from .notes import current_time, word_count

TOOLS = [current_time, word_count]

__all__ = ["TOOLS", "current_time", "word_count"]
