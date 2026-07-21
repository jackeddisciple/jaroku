// The Build pane — describe an agent, pick connectors, watch it get written.
//
// Connector selection is explicit UI rather than something the model infers from the
// prompt: the reviewed templates are copied in verbatim, so which ones are included is a
// decision the user makes, not a guess the generation re-rolls each time.

import { useState } from "react";
import { useBuildStore } from "../store/buildStore.ts";
import { useTraceStore } from "../store/traceStore.ts";
import { sendGenerate } from "../lib/socket.ts";
import { FileTree } from "./FileTree.tsx";

// Mirrors runtime/tool_templates/catalog.json. The server validates the ids it receives
// against the catalog, so a stale entry here can never inject an unreviewed connector.
const CONNECTORS = [
  { id: "gmail", label: "Gmail", hint: "search mail, draft replies" },
  { id: "slack", label: "Slack", hint: "read channels, post messages" },
  { id: "postgres", label: "Postgres", hint: "read-only SQL" },
];

function StatusLine() {
  const status = useBuildStore((s) => s.status);
  const error = useBuildStore((s) => s.error);
  const problems = useBuildStore((s) => s.problems);
  const usage = useBuildStore((s) => s.usage);
  const fileCount = useBuildStore((s) => s.fileOrder.length);

  if (status === "idle") return null;

  if (status === "error") {
    return (
      <div className="px-6 py-3 text-[12px]">
        <div className="text-err">Generation failed — {error}</div>
        {problems.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-muted">
            {problems.map((p, i) => (
              <li key={i} className="pl-3">· {p}</li>
            ))}
          </ul>
        )}
        <div className="mt-1.5 text-faint">Nothing was written — any previous agent is untouched.</div>
      </div>
    );
  }

  if (status === "generating") {
    return (
      <div className="px-6 py-3 text-[12px] text-run">
        Generating… {fileCount > 0 && <span className="text-muted">{fileCount} file(s) so far</span>}
      </div>
    );
  }

  return (
    <div className="px-6 py-3 text-[12px]">
      <span className="text-ok">Ready</span>{" "}
      <span className="text-muted">
        {fileCount} files
        {usage && (
          <>
            {" · "}
            {usage.output_tokens.toLocaleString()} output tokens · ${usage.cost_usd.toFixed(4)}
            {usage.cache_read_input_tokens > 0 && (
              <span className="text-faint"> · cache hit</span>
            )}
          </>
        )}
      </span>
    </div>
  );
}

export function BuildPane() {
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const status = useBuildStore((s) => s.status);
  const connected = useTraceStore((s) => s.connection === "open");
  const busy = status === "generating";

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = () => {
    if (!connected || busy || !prompt.trim()) return;
    sendGenerate(prompt.trim(), selected, name.trim() || undefined);
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="px-6 pt-5 pb-4 shrink-0">
        <div className="text-[11px] uppercase tracking-widest text-faint mb-3">Build</div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          disabled={busy}
          rows={4}
          placeholder="Describe the agent you want — e.g. “a support agent that reads Gmail, looks up orders in Postgres, and drafts replies”"
          className="w-full resize-none bg-panel text-ink placeholder:text-faint rounded px-3 py-2.5 outline-none focus:ring-1 focus:ring-[#2a2a2e] disabled:opacity-50"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-faint mr-1">Connectors</span>
          {CONNECTORS.map((c) => {
            const on = selected.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                disabled={busy}
                title={c.hint}
                className={`rounded px-2.5 py-1 text-[12px] transition-colors disabled:opacity-50 ${
                  on ? "bg-active text-ink" : "bg-panel text-muted hover:text-ink"
                }`}
              >
                {on ? "✓ " : ""}
                {c.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            placeholder="name (optional)"
            className="flex-1 bg-panel text-ink placeholder:text-faint rounded px-3 py-2 text-[12px] outline-none focus:ring-1 focus:ring-[#2a2a2e] disabled:opacity-50"
          />
          <button
            onClick={submit}
            disabled={!connected || busy || !prompt.trim()}
            className="rounded px-4 py-2 bg-panel text-ink hover:bg-active disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>

      <StatusLine />

      <div className="px-6 pb-1 shrink-0">
        <div className="text-[11px] uppercase tracking-widest text-faint">Files</div>
      </div>
      <div className="flex-1 overflow-auto">
        <FileTree />
      </div>
    </div>
  );
}
