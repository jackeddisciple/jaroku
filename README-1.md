# Jaroku — Foundation (README-1)

> **Scope of this document:** a complete, step-by-step, deep-detail record of everything built
> and verified in the **foundation** milestone of the Jaroku build plan (see
> `jaroku-product-documentation (1).md`).
>
> **What this milestone delivers:** the *trace pipeline* — the single most important primitive in
> the product. A hand-written LangGraph agent runs, an interceptor captures every LLM/tool/state
> event into a frozen schema, a Node process manager reads that event stream, and the events are
> broadcast live to a browser over WebSocket **and** persisted to SQLite. **Zero product UI** —
> the goal is to prove the core is correct before anything is built on top of it.
>
> **Why the trace comes first (the ordering principle):** you cannot verify that a *generated*
> agent actually works without a trace of its execution. Building the debugger/trace pipeline
> first makes testing generation free. This is the doc's stated discipline: *"Debugger before
> generation."*

---

## Table of Contents

1. [The big picture — what runs, and in what order](#1-the-big-picture)
2. [Repository layout](#2-repository-layout)
3. [Toolchain & environment setup](#3-toolchain--environment-setup)
4. [The event schema — the frozen foundation](#4-the-event-schema)
5. [The Python runtime — test agent + interceptor](#5-the-python-runtime)
6. [The Node server — process manager, store, relay](#6-the-node-server)
7. [The debug client](#7-the-debug-client)
8. [End-to-end data flow, step by step](#8-end-to-end-data-flow)
9. [How to run everything](#9-how-to-run-everything)
10. [Verification & failure drills — what was tested and the results](#10-verification--failure-drills)
11. [Key engineering decisions and *why*](#11-key-engineering-decisions)
12. [Known limitations & what is deliberately deferred](#12-known-limitations--deferred-work)
13. [Glossary](#13-glossary)

---

## 1. The big picture

At the end of this milestone, this is the complete pipeline, and every arrow in it is implemented
and tested:

```
  ┌──────────────────────────┐
  │  test_agent/agent.py      │   Python subprocess (LangGraph)
  │  (weather + calculator)   │
  └───────────┬──────────────┘
              │  JarokuTracer callback fires on every LLM / tool / node event
              ▼
  ┌──────────────────────────┐
  │  jaroku_interceptor       │   builds Run / Step objects (frozen schema)
  │  schema.py + callback.py  │   serializes each as ONE JSON line
  └───────────┬──────────────┘
              │  newline-delimited JSON on STDOUT   (stderr = human logs only)
              ▼
  ┌──────────────────────────┐
  │  server/processManager.ts │   spawns `uv run python -m test_agent.agent`
  │                           │   line-buffers stdout, parses each line to an event
  └───────────┬──────────────┘
              │  typed TraceEvent objects (EventEmitter)
     ┌────────┴─────────┐
     ▼                  ▼
  ┌────────────┐   ┌────────────────────┐
  │ store.ts   │   │ wsRelay.ts          │
  │ SQLite     │   │ WebSocket broadcast │──► browser (debug-client.html)
  │ runs/steps │   │ + static HTTP serve │──► reconnecting clients get history
  └────────────┘   └────────────────────┘
```

**Checkpoint reached (from the doc):** *"run the test agent from terminal → JSON events appear
live in a browser console. Zero UI, core proven."* — done, and extended with SQLite persistence
and two failure drills.

---

## 2. Repository layout

```
Jaroku-v1/
├── jaroku-product-documentation (1).md   # the product spec (pre-existing)
├── README-1.md                           # this file
├── .gitignore                            # ignores node_modules, .venv, __pycache__, *.db, .env
│
├── schema/
│   └── events.md                         # 🔴 the FROZEN v1 Run/Step schema + transport envelope
│
├── runtime/                              # Python subproject, managed by uv (Python 3.12)
│   ├── pyproject.toml                    # deps: langgraph, langchain-core, -anthropic, -openai
│   ├── .python-version                   # "3.12"
│   ├── uv.lock                           # locked dependency graph (reproducible installs)
│   ├── jaroku_interceptor/
│   │   ├── __init__.py                   # package exports (Run, Step, JarokuTracer, SCHEMA_VERSION)
│   │   ├── schema.py                     # dataclasses + JSON-safe serialization + emit helpers
│   │   └── callback.py                   # JarokuTracer — the LangChain callback interceptor
│   └── test_agent/
│       ├── __init__.py
│       └── agent.py                      # the 2-tool LangGraph test agent (permanent fixture)
│
└── server/                               # Node subproject (TypeScript, run via tsx)
    ├── package.json                      # deps: ws; dev: tsx, typescript, @types/*
    ├── package-lock.json
    ├── tsconfig.json                     # strict TS; allows .ts import specifiers
    ├── debug-client.html                 # throwaway live-trace viewer (verification only)
    └── src/
        ├── types.ts                      # TS mirror of the event schema + type guard
        ├── store.ts                      # SQLite persistence (node:sqlite)
        ├── processManager.ts             # spawn/parse/kill the Python subprocess
        ├── wsRelay.ts                    # WebSocket broadcast + static file serving
        └── index.ts                      # wires manager → store → relay
```

Two independent subprojects — a **Python** side (the agent + interceptor) and a **Node** side
(the process manager, store, and relay) — connected by exactly one contract: **newline-delimited
JSON events on the Python process's stdout.** Keeping the boundary this thin is deliberate; it is
the same seam the product will later use to ingest traces from *deployed* agents (doc §5.5,
"Production agent runners").

---

## 3. Toolchain & environment setup

The machine started with **system Python 3.9.6** (too old for a comfortable modern
LangGraph/LangChain install) and **Node v24 / npm 11** (fine). The directory was not a git repo.

### Step 3.1 — git

```bash
git init            # initialize repository
git branch -m main  # default branch named main
```

### Step 3.2 — `.gitignore`

Created to keep build artifacts, virtualenvs, the SQLite database, and secrets out of version
control:

```
__pycache__/  *.py[cod]  .venv/  runtime/.venv/  *.egg-info/     # Python
node_modules/  dist/                                             # Node
*.db  *.sqlite*  .env  .env.*  (but keep .env.example)           # data / secrets
.DS_Store  *.log                                                 # OS / editor
```

### Step 3.3 — `uv` (the Python toolchain)

`uv` was chosen (over `brew python@3.12 + venv`) because it does three jobs with one tool:
installs & pins a Python version, creates the virtualenv, and resolves/locks dependencies fast
and reproducibly.

```bash
brew install uv                 # → uv 0.11.29
uv python install 3.12          # → CPython 3.12.13 (installed & managed by uv)
```

`runtime/.python-version` pins `3.12` for the subproject, so every `uv run` uses 3.12.13, never
the system 3.9.6.

### Step 3.4 — Python dependencies

`runtime/pyproject.toml` declares:

```toml
requires-python = ">=3.12"
dependencies = [
    "langgraph>=0.2.0",
    "langchain-core>=0.3.0",
    "langchain-anthropic>=0.3.0",
    "langchain-openai>=0.2.0",
]
```

Installed & locked with:

```bash
cd runtime && uv sync           # creates runtime/.venv, writes uv.lock
```

### Step 3.5 — Node dependencies

`server/package.json` declares `ws` (runtime) and `tsx` + `typescript` + `@types/*` (dev). No
native modules — persistence uses Node's **built-in** `node:sqlite`, so there is nothing to
compile.

```bash
cd server && npm install
```

---

## 4. The event schema

**This is the product's foundation.** Everything downstream — the timeline UI, eval aggregation,
production observability — reads this shape. It is frozen at `schema_version: 1` and documented
canonically in **`schema/events.md`**. The Python side
(`runtime/jaroku_interceptor/schema.py`) and the Node side (`server/src/types.ts`) are both
hand-kept mirrors of that document.

### 4.1 Transport envelope

The interceptor emits **newline-delimited JSON** to **stdout** — exactly one JSON object per
line, each object one "event". **stdout carries events only**; all human logging goes to stderr,
so the event stream is never polluted. Every line is one of three `kind`s:

```jsonc
{ "kind": "run_start", "schema_version": 1, "run":  Run  }
{ "kind": "step",      "schema_version": 1, "step": Step }
{ "kind": "run_end",   "schema_version": 1, "run":  Run  }
```

Ordering guarantee within a run: `run_start` → `step`(seq 0..N ascending) → `run_end`.

### 4.2 The `Run` object

A run is one execution of one agent against one input, on one provider/model.

| Field | Type | Meaning |
|---|---|---|
| `id` | string (uuid4) | stable id for the whole run |
| `agent_id` | string | which agent definition ran (here `"test_agent"`) |
| `provider` | string | `"anthropic"` \| `"openai"` \| `"fake"` |
| `model` | string | e.g. `"claude-opus-4-8"`, `"fake-scripted"` |
| `status` | `"running"` \| `"completed"` \| `"error"` | lifecycle state |
| `started_at` | ISO-8601 UTC | when the run began |
| `ended_at` | ISO-8601 UTC \| null | null until `run_end` |
| `cost` | number (USD) | aggregated across steps; 0 until known |
| `tokens` | number | total tokens across steps; 0 until known |
| `error` | string \| null | top-level failure message if the run itself errored |

### 4.3 The `Step` object

A step is one captured unit of execution inside a run.

| Field | Type | Meaning |
|---|---|---|
| `id` | string (uuid4) | unique per step |
| `run_id` | string | FK → `Run.id` |
| `seq` | number | monotonic per run, **starts at 0**, assigned in causal *start* order |
| `type` | `llm_call` \| `tool_call` \| `state_update` \| `router` | kind of step |
| `name` | string | node/tool/model name (`"agent"`, `"get_weather"`, …) |
| `input` | json | step input (messages, tool args, node inputs) |
| `output` | json | step output (model response, tool return, node outputs) |
| `state_before` | json \| null | agent state snapshot before the step |
| `state_after` | json \| null | agent state snapshot after the step |
| `tokens` | number \| null | tokens for this step (llm_call only) |
| `cost` | number \| null | USD for this step (llm_call only) |
| `latency_ms` | number | wall-clock duration of the step |
| `error` | string \| null | message if the step failed |
| `parent_step_id` | string \| null | FK → `Step.id`, for nested steps |
| `started_at` | ISO-8601 UTC | when the step began |

**`type` semantics**

- `llm_call` — a model invocation. `tokens`/`cost` populated; `input` = messages, `output` = response.
- `tool_call` — a tool/function invocation. `input` = args, `output` = return value.
- `state_update` — a graph node mutated agent state. `state_before`/`state_after` populated.
- `router` — a conditional-edge/routing decision. (Schema supports it; see §12 for why it is not
  *auto-captured* yet.)

**Ordering & parenting — the subtle, important part**

- `seq` is assigned **when a step starts**, so steps sort in true causal order.
- Each `Step` is **emitted when it ends** (that's when `output`, `latency_ms`, and `error` are
  known). Consequently events *arrive* out of `seq` order — a nested child ends before its parent
  node does, so it is emitted first. **Consumers must sort by `seq`, never by arrival time.**
  This is a designed property, and §10 shows it verified (arrival order `1,2,0,4,3,…` → stored
  `0..12`).
- `parent_step_id` links nested execution (e.g. a `tool_call` that runs inside a graph node)
  using LangChain's parent-run-id chain. Top-level steps have `parent_step_id: null`.

---

## 5. The Python runtime

### 5.1 `schema.py` — data model + serialization

`runtime/jaroku_interceptor/schema.py` mirrors `schema/events.md` in code and owns serialization.

- **`Run` and `Step`** are `@dataclass`es with the exact fields above.
- **`now_iso()`** returns a UTC ISO-8601 timestamp; used for `started_at`/`ended_at`.
- **`_json_safe(value)`** is the safety net. LangChain payloads contain rich objects (message
  objects, pydantic models, tool results). This function best-effort converts *anything* to
  JSON-serializable data: primitives pass through; dicts/lists recurse; objects are probed for
  `model_dump()` / `dict()` / `to_json()`; anything still unserializable falls back to `repr()`.
  **It never raises** — the trace must never crash the agent it observes.
- **`emit(kind, payload_key, obj)`** writes one JSON line to stdout and **flushes immediately**
  (so events stream in real time, not in buffered bursts). Convenience wrappers: `emit_run_start`,
  `emit_step`, `emit_run_end`.

### 5.2 `callback.py` — `JarokuTracer`, the interceptor

This is, per the doc, *"the most critical code in the product."* It is a LangChain
`BaseCallbackHandler`. LangGraph/LangChain already emit lifecycle callbacks during execution;
the tracer's job is to turn each matched pair of callbacks into one `Step`.

**Callback → Step mapping**

| LangChain callback pair | Produces |
|---|---|
| `on_chat_model_start` / `on_llm_start` + `on_llm_end` | `Step(type="llm_call")` |
| `on_tool_start` + `on_tool_end` | `Step(type="tool_call")` |
| `on_chain_start` (only LangGraph nodes) + `on_chain_end` | `Step(type="state_update")` |
| any `*_error` callback | the pending step is finished with `error` set |

**How it works internally**

- A per-callback-run record is opened in `_begin(...)`: it allocates the step's uuid, assigns the
  next `seq`, records `state_before` and a high-resolution start time (`time.perf_counter()`), and
  resolves `parent_step_id`.
- `_finish(...)` pops that record, computes `latency_ms`, builds the `Step`, and calls
  `emit_step`.
- **Parent resolution:** every LangChain `run_id` is registered to its Jaroku step id at *start*
  time (`_runid_to_stepid`). A child looks up its `parent_run_id` in that map — so parenting is
  correct even though steps are emitted at end time.
- **Distinguishing graph nodes from noise:** `on_chain_start` fires for *many* things (the whole
  graph, internal `RunnableSequence`s, etc.). The tracer only treats a chain as a `state_update`
  when `metadata["langgraph_node"]` is present — i.e. it is an actual LangGraph node. Everything
  else is ignored.
- **Token & cost extraction** (`_extract_token_pair`, `_estimate_cost`): usage is read from
  `response.llm_output` (`token_usage`/`usage`) or, failing that, from each message's
  `usage_metadata`. Cost is computed from a small per-model price table (`_PRICING`, USD per
  token, e.g. `claude-opus-4-8 → (15e-6 input, 75e-6 output)`). If usage is unavailable (as with
  the fake model), `tokens`/`cost` are simply `null`. LLM tokens/cost also accumulate into the
  `Run` totals.
- **Resilience:** all extraction helpers are wrapped so a malformed/unexpected payload yields
  `null`, never an exception.

### 5.3 `agent.py` — the 2-tool LangGraph test agent

`runtime/test_agent/agent.py` is the **permanent test fixture** — the doc mandates one simple,
hand-written agent that every later feature is tested against.

**Tools**

- `get_weather(city)` — returns stubbed, deterministic weather (a small lookup table).
- `calculator(expression)` — evaluates basic arithmetic **safely** via an AST walk
  (`_safe_eval`) that permits only numeric constants and the operators `+ - * / ** %` and unary
  `+/-`. **No `eval()`** — arbitrary code cannot be injected through the expression.

**Model selection (env `JAROKU_PROVIDER`)**

- unset / `"fake"` → a **deterministic scripted model** (`FakeMessagesListChatModel`) that needs
  **no API key**. It replays three canned assistant turns: (1) call `get_weather`, (2) call
  `calculator("18 + 4")`, (3) give a final answer. This makes the trace fixture repeatable and
  runnable offline — essential for reliable verification.
- `"anthropic"` → `ChatAnthropic` with tools bound (needs `ANTHROPIC_API_KEY`).
- `"openai"` → `ChatOpenAI` with tools bound (needs `OPENAI_API_KEY`).

**The graph** (`build_graph`) is a classic agent/tools loop:

```
START → agent ──(has tool_calls?)──► tools ──► agent ──(no tool_calls)──► END
```

- Node `agent` (`call_model`) invokes the model on the running message list.
- Conditional edge `should_continue` routes to `tools` if the last AI message has `tool_calls`,
  else to `END`.
- Node `tools` is LangGraph's prebuilt `ToolNode`, which executes the requested tool(s).
- An optional `JAROKU_DELAY_MS` sleeps before each model call — this makes live streaming visible
  in the UI and makes "kill mid-run" deterministic to test. Default `0` (instant).

**`main()` — the run lifecycle**

1. Read the user input (argv or a default question).
2. Build the model and graph; construct a `Run` (uuid, `agent_id="test_agent"`, provider, model).
3. Construct a `JarokuTracer(run)`; log to stderr; **`emit_run_start(run)`**.
4. `app.invoke({"messages":[HumanMessage(input)]}, config={"callbacks":[tracer], "recursion_limit":25})`.
5. On success → `run.status = "completed"`. On any exception → `run.status = "error"` and
   `run.error` is captured (the failure lands *in the trace*, not just in a log).
6. **`finally`:** set `ended_at`, **`emit_run_end(run)`**. Exit code `0` on success, `1` on error.

Run it directly:

```bash
cd runtime && uv run python -m test_agent.agent "What's the weather in Paris, and what is 18 + 4?"
# → JSON events on stdout, "[jaroku] …" logs on stderr
```

---

## 6. The Node server

### 6.1 `types.ts` — the schema mirror

TypeScript interfaces for `Run`, `Step`, and the `TraceEvent` union, plus **`isTraceEvent(v)`**,
a runtime type guard that checks `kind` ∈ {`run_start`,`step`,`run_end`}. The process manager
uses this guard so that a line which is valid JSON but *not* a trace event is rejected rather
than trusted.

### 6.2 `store.ts` — SQLite persistence (`TraceStore`)

Uses Node's built-in **`node:sqlite`** (`DatabaseSync`) — no native compilation required.

- Opens the DB, sets `PRAGMA journal_mode = WAL` (better concurrent read/write behavior), and
  runs `migrate()` which creates two tables **if they don't exist**:
  - `runs` — columns mirror the `Run` fields.
  - `steps` — columns mirror the `Step` fields; JSON payload fields (`input`, `output`,
    `state_before`, `state_after`) are stored as TEXT (JSON-encoded), plus an index
    `idx_steps_run_seq (run_id, seq)` so a run's steps load already ordered.
- **`upsertRun(run)`** — `INSERT … ON CONFLICT(id) DO UPDATE …`. The same run id is written twice
  (once at `run_start`, once at `run_end`); the upsert updates status/ended_at/cost/tokens/error
  in place.
- **`insertStep(step)`** — `INSERT OR IGNORE` (idempotent: re-delivering the same step id is a
  no-op, which matters for the at-least-once ingestion the product will need later).
- **`listRuns(limit)`** and **`stepsForRun(runId)`** (ordered by `seq`) for reads.

### 6.3 `processManager.ts` — spawn/parse/kill (`ProcessManager`)

A `🔴 self-code` component and the trickiest part of this milestone. It extends `EventEmitter`
and emits typed events: `event`, `parseError`, `stderr`, `exit`, `spawnError`.

- **`start(opts)`** spawns `uv run python -m test_agent.agent [input]` with `cwd` = the runtime
  dir. It prepends `/opt/homebrew/bin` to `PATH` so the spawned process can find `uv`, and merges
  any extra env (e.g. `JAROKU_PROVIDER`, `JAROKU_DELAY_MS`).
- **Line buffering (`onStdout` / `flushStdout`)** — the crux. stdout arrives in arbitrary chunks
  that do **not** align to line boundaries. Incoming data is appended to `stdoutBuf`, split on
  `\n`, and the **last (possibly partial) fragment is retained** for the next chunk. Each complete
  line is `JSON.parse`d; on failure it emits `parseError` (never throws); if it parses but isn't a
  recognized event (`isTraceEvent`), it also emits `parseError`; otherwise it emits `event`.
- **`onStderr`** buffers and forwards the agent's human logs line-by-line as `stderr` events.
- **On `exit`** it flushes any trailing partial line (present only if the process died without a
  final newline), drains stderr, clears the child handle, and emits `exit {code, signal}`.
- **`stop(graceMs)`** sends `SIGTERM`, then `SIGKILL` after a grace period if the child is still
  alive — this is what prevents **zombie processes**.

### 6.4 `wsRelay.ts` — WebSocket broadcast + static serving (`WsRelay`)

One `node:http` server does double duty:

- **Static:** `GET /` serves `debug-client.html`.
- **WebSocket** (via `ws`, attached to the same HTTP server): on connect, a client immediately
  receives a **history snapshot** (`{channel:"history", runs:[…]}`) so a fresh or reconnecting
  client is never blank. Thereafter:
  - **`broadcast(event)`** pushes each live `TraceEvent` as `{channel:"trace", event}` to all open
    clients.
  - **`broadcastLog(level, text)`** pushes stderr/parse diagnostics as `{channel:"log", …}`.
  - Inbound client messages `{cmd:"run", input?, provider?}` are validated and forwarded to an
    `onCommand` callback (this is how the browser's "Run agent" button triggers a run).

### 6.5 `index.ts` — the wiring

Ties the three together and defines the pipeline:

- Resolves paths (runtime dir, `server/jaroku.db`, port `4317` by default), constructs the
  `TraceStore`, `ProcessManager`, and `WsRelay`.
- **`manager.on("event")`** → **persist first** (SQLite is the source of truth: `upsertRun` for
  run_start/run_end, `insertStep` for steps), **then `relay.broadcast`**. Persist-before-broadcast
  means a client is never shown an event that failed to store.
- `parseError` / `stderr` / `spawnError` / `exit` are logged and (for the first two) forwarded to
  clients for visibility.
- **`runAgent(input, provider)`** starts a run if one isn't already in flight. On startup the
  server auto-runs once (after a 300 ms delay so the relay is listening first) unless
  `JAROKU_NO_AUTORUN=1`.
- **Graceful shutdown:** `SIGINT`/`SIGTERM` → stop the child, close the DB, exit.

---

## 7. The debug client

`server/debug-client.html` is an intentionally **throwaway** single file (no framework, no build)
whose only purpose is to *prove* the pipeline visually. The real Trace Timeline UI comes later and
is out of scope here. It nonetheless follows the doc's aesthetic (near-black `#0d0d0f`, muted
off-white text, JetBrains Mono, status colors reserved for meaning) so it doubles as a rough
preview. It:

- Connects to `ws://<host>` and **auto-reconnects** on disconnect (1 s backoff).
- Renders each `step` as a row: `#seq`, a color-coded type badge, the name, and a metadata tail
  (tokens · cost · latency, plus a red `ERROR` marker). Expanding a row shows its input/output
  (and error). `run_start`/`run_end` render as italic markers.
- Has a text box + **Run agent** button that sends `{cmd:"run", input}` and clears the view, and a
  small diagnostics log pane at the bottom for stderr/parse messages.

---

## 8. End-to-end data flow

Tracing one run from click to pixel and to disk:

1. Browser sends `{cmd:"run", input:"…"}` over the WebSocket (or the server auto-runs on startup).
2. `index.ts` calls `runAgent`, which calls `manager.start(...)`.
3. `ProcessManager` spawns `uv run python -m test_agent.agent "…"` in `runtime/`.
4. `agent.py` builds the graph, constructs a `Run`, and `emit_run_start` prints
   `{"kind":"run_start",…}` to stdout.
5. LangGraph executes. On each node/model/tool boundary, `JarokuTracer` builds a `Step` and
   `emit_step` prints `{"kind":"step",…}` — one JSON line each, flushed immediately.
6. `agent.py` finishes and `emit_run_end` prints `{"kind":"run_end",…}`.
7. `ProcessManager` line-buffers stdout, parses each line, and emits typed `event`s.
8. For each event, `index.ts` **persists to SQLite** (`upsertRun`/`insertStep`) then
   **`relay.broadcast`**s it.
9. Every connected browser receives `{channel:"trace", event}` and renders it live; the row for a
   step appears the instant that step *completes* in Python.
10. The run is now fully queryable in `server/jaroku.db` (`runs` + `steps`, steps ordered by
    `seq`).

---

## 9. How to run everything

**Prerequisites:** `uv` (Homebrew), Node ≥ 22 (24 used here). One-time install:

```bash
cd runtime && uv sync          # Python deps into runtime/.venv
cd ../server && npm install     # Node deps
```

**A) Just the agent (raw events in the terminal):**

```bash
cd runtime
uv run python -m test_agent.agent                      # default question
uv run python -m test_agent.agent "Weather in Tokyo and 7*6?"   # custom input
# stdout = JSON events, stderr = [jaroku] logs
```

**B) Full pipeline with the live browser view:**

```bash
cd server
npm run dev                    # starts http+ws on :4317, auto-runs the agent once
# open http://localhost:4317 → watch the trace stream in; click "Run agent" to re-run
```

Useful env vars: `JAROKU_PORT` (default 4317), `JAROKU_DB` (default `server/jaroku.db`),
`JAROKU_NO_AUTORUN=1` (serve without auto-running), `JAROKU_PROVIDER=anthropic|openai` (use a real
model + key), `JAROKU_DELAY_MS=800` (slow the agent so streaming is visible).

**Typecheck the server:**

```bash
cd server && npx tsc --noEmit   # → clean
```

---

## 10. Verification & failure drills

Everything below was actually run; these are the observed results.

### 10.1 Agent standalone

`uv run python -m test_agent.agent` produced a clean stream: `run_start` → 13 `step`s → `run_end`,
with **stdout pure JSON** and **stderr only `[jaroku]` logs**. The captured story:
`agent → get_weather → agent → calculator → agent(final)`, exercising all three auto-captured step
types (`llm_call`, `tool_call`, `state_update`).

### 10.2 Live WebSocket delivery

A scripted WS client connected, triggered a fresh run, and observed:

```
summary: { history:1, run_start:1, run_end:1, step:13, logs:2 }
step seqs (arrival order): 1,2,0,4,3,6,7,5,9,8,11,12,10
last run status: completed
```

- The prior startup run appeared in the **history snapshot** on connect (`history:1`).
- A full fresh run streamed live (13 steps, bookended by run_start/run_end).
- **Arrival order ≠ seq order** — exactly as designed (steps emitted at end time). Sorting by
  `seq` reconstructs true order.

### 10.3 SQLite persistence & integrity

Querying `server/jaroku.db` after two runs:

```
RUNS: 2   (each: fake/fake-scripted, completed, steps=13)
STEPS for last run, ordered by seq:
  #0  state_update  agent
  #1  llm_call      FakeMessagesListChatModel
  #2  state_update  agent
  #3  state_update  tools
  #4  tool_call     get_weather
  #5  state_update  agent
  #6  llm_call      FakeMessagesListChatModel
  #7  state_update  agent
  #8  state_update  tools
  #9  tool_call     calculator
  #10 state_update  agent
  #11 llm_call      FakeMessagesListChatModel
  #12 state_update  agent
seq contiguous 0..N: true   unique: true
```

Both runs persisted with all 13 steps; `seq` values are contiguous `0..12` and unique. **A
corrupted or reordered trace would be a lying product** — this check is the whole point.

### 10.4 Drill 1 — malformed & partial-line resilience — **PASS**

Injected into the parser: a garbage line, then a valid `step` **split across three chunks**, then
a valid `run_end` **split across two chunks**, then a line that is valid JSON but not a trace
event. Result: `events=2` (the two real events, correctly reassembled from fragments),
`parseErrors=2` (garbage + non-event). The parser **never crashed** and never mis-emitted.

### 10.5 Drill 2 — kill mid-run, no zombie — **PASS**

Started the agent with `JAROKU_DELAY_MS=800` (run takes ~2.4 s), then called `stop()` immediately
after `run_start`. Result: process exited with **code 143 (SIGTERM)**, **no `run_end`** was
emitted (killed before completion), and `process.kill(pid, 0)` confirmed the process was **gone
(no zombie)**.

### 10.6 Typecheck — **clean**

`tsc --noEmit` passes with `strict` and `noUncheckedIndexedAccess` on.

---

## 11. Key engineering decisions

| Decision | Why |
|---|---|
| **`seq` at start, emit at end** | Steps must sort in causal order, but `output`/`latency`/`error` are only known at end. Assigning `seq` at start and emitting at end gives both — consumers sort by `seq`. |
| **Default to a deterministic *fake* model** | The permanent test fixture must be repeatable and runnable **offline with no API key**. Real providers (`anthropic`/`openai`) are one env var away. |
| **stdout JSON-lines transport** | Simplest possible cross-language contract; no port coordination; trivially debuggable (`uv run … | less`). The doc listed "stdout/socket"; stdout wins here. It is also the same seam production trace ingestion will reuse. |
| **`node:sqlite` (built-in) over `better-sqlite3`** | Avoids native compilation entirely — no node-gyp/prebuild friction on Node 24. |
| **Persist before broadcast** | SQLite is the source of truth; a client is never shown an event that failed to store. |
| **`INSERT OR IGNORE` for steps** | Idempotent ingestion — re-delivering a step id is a no-op. Prepares for the at-least-once delivery the product needs when deployed agents stream traces back (doc §5.5). |
| **`_json_safe` never raises** | The tracer must never crash the agent it observes. Unserializable payloads degrade to `repr()`, not exceptions. |
| **Only `metadata.langgraph_node` chains become `state_update`** | `on_chain_start` fires for lots of internal machinery; this filter keeps the trace to real graph nodes. |
| **`JAROKU_DELAY_MS` knob** | Makes live streaming visible (the doc's "everything streams, no spinners" ethos) and makes the kill-mid-run drill deterministic. |
| **Safe AST calculator, no `eval()`** | A tool that ran `eval()` on model output would be a code-injection hole. |

---

## 12. Known limitations & deferred work

These are **intentional** — the doc's discipline is "prove the core, defer breadth."

- ~~**`router` steps are not auto-captured.**~~ **RESOLVED.** The original claim — that a
  conditional-edge decision isn't a LangChain callback — was **wrong**. LangGraph coerces the
  path function with `trace=True` (`langgraph/graph/state.py`, `add_conditional_edges`), so it
  *does* fire `on_chain_start`/`on_chain_end`. Worse, it carried the source node's
  `metadata.langgraph_node`, so it was slipping through the node filter and being emitted as a
  **mislabeled `state_update`** with the branch string in `state_after` — which is why the old
  §10.3 trace showed `agent` twice per turn. Routers are now classified explicitly (precisely
  via `graph.builder.branches`, or by a heuristic that must survive an end-time output-shape
  check) and emitted as `Step(type="router")` with `output` = the chosen branch and null state.
- **Node-level `state_update` granularity is approximate.** State snapshots come from chain
  input/output payloads. Note that `state_after` is the node's **partial return**, not the
  reducer-merged post-state — the UI's diff accounts for this and never renders an unprovable
  removal. Precise pause/inspect/resume + state-diff machinery is later `🔴 self-code` work.
- **No product UI.** `debug-client.html` is a verification harness, not the Trace Timeline. The
  real three-pane UI (React + Tailwind, resizable panels, graph/trace/eval tabs) comes later.
- **No generation, eval, or deploy** yet — those are later layers of the build plan.
- **Single process, local, SQLite.** Correct until the problem is real; distributed evals and the
  production telemetry pipeline arrive only when load demands (doc §5.5).

**What builds on this next:** the Vite + React + Tailwind scaffold, the three-pane resizable
layout, and the live **Trace Timeline UI** that consumes exactly the WebSocket stream this
foundation already produces. Because the schema and transport are frozen and verified, the UI can
be built against a known-good, known-correct event source.

---

## 13. Glossary

- **Run** — one execution of one agent on one input with one provider/model.
- **Step** — one captured unit inside a run (an LLM call, a tool call, a node state update, or a
  routing decision).
- **Interceptor / `JarokuTracer`** — the LangChain callback handler that turns execution into
  Step events.
- **Envelope** — the `{kind, schema_version, …}` JSON wrapper around each event on the wire.
- **Process manager** — the Node component that spawns the Python agent and parses its stdout.
- **Relay** — the Node component that broadcasts events to browsers over WebSocket.
- **Trace store** — the SQLite database of persisted runs and steps.
- **Fixture** — the hand-written test agent used to exercise everything downstream.

---

*End of README-1. The foundation is built and verified; the trace pipeline is proven correct
end-to-end with zero product UI, exactly as the build plan prescribes.*
