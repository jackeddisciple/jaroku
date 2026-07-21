// Run bar: which agent, on which provider/model, with what input.
//
// This turns the stand-in into the second half of the loop — it now targets a *generated*
// agent (agentId) and forwards provider + model, so the same project can be run free on the
// dry-run model or against a real provider without regenerating anything.
//
// Fake is the default on purpose: the free path exercises every generated tool and costs
// nothing, so the reflex of pressing Run is never expensive.

import { useState } from "react";
import { useTraceStore } from "../store/traceStore.ts";
import { useBuildStore } from "../store/buildStore.ts";
import { sendRun } from "../lib/socket.ts";

const PROVIDERS = [
  { id: "fake", label: "Dry run (free)", models: ["fake-dry-run"] },
  { id: "anthropic", label: "Claude", models: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-4-8"] },
  { id: "openai", label: "OpenAI", models: ["gpt-4o-mini", "gpt-4o"] },
];

export function RunTrigger() {
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState("fake");
  const [model, setModel] = useState("fake-dry-run");
  const connected = useTraceStore((s) => s.connection === "open");
  const agents = useBuildStore((s) => s.agents);
  const activeAgentId = useBuildStore((s) => s.activeAgentId);
  const selectAgent = useBuildStore((s) => s.selectAgent);

  const models = PROVIDERS.find((p) => p.id === provider)?.models ?? [];
  const agent = agents.find((a) => a.agent_id === activeAgentId);
  const canRun = connected && Boolean(activeAgentId) && (agent?.runnable ?? false);

  const onProvider = (id: string) => {
    setProvider(id);
    setModel(PROVIDERS.find((p) => p.id === id)?.models[0] ?? "");
  };

  const submit = () => {
    if (!canRun) return;
    // provider "fake" still forwards explicitly — the runner should never have to guess.
    sendRun(input.trim(), provider, model, activeAgentId ?? undefined);
  };

  const select =
    "bg-panel text-ink text-[12px] rounded px-2 py-2 outline-none focus:ring-1 focus:ring-[#2a2a2e] cursor-pointer";

  return (
    <div className="flex items-center gap-2 px-6 py-3 shrink-0 border-t border-hair">
      <select
        value={activeAgentId ?? ""}
        onChange={(e) => selectAgent(e.target.value || null)}
        className={select}
        title="Agent to run"
      >
        {agents.length === 0 && <option value="">no agents</option>}
        {agents.map((a) => (
          <option key={a.agent_id} value={a.agent_id}>
            {a.name}
          </option>
        ))}
      </select>

      <select value={provider} onChange={(e) => onProvider(e.target.value)} className={select} title="Provider">
        {PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>

      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        disabled={provider === "fake"}
        className={`${select} disabled:opacity-40`}
        title="Model"
      >
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="agent input — press Enter to run"
        className="flex-1 min-w-0 bg-panel text-ink placeholder:text-faint rounded px-3 py-2 outline-none focus:ring-1 focus:ring-[#2a2a2e]"
      />

      <button
        onClick={submit}
        disabled={!canRun}
        className="rounded px-4 py-2 bg-panel text-ink hover:bg-active disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Run
      </button>
    </div>
  );
}
