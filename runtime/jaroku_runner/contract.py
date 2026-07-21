"""The generated-agent contract: load a generated module and prove it is runnable.

A generated project is text a model wrote. Before we hand it to LangGraph we check it
exposes exactly what the runner needs, and fail with a message that says which symbol is
missing rather than an AttributeError three frames deep.

The contract — the three symbols a generated agent must expose:

    TOOLS: list                               every @tool the graph can call
    build_graph(llm) -> CompiledGraph         llm is INJECTED, never constructed here
    build_initial_state(user_input) -> dict   the graph's starting state

Deliberately *not* in the contract: anything Jaroku. A generated agent that imports
jaroku_interceptor is rejected at generation time (server-side validation) precisely so the
user's project stays portable standard LangGraph.
"""

from __future__ import annotations

import importlib
import re
from types import ModuleType
from typing import Any

# Generated ids come from the server, but this module is also runnable by hand, and the id
# becomes an import path — so it is validated here rather than trusted.
_SAFE_AGENT_ID = re.compile(r"^[a-z][a-z0-9_]{0,63}$")

REQUIRED_CALLABLES = ("build_graph", "build_initial_state")


class ContractError(Exception):
    """A generated project does not satisfy the runner contract."""


def validate_agent_id(agent_id: str) -> str:
    if not _SAFE_AGENT_ID.match(agent_id or ""):
        raise ContractError(
            f"invalid agent id {agent_id!r}: expected lowercase letters, digits and "
            "underscores, starting with a letter"
        )
    return agent_id


def load_agent(agent_id: str) -> ModuleType:
    """Import ``agents.<agent_id>.agent`` and verify the contract."""
    validate_agent_id(agent_id)
    module_path = f"agents.{agent_id}.agent"
    try:
        module = importlib.import_module(module_path)
    except ModuleNotFoundError as exc:
        raise ContractError(f"cannot import {module_path}: {exc}") from exc

    missing = [name for name in REQUIRED_CALLABLES if not callable(getattr(module, name, None))]
    if not isinstance(getattr(module, "TOOLS", None), (list, tuple)):
        missing.append("TOOLS (list)")
    if missing:
        raise ContractError(
            f"{module_path} does not satisfy the agent contract; missing: {', '.join(missing)}"
        )
    return module


def tools_of(module: ModuleType) -> list[Any]:
    return list(module.TOOLS)
