"""Reviewed connector templates — the MVP subset of the eventual connector library.

These files are hand-written and verified once (auth flow, error handling, blast radius),
then copied byte-for-byte into generated projects. The builder model sees only the
signatures in catalog.json and is forbidden from rewriting them, so a reviewed connector
cannot be silently mangled by a generation.

catalog.json is the machine-readable index the Node builder reads. check_catalog() proves
it still matches the Python, so the two cannot drift unnoticed.
"""

from __future__ import annotations

import json
from pathlib import Path

CATALOG_PATH = Path(__file__).parent / "catalog.json"
CATALOG = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
CONNECTORS = {c["id"]: c for c in CATALOG["connectors"]}


def required_env(connector_ids) -> list[str]:
    """Union of the env vars the given connectors need, in stable order."""
    seen: list[str] = []
    for cid in connector_ids:
        for key in CONNECTORS.get(cid, {}).get("required_env", []):
            if key not in seen:
                seen.append(key)
    return seen


def check_catalog() -> list[str]:
    """Verify catalog.json matches the modules. Returns a list of problems (empty = good)."""
    import importlib

    problems: list[str] = []
    for cid, entry in CONNECTORS.items():
        if not (Path(__file__).parent / entry["file"]).exists():
            problems.append(f"{cid}: missing file {entry['file']}")
            continue

        module = importlib.import_module(f"{__name__}.{entry['module']}")

        declared = set(entry["required_env"])
        actual = set(getattr(module, "REQUIRED_ENV", []))
        if declared != actual:
            problems.append(
                f"{cid}: required_env mismatch — catalog {sorted(declared)} "
                f"vs module {sorted(actual)}"
            )

        catalog_tools = {t["name"] for t in entry["tools"]}
        module_tools = {t.name for t in getattr(module, "TEMPLATE_TOOLS", [])}
        if catalog_tools != module_tools:
            problems.append(
                f"{cid}: tool names mismatch — catalog {sorted(catalog_tools)} "
                f"vs module {sorted(module_tools)}"
            )
    return problems


__all__ = ["CATALOG", "CONNECTORS", "required_env", "check_catalog"]
