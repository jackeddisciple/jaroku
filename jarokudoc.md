# Jaroku — Product Documentation

**North Star:** The best place for developers to build agents they can actually trust.

**Tagline:** Claude Code writes your agent. Jaroku shows you if it actually works — then ships it.

**One-liner:** Jaroku is a build-debug-eval-deploy platform for AI agents. Generation is table-stakes (any coding agent can write LangGraph code); Jaroku's differentiator is what happens *after* generation — a live execution trace that makes an agent's invisible reasoning visible, a conversational fix-loop, multi-provider evaluation, and one-click deploy.

**Positioning note:** Jaroku is not trying to out-generate Cursor or Claude Code — generation is commodity. Jaroku's moat is depth in the layer no one else owns well: showing a developer *whether their agent actually works*, letting them fix it by talking, and shipping it with confidence. Every roadmap and feature decision should be checked against the North Star: does this deepen trust/visibility, or does it just add breadth? When in doubt, choose depth.

---

## 1. Vision & Problem

### 1.1 The Problem

Building AI agents today requires:
- Deep knowledge of frameworks (LangGraph, CrewAI, AutoGen) and their fast-changing APIs
- Manual wiring of tools, memory, and state
- Debugging via scattered console logs — agent execution is fundamentally **invisible**
- No easy way to compare LLM providers on the same agent (cost, latency, quality)
- DevOps work to get an agent into production

Vibe-coding platforms (Lovable, Bolt, v0, Replit) proved that natural-language building works — but only for web apps, because web apps have a **visual preview**. You say "make the button blue" and see a blue button. Agents have no equivalent: their "output" is a sequence of invisible LLM calls, tool invocations, and state mutations.

**A critical reality check:** indie developers already vibe-code agents today, using Claude Code, Cursor, and similar tools. Generation — turning a prompt into working LangGraph code — is no longer the hard problem; it's commodity. Any coding agent can write a reasonable agent. The real, unsolved problem is what happens *after* the code exists: does it actually work? What is it doing at each step? Which provider is better for this agent? How do you ship it and know if it breaks in production? Today that's solved with print statements, scattered logs, and a patchwork of separate tools (Langfuse/LangSmith for tracing, Braintrust for evals, Railway for deploy). Jaroku exists to be one coherent place for that entire post-generation journey — it complements tools like Claude Code rather than competing with them for the "write the code" job.

### 1.2 The Insight

**The preview pane for an agent is its execution.** If you can render an agent's anatomy (graph) and its live execution (trace) in real time, the vibe-coding loop suddenly works for agents:

```
Describe it → See it → Fix it by talking → (repeat) → Ship it
```

This loop is Jaroku's core product. Everything else — generation, evals, deploy — exists to serve this loop. Generation is included so the loop is complete and self-contained, but it is deliberately **not** the hero feature or the primary pitch — the live trace and fix-loop are.

### 1.3 Target Users

- **Primary:** Indie developers and solo builders who already vibe-code agents (with Claude Code, Cursor, etc.) but have no good way to see if what they built actually works, compare providers, or ship it
- **Secondary:** AI engineers who want fast prototyping + provider comparison
- **Later:** Semi-technical operators (support leads, ops managers) building internal agents within a supported category

### 1.4 Agent Categories Supported

Jaroku's underlying engine (LangGraph-based) is category-agnostic — it can build, trace, debug, and evaluate an agent for any domain. The long-term goal is to support builders across all major business functions:

Sales & CRM · Marketing · Customer Support · Operations & Admin · Finance & Accounting · People & HR · Personal Assistants · Engineering & IT · Product & Design · Data & Analytics · Legal & Compliance · E-commerce & Retail

**How this is delivered (not all at once):** the core engine (build/trace/debug/eval/deploy) is built once and is category-neutral — it already works for any of the twelve. What differs per category is the *template pack*: starter templates, pre-wired tool integrations (e.g., CRM APIs for Sales, ATS for HR, accounting APIs for Finance), and domain-specific eval rubrics. Building twelve deep template packs on day one is not viable for a solo builder — quality would suffer across the board. Instead: ship the core engine against one or two categories first (proving the loop end-to-end), launch, and then add template packs for additional categories based on real user demand. The twelve-category list is the destination and the north-star scope; the delivery is sequential, one template pack at a time.

---

## 2. Product Concept & Core Loop

### 2.1 The Loop

1. **Describe:** User types what they want the agent to do (a standard chat input, with an optional mic/voice-to-text button like any modern chatbox — not a distinct "voice mode" feature)
2. **Dekho (See):** Jaroku generates real code, streams it live, and renders the agent as an interactive graph. Running the agent produces a live execution trace.
3. **Theek karo (Fix):** User talks to Jaroku ("add Redis memory," "retry failed tool calls") → Jaroku proposes a **diff** → user reviews/undoes → agent re-runs → trace updates
4. **Ship:** When satisfied, user evaluates across providers and deploys with one click

### 2.2 Positioning

| | Web apps | Agents |
|---|---|---|
| Vibe builder | Lovable, Bolt, v0 | **Jaroku** |
| Preview pane | Live rendered app | **Live graph + execution trace** |
| Debug | Browser DevTools | **Jaroku trace timeline** |

Jaroku is not a framework. It generates standard LangGraph code the user owns. Jaroku's value is the **experience around** the framework: generation, visualization, debugging, evals, and deployment.

### 2.3 Competitive Landscape

Research into the current market (2026) confirms this positioning is necessary, not optional — the space is more crowded than it first appears:

| Product | What it does | Why it's not a direct replacement for Jaroku |
|---|---|---|
| **Cursor / Claude Code** | Best-in-class code generation, including agent code | Generation only — no execution visibility, no eval, no deploy for the *agent itself* |
| **LangGraph Studio** (official) | Visual debugging, trace mode, one-click deploy, tightly coupled to LangGraph | Framework-locked; built for developers already fluent in LangGraph, not vibe-coders; official LangChain product with resources Jaroku can't match head-on |
| **LangConfig** | Visual canvas, multi-runtime, live streaming, run history, export to code | Closest existing competitor — a "build on canvas, debug live" tool. Differentiator for Jaroku: conversational (not canvas-drag) building and a sharper category focus |
| **AgentTrace / AgentPrism (OSS)** | Local-first step debugger; drop-in trace-visualization React components | Debugging only, no build/eval/deploy loop; useful as reference/components, not competitors to the full product |
| **Langfuse / LangSmith / Braintrust / Arize Phoenix / Laminar** | General LLM observability & eval platforms | This is a red ocean of well-funded, horizontal tools. Jaroku must **not** try to become "another observability platform" — differentiation must come from being category-specific and build-to-ship, not from out-featuring these on tracing/eval alone |

**Strategic implication:** Jaroku's defensible angle is the combination of (a) conversational build-and-fix loop, (b) live trace as a first-class visual citizen (not a bolt-on dashboard), and (c) category-specific templates — not superior generation and not superior generic observability. Avoid competing head-on with LangGraph Studio (official, resourced) or the observability incumbents (funded, horizontal). Compete on being the friendliest, most complete *loop* for indie builders shipping category-specific agents.

---

## 3. User Journey (End to End)

### Step 1 — Create
- User clicks **New Agent**
- Enters a prompt: *"Build me a customer support agent that reads Gmail, looks up orders in Supabase, and drafts replies."*
- Selects an LLM provider (from a growing list — Claude, GPT, Gemini, Grok, and others; 2 at MVP, expanding toward 5-6+ as the product matures) and model from a dropdown
- Optionally selects tool integrations from a connector library (target: 500+ connectors long-term — Gmail, Slack, Postgres/Supabase, HTTP, and hundreds more; a handful at MVP, growing continuously)

### Step 2 — Build (Live Generation)
- Jaroku's builder AI generates a real project: `agent.py`, `tools/gmail_tool.py`, `prompts/system_prompt.txt`, config, env template
- **Files appear one by one, streaming token-by-token** — the user watches the project materialize (never a spinner)
- The right pane simultaneously renders the **Graph View**: nodes (LLM, tools, memory, router) and edges appear as they're generated

### Step 3 — Graph View (Agent Anatomy)
- Interactive flow diagram of the agent: every node is clickable
- Clicking a node reveals its config: prompt, model, tool schema, memory backend
- The graph is always in sync with the code — edit either, both update

### Step 4 — Run & Debug (The Preview Pane)
- User clicks **Run** and sends a test input (e.g., a sample customer email)
- Right pane switches to **Trace Timeline**, streaming live:
  - Every LLM call: full prompt, response, tokens, cost, latency
  - Every tool call: input args, output, duration, errors
  - Every state/memory mutation: before → after diff
- **Pause / Inspect / Resume:** pause mid-run, inspect state at any step, resume
- **Step re-run:** re-execute from a chosen step with edited state
- The currently executing node **glows** in the Graph View — graph and trace are linked (click a trace step → node highlights, and vice versa)

### Step 5 — Fix by Talking
- User types: *"It's not remembering previous emails — add conversation memory with Redis."*
- Jaroku reads the existing code, proposes changes as a **Diff Card**:
  - "Edited 3 files, +42 −11" with per-file breakdown
  - **Review** → side-by-side diff · **Undo** → one-click revert · **Apply** → merged
- User re-runs → the new memory step appears in the trace → loop closes

### Step 6 — Eval (Multi-Provider Comparison)
- User creates or imports a dataset (e.g., 100 sample support queries)
- Jaroku runs the **same agent** against multiple providers in parallel
- An LLM judge scores each output (correctness, hallucination, tone)
- Results render in a comparison dashboard: quality score, cost per run, p50/p95 latency, per-example drill-down into full traces

### Step 7 — Ship
- Jaroku generates a Dockerfile + env config around the agent
- One click deploys via Railway / Fly.io / Cloud Run APIs
- Post-deploy: production runs stream back into the same Trace Timeline (observability continuity — same UI for dev and prod)

---

## 4. Killer DX/UX Specification

Jaroku's design philosophy: **restraint is the discipline, not decoration.** The "staff-engineer feel" comes from doing *less* — fewer borders, fewer colors, fewer things visible at once — applied with zero exceptions. This section reflects the finalized design, arrived at after multiple iterations away from an initial cluttered 4-panel mockup.

### 4.1 Layout — Finalized 3-Column Structure

```
┌──────────────┬───────────────────────┬──────────────────────────┐
│ LEFT         │ CENTER                │ RIGHT                    │
│ (narrow)     │ (Claude-Code style)   │ (wide — the hero)        │
│              │                       │                          │
│ Agent list,  │ Scrolling flow:       │ Tabs: Graph · Trace ·    │
│ grouped by   │  your message →       │ Evals (ONE visible at    │
│ status       │  Jaroku's response →  │ a time, never stacked)   │
│              │  inline diff cards    │                          │
│              │ ─────────────────     │ Trace Timeline is the    │
│              │ [prompt box, model    │ default/most important   │
│              │  dropdown alongside]  │ tab — this is the        │
│              │ (fixed at bottom)     │ product's identity       │
└──────────────┴───────────────────────┴──────────────────────────┘
```

**Left sidebar** is the agent/project home, not a nav-icon bar (nav lives in the right tabs):
- Top-anchored group: "New Agent" button, Search, agents grouped by status (Running / Deployed / Drafts), each row showing name + status glyph (● green Running, ✓ Deployed, ○ Draft) + last-run timestamp + a small provider chip
- A flexible empty space in the middle (flexbox `space-between`) separates the two groups — this is deliberate breathing room, not wasted space
- Bottom-anchored group: Environment toggle (Dev/Prod), Settings, user/plan chip

**Center column** merges chat and code into one Claude-Code-CLI-style flow (a decision made specifically to remove a redundant full-time code-editor column): conversation scrolls upward, diff cards appear inline exactly where a change happens ("Edited agent.py, +12 −3"), and a fixed prompt box sits at the bottom with the model-provider dropdown placed directly beside it. Full code is **not** a permanent column — clicking a diff card opens the full file as an on-demand overlay, then returns to the conversation.

**Right column** keeps Graph / Trace / Evals as true tabs — only one is ever visible at once, never stacked together (an early mistake in iteration was showing Graph and Trace simultaneously, which diluted both). Trace is the hero and defaults to being the widest, most generously spaced panel. Clicking a trace step opens Step Details as a **slide-in overlay from the right**, not a fifth permanent column.

A top bar shows agent name, live status, and a breadcrumb (`agent.py › build_graph()`), plus Environment toggle, Deploy and Share buttons. A bottom status bar shows connection state, environment, active provider, total cost, tokens, duration, and current step (e.g. `Step 5/12`).

- Panels are resizable; layout state persists per project
- The right panel (specifically the Trace tab) is the product's identity — it is what no competitor has

### 4.2 Visual System — Restraint Over Decoration

The single biggest lesson from design iteration: a UI covered in borders, boxes, and brand colors reads as "busy," not "polished." The fix was consistently to *remove*, not add.

**Borderless-first:** avoid wrapping content in rounded boxes/containers wherever possible. Diff cards, conversation, and panels should sit directly on the background, separated by spacing and very subtle low-opacity dividers — not by visible borders. The Trace Timeline in particular should feel like content floating on the surface, connected by a thin vertical line, not a bordered table.

**Color palette (finalized):**
- Background (deepest layer): `#0d0d0f` — near-black, not pure black
- Panels / sidebar (one layer up): `#18181b` — charcoal
- Selected / active state (top layer): `#1e1e22`, paired with a thin 2px accent bar on the left edge of the selected item — **not** a full-color fill
- Primary text: `#e4e4e7` (off-white, slightly muted — never pure white, which reads harsh)
- Secondary/muted text: `#71717a`
- Status colors — reserved *exclusively* for meaning, never decoration: green `#22c55e` (success), red `#ef4444` (error), amber `#f59e0b` (running/pending)

**Icon color rule:** functional UI icons (chat, search, settings, play/pause) are monochrome — muted grey idle, brighter when active. Brand icons (GitHub, Claude, OpenAI, Gmail, Slack, Supabase logos) show their **original brand color only when they represent an active/chosen/connected state** (the selected model in a dropdown, a tool the agent is actually wired to, the connected deploy target) — and render muted grey when they're just one idle option in a list. Brand color is a signal of "this is chosen," not blanket decoration.

**Embrace empty space:** do not fill every pixel. Generous panel padding (~24px), taller row heights, and real empty areas (as seen in reference tools like Synara) are a feature, not a gap to fill. It's acceptable — desirable — for fewer items to be visible on screen if it means more clarity; the user scrolls, and that's fine.

- **One monospace font** (JetBrains Mono / Berkeley Mono) for all code, traces, and metrics, with one consistent spacing grid (4px/8px) throughout
- Every list row carries status glyph + name + metadata + timestamp — dense but breathable (Linear/Cursor discipline), never cramped

### 4.3 Everything Streams — No Spinners, Ever

- Code generation streams token-by-token, file-by-file
- Trace steps land in the timeline the instant they occur (WebSocket)
- Live tickers everywhere: "Working for 12s", running cost counter, token counter
- Rule: **if the user ever stares at a static spinner, the design has failed.** Every wait state must show *what* is happening.

### 4.4 Diff-First Editing (Trust Architecture)

- The AI never silently edits files
- Every change arrives as a **Diff Card inline in the center conversation flow** (not a separate panel): files touched, +adds/−removes, Review / Undo / Apply
- Full edit history with one-click revert to any checkpoint
- Result: the user feels the AI works *in front of them*, never behind their back

### 4.5 Keyboard-First

- **Cmd+K** command palette: run agent, switch provider, open trace, jump to file, deploy — everything
- **J / K** — navigate trace steps · **Enter** — expand step · **R** — re-run · **Cmd+Z** — undo last diff
- **Cmd+P** — file switcher · **Cmd+/** — focus chat
- Every action reachable without a mouse; palette shows shortcuts inline to teach them

### 4.6 Micro-Interactions That Signal Quality

- Executing graph node glows with a subtle pulse
- Trace steps slide in (120ms ease-out) — perceptible, never sluggish
- Cost/latency numbers tick up live rather than jumping
- Errors expand inline with the full stack trace + a one-click "Ask Jaroku to fix this" button that pre-fills the chat

### 4.7 The Details That Make You Faster

Every surface is tuned for flow. The principle: **the user's hands never leave the work.** Any time a user would copy-paste, re-type, or switch windows, a detail is missing. These six features remove the friction at every transition in the core loop:

**1. One-Click Fix**
A trace step fails → the error card shows a single button: **"Ask Jaroku to fix."** The chat is pre-filled with the full error, stack trace, and the relevant code context. No copy-pasting errors, ever. Expected to be the single most-used interaction in the product.

**2. Mid-Run Provider Handoff**
Agent stuck on a step while running on Claude? Right-click the trace step → **"Re-run from here with GPT."** Same state, different brain, full context travels with it. Users *feel* the provider difference long before opening the eval dashboard — this is the multi-provider value prop made tactile.

**3. Run History as Branches**
Every run is an isolated snapshot. Edit state at step 4 and re-run → a new branch is created, the original stays intact. Compare two runs side-by-side ("before adding memory vs. after"). The agent-world equivalent of Git worktrees: experiment freely without destroying anything.

**4. Split Runs, Parallel Testing**
One agent, two inputs, two trace timelines side-by-side in the same window. Or the same input on two providers, streaming live in parallel — an instant, informal preview of the eval engine. No tab shuffle, no lost context.

**5. Everything One Pane Over**
Raw agent stdout (terminal), generated code, tool documentation — all available as tabs inside the right pane. Checking what an API returned or what a prompt contained never requires leaving Jaroku.

**6. Test Input Persistence**
The last test input is always remembered. Press **R** → instant re-run on the same input. In the fix-loop, users re-run 10–20 times per session; re-typing the input each time would kill the flow. Saved inputs can be promoted to the eval dataset with one click.

---

## 5. Technical Architecture

### 5.1 High-Level Diagram

```
User Prompt
   → [Jaroku Builder AI]  — generates LangGraph project (streamed)
   → [LangGraph Runtime]  — Jaroku spawns & manages the process
   → [Provider Layer]     — Claude / GPT / Gemini / Grok / others (one-line swap per provider)
   → [Event Interceptor]  — captures every LLM/tool/state event via callbacks
   → [WebSocket Stream]   — events → UI in real time
   → [Trace Store]        — persisted runs, steps, state snapshots
   → [Eval Engine]        — parallel multi-provider runs + LLM judge
   → [Deploy Service]     — Dockerfile gen + Railway/Fly/Cloud Run APIs
```

### 5.2 Core Primitive: The Execution Trace

The trace data model is the foundation of the entire platform:

```
Run { id, agent_id, provider, model, status, started_at, cost, tokens }
 └─ Step { id, run_id, type: llm_call | tool_call | state_update | router,
           input, output, state_before, state_after,
           tokens, cost, latency_ms, error?, parent_step_id }
```

- **Build** layer uses it to verify generated agents work
- **Debug** layer renders it as the timeline
- **Eval** layer aggregates it across providers
- **Ship** layer streams production runs into it

### 5.3 Stack

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | Tauri | Native feel, small binary, Cursor-like experience |
| Frontend | React + TypeScript + Tailwind | Speed + ecosystem |
| Graph rendering | React Flow | Interactive node graphs |
| Syntax highlighting | Shiki | Editor-grade highlighting |
| Terminal | xterm.js | Embedded agent stdout |
| Command palette | cmdk | Cmd+K |
| Realtime | WebSocket server (Node.js) | Event streaming |
| Agent runtime | Python subprocess (LangGraph) | Managed by app |
| Event capture | LangGraph/LangChain callbacks (`on_chain_start`, `on_tool_end`, etc.) | Framework already emits these |
| Trace store | SQLite (local) → Postgres (cloud later) | Simple first |
| Builder AI | Claude (Anthropic API) | Code generation quality |

### 5.4 Key Decisions

- **One framework (LangGraph), hidden from the user.** Multi-framework support multiplies the event-capture and visualization surface by N; the target user doesn't care what's underneath. Revisit only on strong user demand.
- **Multi-provider, expanding toward 5-6+.** Provider swap is a one-line change in LangChain; the eval comparison is a core value prop. MVP ships with 2 providers (Claude + OpenAI) to prove the loop; Gemini, Grok, and others are added on the same pattern as demand grows. The long-term goal is broad provider coverage so eval comparisons are genuinely useful, not just a two-way toggle.
- **Connector library, target 500+ over time.** The vision is a large, growing library of tool integrations (Gmail, Slack, Postgres/Supabase, HTTP, CRMs, ATS systems, accounting APIs, and hundreds more) so agents across all 12 supported categories can be wired to the tools they actually need. This is **not** built all at once — MVP ships with a handful of high-leverage connectors (Gmail, Slack, Postgres, generic HTTP), and the library expands connector-by-connector, prioritized by which categories and templates are being unlocked next (see Section 1.4). A connector framework/SDK (so community or later automated generation can add connectors faster than hand-building each one) becomes worth investing in once the library is past the first few dozen.
- **Local-first execution.** Agents run on the user's machine (keys stay local); cloud runners come later.
- **User owns the code.** Generated projects are standard LangGraph — exportable, no lock-in. This is a feature, not a risk.

### 5.5 Distributed Systems (where they genuinely fit)

Jaroku stays local and single-process for the MVP. But two parts of the product are genuinely distributed problems — not bolted-on complexity, but load-bearing infrastructure the product actually needs as it scales. These are introduced in later phases, once the problem is real.

**1. Parallel eval execution (the most natural fit).**
Running the same agent × N providers × M examples simultaneously *is* a distributed job system. The design:
- A **task queue** (BullMQ/Redis, or Temporal for durable workflows) holds each (example × provider) run as a job
- A pool of **workers** executes runs in parallel, respecting per-provider concurrency limits
- Results are **aggregated** back into a single comparison view
- **Retry on failure** for transient errors (rate limits, timeouts)
- **Partial-failure isolation** — one provider or one example failing must not sink the whole eval
This is real distributed-systems work, and the eval feature needs it regardless. First entry point: Eval Engine (Week 7).

**2. Production agent runners (distributed telemetry pipeline).**
Once the deploy layer exists, deployed agents run on separate machines and stream their traces back into Jaroku. This is a distributed telemetry pipeline:
- **Multiple agents → central ingestion → ordered event storage**
- **Event ordering** — steps must land in causal order despite network reordering (sequence numbers / logical clocks per run)
- **At-least-once delivery** — no dropped trace events; idempotent ingestion to dedupe
- **Backpressure** — a burst of high-volume agents must not overwhelm the ingestion server (buffering, batching, a message queue like Kafka/NATS/Redis Streams in front of the workers)
These are classic distributed-systems problems. First entry point: Production Observability (Phase C, Weeks 13–14).

**Discipline:** neither of these belongs in the MVP. A single Node process and SQLite are correct until the problem is real. Adding distributed infrastructure before there's load is over-engineering that slows the product down — introduce it exactly when parallel evals and production ingestion demand it, not before.

---

## 6. Feature Breakdown by Module

### 6.1 Builder
- Natural language → full LangGraph project
- Streaming file generation with live file tree
- Tool integration templates: starts with Gmail, Slack, Postgres/Supabase, generic HTTP/REST at MVP; growing toward a 500+ connector library over time (CRMs, ATS, accounting APIs, and more, aligned with the 12 supported categories)
- Conversational editing with diff cards
- Auto-generated `.env` template + secrets manager (keys stored locally, encrypted)

### 6.2 Graph View
- Auto-layout flow diagram from LangGraph structure
- Node inspector (prompt, model, tool schema, memory config)
- Two-way sync with code
- Execution highlighting (live glow on active node)

### 6.3 Debugger
- Live trace timeline (all step types)
- Pause / inspect / resume
- Step-level state diff (before/after)
- Re-run from step with edited state
- Full prompt/response viewer with token + cost breakdown
- Error steps with stack trace + "fix this" chat shortcut
- Run history with search/filter

### 6.4 Eval Engine
- Dataset builder (manual entries, CSV import, or generate from description)
- Parallel multi-provider execution
- LLM-as-judge scoring with editable rubric
- Comparison dashboard: quality / cost / latency per provider
- Per-example drill-down into full traces
- Export results (CSV/JSON)

### 6.5 Deploy
- Dockerfile + config generation
- One-click deploy: Railway, Fly.io, Cloud Run
- Env var management
- Production trace streaming back into the debugger

---

## 7. MVP Scope & Roadmap

### MVP (Weeks 1–4) — the tight loop
- Prompt → LangGraph project generation (streamed)
- One provider pair (Claude + OpenAI dropdown) — MVP subset; the long-term target is 5-6+ providers (see Section 5.4), added incrementally after MVP
- 3 tool templates (Gmail, Slack, Postgres) — MVP subset; the long-term target is a 500+ connector library (see Section 5.4), added incrementally by category priority
- Graph View (read-only inspector)
- Run + live Trace Timeline
- Diff-card conversational editing
- Cmd+K palette, dark theme, three-pane layout

### Phase 2 (Months 2–3) — depth + launch
- Pause/inspect/resume, re-run from step
- Eval engine v1 (dataset + judge + comparison dashboard)
- Public launch: HN, Twitter/X, LangChain Discord
- Iterate on real user feedback

### Phase 3 (Months 4–6) — ship layer, demand-driven
- One-click deploy (start with Railway)
- Production trace streaming
- More providers (Gemini, open models via OpenRouter)
- Expand only what daily users ask for

**Discipline rule:** do not start the next layer until the current one has daily active users.

---

## 8. Week-by-Week Build Plan (Start → Production-Ready)

Legend: 🔴 **Self-code** (every line hand-written and understood) · 🟡 **Vibe + review** (AI writes, every line read and verified) · 🟢 **Vibe-code** (AI writes, light review — verify by using it)

Two ordering principles behind this plan:
1. **Debugger before generation.** You cannot verify generated agents without a trace. Building the debugger first makes generation testing free.
2. **Something runnable at the end of every week.** No 4-week dark tunnels.

---

### PHASE A — CORE LOOP (Weeks 1–4) → MVP

#### Week 1 — Foundation (the self-code week)

| Task | Mode | Detail |
|---|---|---|
| Event schema (Run/Step model) | 🔴 | Days 1–2. Finalize on paper before any code: step types (`llm_call`, `tool_call`, `state_update`, `router`), fields (input, output, state_before/after, tokens, cost, latency, error, parent_step_id). This schema is the product's foundation — freeze it. |
| Hand-written test agent | 🔴 | Day 2. A simple LangGraph agent (2 tools, e.g. weather + calculator) written manually. This is your permanent test fixture for everything that follows. |
| Python event interceptor | 🔴 | Days 2–4. LangChain/LangGraph callbacks (`on_chain_start`, `on_llm_end`, `on_tool_end`, etc.) → JSON events matching the schema → emitted over stdout/socket. The most critical code in the product. |
| Node.js server + process manager v1 | 🔴 | Days 5–6. Spawn/kill the Python subprocess, capture its event stream, handle crashes and zombie processes. |
| WebSocket relay + SQLite persistence | 🟡 | Day 7. Pipe events server → browser; persist runs/steps to SQLite. AI writes the plumbing; you verify event ordering and reconnection behavior. |

✅ **Checkpoint:** run the test agent from terminal → JSON events appear live in a browser console. Zero UI, core proven.

#### Week 2 — Trace Timeline (the first vibe-code week)

| Task | Mode | Detail |
|---|---|---|
| Vite + React + TS + Tailwind scaffold | 🟢 | Project setup, dark theme tokens, 4px grid, JetBrains Mono. |
| Three-pane resizable layout | 🟢 | react-resizable-panels; chat pane empty for now; layout state persists. |
| Trace Timeline UI | 🟢 | Steps stream in live via WebSocket; slide-in animation (120ms); expand a step → full prompt/response, tokens, cost, latency; color-coded status (green/red/amber); live "Working for Xs" ticker. |
| Run history list | 🟢 | Past runs from SQLite, click → load trace. |
| WebSocket client + event store | 🟡 | Zustand store holding runs/steps. AI writes it; you verify no dropped/duplicated/reordered events — a corrupted trace is a lying product. |

✅ **Checkpoint:** run the test agent → watch its execution live in a real timeline UI. **This moment is the product.**

#### Week 3 — Generation (Build layer v1)

| Task | Mode | Detail |
|---|---|---|
| Builder AI prompting layer | 🟡 | Prompt → Claude API → complete LangGraph project (agent.py, tools/, prompts/, config, .env template). The system prompt and project template are your product sense — own them. Code structure around the API call: AI. |
| Streaming file generation UX | 🟢 | Files appear one by one, token-by-token, in a live file tree. |
| Code viewer | 🟢 | shiki highlighting, file tabs, read-only for now. |
| 3 tool templates | 🟡 | Gmail, Slack, Postgres/Supabase tool wrappers the builder can inject — the MVP starting subset of the eventual 500+ connector library. AI drafts; you verify auth flows and error handling. |
| Provider dropdown (Claude + OpenAI) | 🟢 | One-line swap in generated code (`ChatAnthropic` ↔ `ChatOpenAI`) + model picker — the MVP starting pair of the eventual 5-6+ provider target. |
| Run button wiring | 🟡 | Generated project → process manager → trace. First real integration test of Weeks 1–2 work. |

✅ **Checkpoint:** type a prompt → agent generates → click Run → watch its trace. Half the loop is alive.

#### Week 4 — Fix Loop (MVP complete)

| Task | Mode | Detail |
|---|---|---|
| Conversational editing | 🟡 | Chat message + current code → Claude proposes changes. Prompting: yours. Plumbing: AI. |
| Diff cards + Apply/Undo | 🟡 | UI (side-by-side diff, +adds/−removes, Review button): 🟢 vibe. **File mutation + revert logic: read every line** — a bad write corrupts the user's project. Keep checkpoints for every applied diff. |
| Test input persistence + `R` re-run | 🟢 | Last input remembered; R re-runs instantly. |
| Basic error display | 🟢 | Failed steps expand with stack trace. |
| End-to-end hardening | 🔴 | A full day of you breaking your own loop: kill mid-run, malformed generation, API timeouts. Fix what falls over. |

✅ **Checkpoint:** *Describe → See → Fix* works end to end. **This is the MVP. Record the demo video now.**

---

### PHASE B — DIFFERENTIATORS + LAUNCH (Weeks 5–8)

#### Week 5 — Graph View + Polish

| Task | Mode | Detail |
|---|---|---|
| Graph View | 🟢 | React Flow: auto-layout from LangGraph structure, node inspector (prompt/model/tool schema), pan/zoom. |
| Execution glow + trace↔graph linking | 🟡 | Active node pulses during runs; click trace step → node highlights, and vice versa. AI builds; you verify the sync logic against the event stream. |
| Cmd+K palette + keyboard nav | 🟢 | cmdk; J/K trace navigation, Enter expand, Cmd+P file switcher, Cmd+/ chat focus; shortcuts shown inline. |
| One-Click Fix | 🟢 | Error card → "Ask Jaroku to fix" → chat pre-filled with error + code context. |
| Design pass | 🟢 | Density audit, spacing grid, color discipline, micro-animations. |

#### Week 6 — Debug Depth (the second self-code week)

| Task | Mode | Detail |
|---|---|---|
| Pause / inspect / resume | 🔴 | The hairiest engineering in the product: interrupt the LangGraph run at step boundaries, serialize state, hold the process, resume cleanly. Interview-depth work. |
| State snapshot + diff view | 🔴 | state_before/state_after capture at every step; UI renders the diff (🟢 for rendering only). |
| Re-run from step with edited state | 🔴 | Deserialize edited state, restart execution from a chosen node. |
| Run branching | 🟡 | Each re-run-from-step creates a branch; original run intact; branch tree in run history. Data model: yours. UI: AI. |
| Embedded terminal | 🟢 | xterm.js tab streaming raw agent stdout. |

#### Week 7 — Eval Engine v1

| Task | Mode | Detail |
|---|---|---|
| Dataset builder | 🟢 | Manual entries, CSV import, "promote test input to dataset" one-click. |
| Parallel multi-provider runner | 🟡 | Same agent × N providers × M examples, concurrently, via the process manager. Concurrency limits and failure isolation: verify carefully. |
| LLM-as-judge scoring | 🟡 | Judge prompt + editable rubric: yours (this is product quality). Orchestration: AI. |
| Cost/latency accounting | 🟡 | Aggregated from trace data. Verify the math — wrong cost numbers destroy trust instantly. |
| Comparison dashboard | 🟢 | Provider × metric table, per-example drill-down into full traces, CSV/JSON export. |
| Mid-run provider handoff | 🟡 | Right-click trace step → "Re-run from here with GPT." Builds on Week 6 re-run machinery. |

#### Week 8 — Package + Launch

| Task | Mode | Detail |
|---|---|---|
| Tauri wrap | 🟢 | Web app → desktop app; menus, auto-update, app icon. |
| Local secrets manager | 🟡 | API keys encrypted at rest (OS keychain). Security-adjacent: read every line. |
| Onboarding flow | 🟢 | First-run: add keys → example prompt → first agent in <3 min. |
| Docs + README + landing page | 🟢 | Synara-grade copy discipline: short, factual, no hype. |
| Demo video (60–90s) | — | The loop, nothing else: prompt → trace → fix → re-run. |
| **LAUNCH** | — | HN (Show HN), Twitter/X, LangChain Discord, r/LangChain. |

✅ **Checkpoint:** public, installable, demoable. Weeks 9+ are driven by real users, not the plan.

---

### PHASE C — ITERATION + DEPLOY LAYER (Weeks 9–16)

#### Weeks 9–10 — Feedback Sprint

| Task | Mode | Detail |
|---|---|---|
| Bug triage from launch | mixed | Expect trace-corruption edge cases (🔴) and UI papercuts (🟢). |
| Onboarding friction fixes | 🟢 | Watch 5 real users; fix every stumble. |
| Top-3 requested features | mixed | Users write the roadmap now. Mode depends on what they ask. |
| Crash/error telemetry (opt-in) | 🟡 | Anonymous, off by default (Synara-style privacy posture). |

#### Weeks 11–12 — Ship Layer v1 (Deploy)

*Gate: only start if the debugger has daily active users.*

| Task | Mode | Detail |
|---|---|---|
| Dockerfile generation | 🟡 | Wrapper around the generated agent; env var injection. AI drafts; you test images actually build and run. |
| Railway one-click deploy | 🟢 | Railway API: create project, set env vars, deploy, return URL. |
| Deploy status UI | 🟢 | Build logs streaming, success/fail states, deployed-agent card. |
| Secrets handoff | 🔴 | Local keys → deployment env vars. Security-critical: hand-written. |

#### Weeks 13–14 — Production Observability

| Task | Mode | Detail |
|---|---|---|
| Production trace streaming | 🔴🟡 | Deployed agents emit the same event schema back to Jaroku (interceptor ships inside the Docker image). Transport + auth token: 🔴. Ingestion plumbing: 🟡. |
| Dev vs prod run separation | 🟢 | Environment badge on runs; filterable history. |
| Alerting v1 | 🟢 | Failed production run → local notification. |

#### Weeks 15–16 — Production-Ready Hardening

| Task | Mode | Detail |
|---|---|---|
| More providers (Gemini, Grok, others) + OpenRouter | 🟢 | Dropdown additions toward the 5-6+ provider target; eval matrix widens. Connector library also keeps expanding by category priority toward the 500+ target. |
| Load/soak testing | 🔴 | 1,000-step traces, 8-hour agent runs, 50-example evals: find where memory, SQLite, and the UI virtualization break. |
| Trace virtualization + pagination | 🟡 | Timeline stays smooth at 10k+ steps. |
| Data migration safety | 🔴 | Schema versioning for SQLite; users' historical traces must survive updates. |
| Fly.io / Cloud Run targets | 🟢 | Second and third deploy targets, same abstraction as Railway. |
| v1.0 | — | Production-ready: stable schema, hardened loop, deploy + prod observability, 3 providers. |

---

### Effort Summary by Mode

| Mode | Share | Where it concentrates |
|---|---|---|
| 🔴 Self-code | ~25% | Event schema, interceptor, process manager, pause/resume, state machinery, security, hardening |
| 🟡 Vibe + review | ~30% | Streaming plumbing, file mutations, eval orchestration, deploy glue, anything touching money or user files |
| 🟢 Vibe-code | ~45% | All UI, all rendering, all polish, integrations with well-documented APIs |

**The standing rule:** where a mistake is cheap (UI, glue), take the speed. Where a mistake is expensive (core primitive, state, processes, security, user files), take the ownership.

---

## 9. Success Metrics

| Metric | Target (post-launch) |
|---|---|
| Time from prompt → first successful agent run | < 3 minutes |
| % of sessions using the fix-by-talking loop ≥ 2× | > 60% |
| Weekly active builders | 20–30 within first month of launch |
| Eval runs per active user per week | ≥ 1 |
| "Aha" qualitative signal | Users share trace screenshots unprompted |

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| LangGraph API churn | Pin versions; abstract event capture behind an internal interface |
| Generation quality plateau | Generation is not the moat — the see/fix loop is; invest there |
| Big players (Cursor, LangSmith) converge | Speed + focus on the non-expert agent builder they ignore |
| Solo-builder scope creep | MVP scope is frozen; new features require user demand evidence |
| Distribution (biggest solo risk) | Launch early, consider open-sourcing the debugger core as the wedge |

---

## 11. Brand Voice

- **Name:** Jaroku
- **Personality:** calm, precise, engineer-grade. No hype words in UI copy.
- **UI copy style:** short, factual, present tense ("Worked for 4m 29s", "Edited 3 files, +42 −11")
- **The promise, everywhere:** *Claude Code writes it. Jaroku shows you it works. Then ships it.*

---

## 12. Document Changelog

- **v1:** Initial vision, core loop, MVP scope, week-by-week build plan, distributed-systems appendix.
- **v2 (this revision):** Added the North Star ("best place for developers to build agents they can actually trust"); repositioned generation as commodity and the post-generation loop (trace/debug/eval/ship) as the actual moat; added the 12-category scope with a sequential, template-pack-based delivery model; added the competitive landscape (LangGraph Studio, LangConfig, AgentTrace/AgentPrism, Langfuse/LangSmith/Braintrust/Laminar) and the strategic implication of avoiding head-on competition with official/funded incumbents; overhauled the DX/UX section with the finalized 3-column layout (agent-home sidebar, Claude-Code-style merged chat+code center, tabbed Graph/Trace/Evals right panel), the restraint-based visual system (borderless panels, muted brand icons except when active, the finalized near-black color palette), arrived at after multiple design iterations moving away from an initial cluttered 4-panel layout.
- **Open question carried forward:** exactly which one or two categories to build the first template pack against remains a decision to make before or during Week 3 (Generation) of the build plan — likely Workflow-Automation or Sales/CRM based on market research showing indie-heavy adoption and thin existing tooling.
