"""Frozen event schema (v1). Mirrors schema/events.md — keep the two in sync.

The interceptor builds ``Run``/``Step`` objects and serializes them into the transport
envelope: newline-delimited JSON on stdout, one event per line.
"""

from __future__ import annotations

import dataclasses
import json
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Literal, Optional

SCHEMA_VERSION = 1

RunStatus = Literal["running", "completed", "error"]
StepType = Literal["llm_call", "tool_call", "state_update", "router"]


def now_iso() -> str:
    """UTC ISO-8601 timestamp."""
    return datetime.now(timezone.utc).isoformat()


def _json_safe(value: Any) -> Any:
    """Best-effort convert arbitrary LangChain payloads to JSON-serializable data.

    Never raises: anything unserializable falls back to its ``repr``. The trace must
    never crash the agent it is observing.
    """
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v) for v in value]
    # LangChain messages / pydantic models often expose these.
    for attr in ("model_dump", "dict", "to_json"):
        fn = getattr(value, attr, None)
        if callable(fn):
            try:
                return _json_safe(fn())
            except Exception:
                pass
    try:
        json.dumps(value)
        return value
    except (TypeError, ValueError):
        return repr(value)


@dataclass
class Run:
    id: str
    agent_id: str
    provider: str
    model: str
    status: RunStatus = "running"
    started_at: str = field(default_factory=now_iso)
    ended_at: Optional[str] = None
    cost: float = 0.0
    tokens: int = 0
    error: Optional[str] = None


@dataclass
class Step:
    id: str
    run_id: str
    seq: int
    type: StepType
    name: str
    input: Any = None
    output: Any = None
    state_before: Any = None
    state_after: Any = None
    tokens: Optional[int] = None
    cost: Optional[float] = None
    latency_ms: float = 0.0
    error: Optional[str] = None
    parent_step_id: Optional[str] = None
    started_at: str = field(default_factory=now_iso)


def _clean(obj: Any) -> dict:
    d = asdict(obj)
    # Sanitize the free-form payload fields.
    for k in ("input", "output", "state_before", "state_after"):
        if k in d:
            d[k] = _json_safe(d[k])
    return d


def emit(kind: str, payload_key: str, obj: Any) -> None:
    """Serialize one event as a single JSON line to stdout, then flush.

    stdout is reserved exclusively for events; keep all logging on stderr.
    """
    envelope = {"kind": kind, "schema_version": SCHEMA_VERSION, payload_key: _clean(obj)}
    sys.stdout.write(json.dumps(envelope, default=str) + "\n")
    sys.stdout.flush()


def emit_run_start(run: Run) -> None:
    emit("run_start", "run", run)


def emit_step(step: Step) -> None:
    emit("step", "step", step)


def emit_run_end(run: Run) -> None:
    emit("run_end", "run", run)
