import { orderedRuns, useTraceStore } from "../store/traceStore.ts";
import type { RunSummary, RunStatus } from "../types.ts";
import { relTime } from "../lib/format.ts";
import { sendLoadRun } from "../lib/socket.ts";

function StatusGlyph({ status }: { status: RunStatus }) {
  if (status === "running")
    return <span className="text-run animate-pulse" title="running">●</span>;
  if (status === "error") return <span className="text-err" title="error">✗</span>;
  return <span className="text-ok" title="completed">✓</span>;
}

function RunRow({ run }: { run: RunSummary }) {
  const activeRunId = useTraceStore((s) => s.activeRunId);
  const selectRun = useTraceStore((s) => s.selectRun);
  const needsLoad = useTraceStore((s) => s.needsLoad);
  const active = run.id === activeRunId;

  const onClick = () => {
    if (needsLoad(run.id)) sendLoadRun(run.id);
    selectRun(run.id);
  };

  return (
    <button
      onClick={onClick}
      className={`relative w-full text-left px-4 py-2.5 transition-colors ${
        active ? "bg-active" : "hover:bg-panel/60"
      }`}
    >
      {active && <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-ink" />}
      <div className="flex items-center gap-2">
        <StatusGlyph status={run.status} />
        <span className="text-ink truncate">{run.agent_id}</span>
        <span className="ml-auto text-faint text-[11px] shrink-0">{relTime(run.started_at)}</span>
      </div>
      <div className="mt-0.5 pl-5 text-[11px] text-muted flex items-center gap-1.5">
        <span className="text-faint">{run.provider}</span>
        {run.step_count != null && (
          <>
            <span className="text-faint">·</span>
            <span>{run.step_count} steps</span>
          </>
        )}
      </div>
    </button>
  );
}

export function Sidebar() {
  const runs = useTraceStore((s) => s.runs);
  const list = orderedRuns(runs);

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="px-4 py-3 shrink-0 flex items-center">
        <span className="text-[11px] uppercase tracking-widest text-faint">Runs</span>
        <span className="ml-auto text-faint text-[11px]">{list.length}</span>
      </div>
      <div className="flex-1 overflow-auto">
        {list.length === 0 ? (
          <div className="px-4 py-6 text-muted text-[12px]">No runs yet.</div>
        ) : (
          list.map((r) => <RunRow key={r.id} run={r} />)
        )}
      </div>
    </div>
  );
}
