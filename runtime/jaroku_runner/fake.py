"""Schema-driven dry-run model — the default provider for generated agents.

The hand-written fixture (test_agent) ships a hard-coded script because its two tools are
known at authoring time. A *generated* agent's tools are not, so its fake model is derived
from the agent itself: walk ``TOOLS``, read each tool's argument schema, synthesize one
call per tool with dummy arguments, then finish with a plain answer.

What that buys, for zero cost and zero API key:
  * every generated tool function actually executes (import errors, typos, bad decorators
    surface immediately),
  * the trace has real depth — llm_call / router / tool_call per tool — so the timeline and
    the state-diff view have something to show,
  * it is deterministic, so a trace can be diffed run over run.

It is a smoke test, not a simulation: arguments are placeholders, so a tool that hits a real
API will fail on the placeholder. That failure is captured as a traced step error, which is
itself useful — it proves the error path renders.
"""

from __future__ import annotations

from typing import Any, Sequence

from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, BaseMessage

# Placeholder string used wherever a tool wants free text. Recognizable in a trace, and
# obviously not real data, so nobody mistakes a dry run for a live result.
DRY_RUN_STRING = "jaroku-dry-run"

_BY_TYPE: dict[str, Any] = {
    "string": DRY_RUN_STRING,
    "integer": 1,
    "number": 1.0,
    "boolean": True,
    "array": [],
    "object": {},
    "null": None,
}


def _dummy_for(schema: dict) -> Any:
    """Synthesize one plausible value from a JSON-schema fragment.

    Preference order: an enum's first member (guaranteed valid), then the declared default
    (the tool author's own choice), then a value derived from the type.
    """
    enum = schema.get("enum")
    if enum:
        return enum[0]
    if "default" in schema and schema["default"] is not None:
        return schema["default"]

    declared = schema.get("type")
    if declared is None:
        # Optional[X] / Union[...] render as anyOf; take the first non-null branch.
        for alt in schema.get("anyOf") or schema.get("oneOf") or []:
            if alt.get("type") != "null":
                return _dummy_for(alt)
        return DRY_RUN_STRING
    if isinstance(declared, list):  # {"type": ["string", "null"]}
        declared = next((t for t in declared if t != "null"), "string")
    return _BY_TYPE.get(declared, DRY_RUN_STRING)


def dummy_args(tool: Any) -> dict[str, Any]:
    """Build a full argument dict for one tool. Never raises — a tool we cannot read
    still gets called, with no arguments, and the resulting error is traced."""
    try:
        return {name: _dummy_for(spec or {}) for name, spec in (tool.args or {}).items()}
    except Exception:
        return {}


def build_script(tools: Sequence[Any]) -> list[BaseMessage]:
    """One tool_call message per tool, then a final answer.

    Order matches ``TOOLS``. The trailing plain message is what lets the agent's conditional
    edge route to END — without it the graph would loop until the recursion limit.
    """
    script: list[BaseMessage] = []
    for i, tool in enumerate(tools):
        script.append(
            AIMessage(
                content="",
                tool_calls=[{
                    "name": tool.name,
                    "args": dummy_args(tool),
                    "id": f"jaroku_dry_run_{i}",
                }],
            )
        )

    names = ", ".join(getattr(t, "name", "?") for t in tools)
    summary = (
        f"Dry run complete. Exercised {len(tools)} tool(s): {names}."
        if tools
        else "Dry run complete. This agent declares no tools."
    )
    script.append(AIMessage(content=summary))
    return script


class DryRunChatModel(FakeMessagesListChatModel):
    """FakeMessagesListChatModel that tolerates ``.bind_tools()``.

    The generated-agent contract has ``build_graph(llm)`` call ``llm.bind_tools(TOOLS)`` —
    that is what makes the provider dropdown a one-line swap. The stock fake model raises
    NotImplementedError there, which would make the free path the only path a generated
    agent could *not* run on. Binding is a no-op here: the script is already fixed.
    """

    def bind_tools(self, tools: Sequence[Any], **kwargs: Any) -> "DryRunChatModel":
        return self


def build_dry_run_model(tools: Sequence[Any]) -> DryRunChatModel:
    return DryRunChatModel(responses=build_script(tools))
