"""JarokuTracer — the LangChain/LangGraph callback handler that turns agent execution
into Jaroku trace events (doc §5.1 "Event Interceptor", §8).

Mapping:
  on_chat_model_start / on_llm_start  + on_llm_end   -> Step(type="llm_call")
  on_tool_start                       + on_tool_end  -> Step(type="tool_call")
  on_chain_start (langgraph node)     + on_chain_end -> Step(type="state_update")

Design notes:
  * ``seq`` is assigned at *start* time, so steps sort in causal start order even though
    each Step is emitted at *end* time (when output/latency/error are known).
  * ``parent_step_id`` is resolved through LangChain's ``parent_run_id`` chain: every
    LangChain run_id is registered to its Jaroku step id at start, so children can look
    up their parent.
  * The tracer must never crash the agent it observes — payload capture is best-effort.
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Optional
from uuid import UUID

from langchain_core.callbacks import BaseCallbackHandler

from .schema import Run, Step, emit_step

# Rough per-token USD pricing (input, output) for cost estimation. Extend as providers grow.
# Numbers are per single token (i.e. per-million-price / 1_000_000).
_PRICING = {
    "claude-opus-4-8": (15e-6, 75e-6),
    "claude-sonnet-5": (3e-6, 15e-6),
    "claude-haiku-4-5": (0.8e-6, 4e-6),
    "gpt-4o": (2.5e-6, 10e-6),
    "gpt-4o-mini": (0.15e-6, 0.6e-6),
}


def _price_for(model: str) -> Optional[tuple[float, float]]:
    for key, price in _PRICING.items():
        if key in model:
            return price
    return None


class _Pending:
    __slots__ = ("step_id", "seq", "type", "name", "input", "state_before", "t0", "parent")

    def __init__(self, step_id, seq, type_, name, input_, state_before, t0, parent):
        self.step_id = step_id
        self.seq = seq
        self.type = type_
        self.name = name
        self.input = input_
        self.state_before = state_before
        self.t0 = t0
        self.parent = parent


class JarokuTracer(BaseCallbackHandler):
    def __init__(self, run: Run):
        self.run = run
        self._seq = 0
        self._pending: dict[UUID, _Pending] = {}
        self._runid_to_stepid: dict[UUID, str] = {}

    # ---- helpers -------------------------------------------------------------
    def _next_seq(self) -> int:
        s = self._seq
        self._seq += 1
        return s

    def _parent_step(self, parent_run_id: Optional[UUID]) -> Optional[str]:
        if parent_run_id is None:
            return None
        return self._runid_to_stepid.get(parent_run_id)

    def _begin(self, run_id, parent_run_id, type_, name, input_, state_before=None) -> None:
        step_id = str(uuid.uuid4())
        self._runid_to_stepid[run_id] = step_id
        self._pending[run_id] = _Pending(
            step_id=step_id,
            seq=self._next_seq(),
            type_=type_,
            name=name,
            input_=input_,
            state_before=state_before,
            t0=time.perf_counter(),
            parent=self._parent_step(parent_run_id),
        )

    def _finish(self, run_id, *, output=None, state_after=None, tokens=None,
                cost=None, error=None) -> None:
        pend = self._pending.pop(run_id, None)
        if pend is None:
            return
        step = Step(
            id=pend.step_id,
            run_id=self.run.id,
            seq=pend.seq,
            type=pend.type,
            name=pend.name,
            input=pend.input,
            output=output,
            state_before=pend.state_before,
            state_after=state_after,
            tokens=tokens,
            cost=cost,
            latency_ms=round((time.perf_counter() - pend.t0) * 1000, 3),
            error=error,
            parent_step_id=pend.parent,
        )
        emit_step(step)

    # ---- LLM -----------------------------------------------------------------
    def on_chat_model_start(self, serialized, messages, *, run_id, parent_run_id=None,
                            **kwargs) -> None:
        name = (serialized or {}).get("name") or "chat_model"
        self._begin(run_id, parent_run_id, "llm_call", name, input_=messages)

    def on_llm_start(self, serialized, prompts, *, run_id, parent_run_id=None,
                     **kwargs) -> None:
        name = (serialized or {}).get("name") or "llm"
        self._begin(run_id, parent_run_id, "llm_call", name, input_=prompts)

    def on_llm_end(self, response, *, run_id, **kwargs) -> None:
        tokens = self._extract_tokens(response)
        cost = self._estimate_cost(tokens_pair=self._extract_token_pair(response))
        if tokens is not None:
            self.run.tokens += tokens
        if cost is not None:
            self.run.cost = round(self.run.cost + cost, 8)
        self._finish(run_id, output=self._extract_generations(response),
                     tokens=tokens, cost=cost)

    def on_llm_error(self, error, *, run_id, **kwargs) -> None:
        self._finish(run_id, error=self._fmt_error(error))

    # ---- Tools ---------------------------------------------------------------
    def on_tool_start(self, serialized, input_str, *, run_id, parent_run_id=None,
                      **kwargs) -> None:
        name = (serialized or {}).get("name") or "tool"
        self._begin(run_id, parent_run_id, "tool_call", name, input_=input_str)

    def on_tool_end(self, output, *, run_id, **kwargs) -> None:
        self._finish(run_id, output=output)

    def on_tool_error(self, error, *, run_id, **kwargs) -> None:
        self._finish(run_id, error=self._fmt_error(error))

    # ---- Chains / LangGraph nodes -------------------------------------------
    def on_chain_start(self, serialized, inputs, *, run_id, parent_run_id=None,
                       metadata=None, **kwargs) -> None:
        node = (metadata or {}).get("langgraph_node")
        if not node:
            # Not a graph node (top-level graph, RunnableSequence, etc.) — skip.
            return
        self._begin(run_id, parent_run_id, "state_update", node,
                    input_=inputs, state_before=inputs)

    def on_chain_end(self, outputs, *, run_id, **kwargs) -> None:
        if run_id not in self._pending:
            return
        self._finish(run_id, output=outputs, state_after=outputs)

    def on_chain_error(self, error, *, run_id, **kwargs) -> None:
        if run_id not in self._pending:
            return
        self._finish(run_id, error=self._fmt_error(error))

    # ---- extraction utils ----------------------------------------------------
    @staticmethod
    def _fmt_error(error: BaseException) -> str:
        return f"{type(error).__name__}: {error}"

    @staticmethod
    def _extract_generations(response) -> Any:
        try:
            gens = response.generations
            out = []
            for batch in gens:
                for g in batch:
                    msg = getattr(g, "message", None)
                    if msg is not None:
                        item: dict[str, Any] = {"content": getattr(msg, "content", None)}
                        tool_calls = getattr(msg, "tool_calls", None)
                        if tool_calls:
                            item["tool_calls"] = tool_calls
                        out.append(item)
                    else:
                        out.append(getattr(g, "text", None))
            return out
        except Exception:
            return None

    @staticmethod
    def _extract_token_pair(response) -> Optional[tuple[int, int]]:
        """Return (input_tokens, output_tokens) if discoverable, else None."""
        # 1) llm_output.token_usage / usage
        try:
            llm_out = response.llm_output or {}
            usage = llm_out.get("token_usage") or llm_out.get("usage") or {}
            it = usage.get("prompt_tokens") or usage.get("input_tokens")
            ot = usage.get("completion_tokens") or usage.get("output_tokens")
            if it is not None or ot is not None:
                return int(it or 0), int(ot or 0)
        except Exception:
            pass
        # 2) message.usage_metadata (Anthropic/OpenAI via langchain-core)
        try:
            it = ot = 0
            found = False
            for batch in response.generations:
                for g in batch:
                    um = getattr(getattr(g, "message", None), "usage_metadata", None)
                    if um:
                        it += int(um.get("input_tokens", 0))
                        ot += int(um.get("output_tokens", 0))
                        found = True
            if found:
                return it, ot
        except Exception:
            pass
        return None

    def _extract_tokens(self, response) -> Optional[int]:
        pair = self._extract_token_pair(response)
        return None if pair is None else pair[0] + pair[1]

    def _estimate_cost(self, tokens_pair: Optional[tuple[int, int]]) -> Optional[float]:
        if tokens_pair is None:
            return None
        price = _price_for(self.run.model)
        if price is None:
            return None
        in_tok, out_tok = tokens_pair
        return round(in_tok * price[0] + out_tok * price[1], 8)
