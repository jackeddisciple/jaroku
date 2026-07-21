# Example Agent

Reference implementation of the Jaroku agent contract. A small LangGraph agent with two
dependency-free tools (`current_time`, `word_count`) and a custom `notes` state field.

## The contract

`agent.py` exposes exactly three things, and the Jaroku runner needs nothing else:

```python
TOOLS: list                               # every tool the graph can call
build_graph(llm) -> CompiledGraph         # llm is injected, never constructed here
build_initial_state(user_input) -> dict   # the graph's starting state
```

This project imports nothing from Jaroku. Tracing, model selection and the run envelope are
all supplied by the host, which is why the same code runs unchanged on the free dry-run
model, on Claude, or on GPT.

## Run it

Inside Jaroku: pick it in the sidebar and press Run.

From the terminal (from `runtime/`):

```bash
uv run python -m jaroku_runner example_agent "What time is it in Europe/Paris?"
```

Events (JSON, one per line) go to stdout; logs go to stderr. To use a real provider:

```bash
JAROKU_PROVIDER=anthropic JAROKU_MODEL=claude-haiku-4-5 \
  uv run python -m jaroku_runner example_agent "How many words are in this sentence?"
```

## Structure

| Path | What it is |
|---|---|
| `agent.py` | Graph, nodes, state. The contract lives here. |
| `tools/` | One module per tool topic; `__init__.py` exports `TOOLS`. |
| `prompts/system.md` | The agent's system prompt, as editable text. |
| `jaroku.json` | Jaroku metadata: connectors, required env, defaults. |
