"""Example agent — the reference implementation of the Jaroku agent contract.

Hand-written, and the only project under agents/ that is. It exists so that:
  * the runner, the stdout guard and the dry-run model have a zero-cost end-to-end test,
  * the generation system prompt has a concrete worked example to point at,
  * a fresh checkout has something to Run before anything has been generated.

Note what is NOT here: no jaroku imports, no model construction, no print(). This is plain
LangGraph you could copy out of the repo and run yourself.
"""

from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from .prompts import SYSTEM_PROMPT
from .tools import TOOLS


class AgentState(MessagesState):
    """MessagesState plus real domain state, so the state-diff view has something to show.

    `notes` accumulates each tool's output. A plain (unannotated) field: nodes return the
    full new list rather than a delta, which is the simplest correct thing.
    """

    notes: list[str]


def build_graph(llm):
    """Compile the agent. `llm` arrives already configured — never construct one here."""
    model = llm.bind_tools(TOOLS)

    def call_model(state: AgentState):
        messages = state["messages"]
        # Prepend the system prompt once, on the first turn only.
        if not any(isinstance(m, SystemMessage) for m in messages):
            messages = [SystemMessage(SYSTEM_PROMPT), *messages]
        return {"messages": [model.invoke(messages)]}

    def record_note(state: AgentState):
        """Fold the most recent tool output into `notes` — a visible state mutation."""
        last = state["messages"][-1]
        notes = list(state.get("notes") or [])
        if isinstance(last, ToolMessage):
            notes.append(f"{last.name}: {last.content}")
        return {"notes": notes}

    def should_continue(state: AgentState) -> str:
        last = state["messages"][-1]
        return "tools" if getattr(last, "tool_calls", None) else END

    graph = StateGraph(AgentState)
    graph.add_node("agent", call_model)
    graph.add_node("tools", ToolNode(TOOLS))
    graph.add_node("record_note", record_note)

    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    graph.add_edge("tools", "record_note")
    graph.add_edge("record_note", "agent")
    return graph.compile()


def build_initial_state(user_input: str) -> dict:
    return {"messages": [HumanMessage(user_input)], "notes": []}
