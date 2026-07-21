// The generation system prompt — the product's core (doc §8: "the system prompt and project
// template are your product sense — own them").
//
// Every hard rule below exists because violating it breaks something specific in the trace
// pipeline:
//   rule 1 (no jaroku import)  -> keeps generated projects portable, and keeps trace wiring
//                                 in code we reviewed once rather than re-rolled per generation
//   rule 2 (no model construction) -> makes the provider dropdown work without regenerating
//   rule 3 (no stdout)         -> stdout IS the event transport (schema/events.md)
//   rule 5 (must terminate)    -> a non-terminating graph burns the recursion limit and money
//   rule 6 (templates verbatim)-> a reviewed connector must not be silently rewritten
//
// Rule 3 is additionally enforced at runtime by jaroku_runner.guard — the prompt asks, the
// runner guarantees. Prompts are requests, not invariants.
//
// CACHING: buildSystemPrompt() must be byte-identical across generations or the cache never
// hits. That is why ALL connector signatures are included here regardless of which the user
// selected — the selection is volatile and goes in the user message instead.

import type { Connector } from "./connectors.ts";

export interface GenerationRequest {
  prompt: string;
  agentId: string;
  agentName: string;
  connectors: Connector[];
}

const WORKED_EXAMPLE = `<<<FILE path="agent.py">>>
"""Notes agent."""
from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

from .prompts import SYSTEM_PROMPT
from .tools import TOOLS


class AgentState(MessagesState):
    notes: list[str]


def build_graph(llm):
    model = llm.bind_tools(TOOLS)

    def call_model(state: AgentState):
        messages = state["messages"]
        if not any(isinstance(m, SystemMessage) for m in messages):
            messages = [SystemMessage(SYSTEM_PROMPT), *messages]
        return {"messages": [model.invoke(messages)]}

    def record_note(state: AgentState):
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
<<<ENDFILE>>>
<<<FILE path="tools/__init__.py">>>
from .notes import current_time

TOOLS = [current_time]

__all__ = ["TOOLS", "current_time"]
<<<ENDFILE>>>
<<<FILE path="tools/notes.py">>>
from __future__ import annotations

from datetime import datetime, timezone

from langchain_core.tools import tool


@tool
def current_time(timezone_name: str = "UTC") -> str:
    """Return the current date and time. \`timezone_name\` is an IANA name."""
    if timezone_name.upper() == "UTC":
        return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo(timezone_name)).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return f"Unknown timezone {timezone_name!r}. Try 'UTC' or e.g. 'Europe/Paris'."
<<<ENDFILE>>>
<<<FILE path="prompts/__init__.py">>>
from pathlib import Path

SYSTEM_PROMPT = (Path(__file__).parent / "system.md").read_text(encoding="utf-8").strip()

__all__ = ["SYSTEM_PROMPT"]
<<<ENDFILE>>>
<<<FILE path="prompts/system.md">>>
You are a concise assistant that can report the current time.

Use \`current_time\` when the user asks about the date or time. Otherwise answer directly.
Keep replies to a sentence or two.
<<<ENDFILE>>>`;

function renderConnectorReference(connectors: Connector[]): string {
  return connectors
    .map((c) => {
      const tools = c.tools
        .map((t) => `    ${t.signature}\n        ${t.summary}`)
        .join("\n");
      return [
        `  ${c.id}  (file will exist at tools/${c.file})`,
        `    ${c.description}`,
        `    import like: from .${c.module} import ${c.tools.map((t) => t.name).join(", ")}`,
        `    requires env: ${c.required_env.join(", ")}`,
        tools,
      ].join("\n");
    })
    .join("\n\n");
}

/**
 * The stable, cacheable prefix. Must not vary between generations — no timestamps, no
 * request-specific content, connectors always rendered in full catalog order.
 */
export function buildSystemPrompt(allConnectors: Connector[]): string {
  return `You generate complete, runnable LangGraph agent projects. You output files and nothing else.

OUTPUT FORMAT — exact, no deviation:
<<<FILE path="agent.py">>>
...file contents...
<<<ENDFILE>>>
Repeat per file. No prose, no explanation, no markdown fences, before, between or after files.

THE CONTRACT — agent.py MUST define exactly these three, and nothing may replace them:
  TOOLS: list                            # every tool the graph can call
  def build_graph(llm): ...              # returns a COMPILED graph
  def build_initial_state(user_input: str) -> dict

HARD RULES:
1. NEVER import jaroku_interceptor, JarokuTracer, or anything named jaroku. The host handles
   tracing. Code that imports it will be rejected.
2. NEVER construct a model. Do not import ChatAnthropic/ChatOpenAI. \`llm\` is passed to
   build_graph already configured. Call llm.bind_tools(TOOLS) inside build_graph.
3. NEVER write to stdout. No print(). stdout is a reserved channel and any byte you write
   there corrupts it. Log to stderr only: print(..., file=sys.stderr).
4. Read secrets ONLY from os.environ. Never hardcode a credential, never invent a default
   value for one. Every key you read must appear in .env.example.
5. The graph MUST terminate. Every conditional edge needs a path to END.
6. Use the connector templates EXACTLY as given — import them, do not rewrite, re-implement,
   or "improve" them. Their files are placed into the project for you; do NOT emit them.
7. Tools return strings. On an expected failure (bad input, API 4xx, empty result) RETURN a
   clear error string; do not raise. Let genuine programming errors raise — they become
   traced errors.
8. Every @tool needs a typed signature and a docstring: the model reads the docstring to
   decide when to call it, and the host derives dry-run arguments from the type hints.
9. NEVER call one @tool from inside another. A decorated tool is a StructuredTool object,
   not a function — calling it raises "TypeError: 'StructuredTool' object is not callable".
   If two tools share logic, put that logic in a PLAIN function (no @tool) and have both
   call it. Prefer giving the agent both tools and letting it sequence them itself.
10. NEVER build SQL by interpolating values into the string (no f-strings, no .format, no
   concatenation). That is an injection vector even against a read-only connector, because
   it lets a crafted input widen a query to rows the user should not see. Write a static
   query, or pass a WHERE value the caller supplied as a separate documented argument.

STATE: use MessagesState when the agent is just chat + tools. When the task has real domain
state (fetched records, a draft, a counter), declare \`class AgentState(MessagesState)\` with
annotated fields and use it — the host renders before/after state diffs and empty diffs are
useless.

SHAPE: prefer one llm node + one ToolNode + one conditional edge. This is the shape the
tracer is verified against. Add nodes only when the task genuinely needs them.

FILES TO EMIT: agent.py, tools/__init__.py, one tools/<name>.py per bespoke tool,
prompts/__init__.py, prompts/system.md, .env.example, README.md.
Do NOT emit jaroku.json or pyproject.toml — the host writes those.
Do NOT emit any connector file listed below — the host copies those in.

AVAILABLE CONNECTORS (reviewed, copied in verbatim when selected):

${renderConnectorReference(allConnectors)}

WORKED EXAMPLE — a complete, valid response for "an agent that can tell me the time":

${WORKED_EXAMPLE}`;
}

/** The volatile half: everything specific to this request, after the cache breakpoint. */
export function buildUserPrompt(req: GenerationRequest): string {
  const selected = req.connectors.length
    ? req.connectors
        .map(
          (c) =>
            `  - ${c.id}: import from .${c.module} — ${c.tools
              .map((t) => t.name)
              .join(", ")} (file tools/${c.file} will exist; do not emit it)`,
        )
        .join("\n")
    : "  (none — write any tools this agent needs yourself)";

  const env = req.connectors.flatMap((c) => c.required_env);
  const envNote = env.length
    ? `\nThese connector env keys must appear in .env.example: ${env.join(", ")}`
    : "";

  return `Build this agent:

${req.prompt}

Package name (already created): ${req.agentId}
Human-readable name: ${req.agentName}

Selected connectors:
${selected}${envNote}

Emit the files now, starting with agent.py. Output files only — no commentary.`;
}
