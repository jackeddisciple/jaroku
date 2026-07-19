import { useState } from "react";
import { useTraceStore } from "../store/traceStore.ts";
import { sendRun } from "../lib/socket.ts";

// Stand-in for the deferred chat pane (Week 4): a single input that triggers a run so the
// loop is interactive. The run_start event auto-focuses the new run in the timeline.
export function RunTrigger() {
  const [input, setInput] = useState("");
  const connected = useTraceStore((s) => s.connection === "open");

  const submit = () => {
    if (!connected) return;
    sendRun(input.trim());
  };

  return (
    <div className="flex items-center gap-2 px-6 py-3 shrink-0 border-t border-hair">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="agent input (optional) — press Enter to run"
        className="flex-1 bg-panel text-ink placeholder:text-faint rounded px-3 py-2 outline-none focus:ring-1 focus:ring-[#2a2a2e]"
      />
      <button
        onClick={submit}
        disabled={!connected}
        className="rounded px-4 py-2 bg-panel text-ink hover:bg-active disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Run
      </button>
    </div>
  );
}
