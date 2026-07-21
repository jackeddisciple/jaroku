"""Jaroku runner — runs generated LangGraph agents and owns all trace wiring.

Generated agents are pure LangGraph and import nothing from Jaroku. This package supplies
everything trace-shaped around them: the stdout guard, provider selection, the schema-driven
dry-run model, the contract check, and the run_start/run_end envelope.
"""

from .contract import ContractError, load_agent
from .fake import build_dry_run_model
from .guard import install_stdout_guard
from .models import build_model

__all__ = [
    "ContractError",
    "load_agent",
    "build_dry_run_model",
    "install_stdout_guard",
    "build_model",
]
