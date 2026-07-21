// Live file tree — files appear one by one as they generate (doc §4.3: everything streams,
// no spinners). Reuses the trace timeline's 120ms slide-in so a generation and a run feel
// like the same product rather than two features bolted together.
//
// Order is arrival order, not alphabetical: this is a build log. Watching agent.py land
// first, then tools/, then prompts/, is the thing the user is here to see.

import { orderedFiles, useBuildStore } from "../store/buildStore.ts";

function FileRow({
  path,
  complete,
  bytes,
  active,
  streaming,
  onClick,
}: {
  path: string;
  complete: boolean;
  bytes: number;
  active: boolean;
  streaming: boolean;
  onClick: () => void;
}) {
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  const base = path.slice(dir.length);

  return (
    <button
      onClick={onClick}
      className={`relative w-full text-left px-4 py-2 animate-slide-in transition-colors ${
        active ? "bg-active" : "hover:bg-panel/60"
      }`}
    >
      {active && <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-ink" />}
      <div className="flex items-center gap-2">
        <span className={complete ? "text-ok" : "text-run animate-pulse"}>
          {complete ? "✓" : "●"}
        </span>
        <span className="truncate">
          {dir && <span className="text-faint">{dir}</span>}
          <span className="text-ink">{base}</span>
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-faint tabular-nums">
          {streaming ? "writing…" : `${bytes} B`}
        </span>
      </div>
    </button>
  );
}

export function FileTree() {
  const files = useBuildStore((s) => s.files);
  const fileOrder = useBuildStore((s) => s.fileOrder);
  const activeFile = useBuildStore((s) => s.activeFile);
  const streamingFile = useBuildStore((s) => s.streamingFile);
  const selectFile = useBuildStore((s) => s.selectFile);
  const status = useBuildStore((s) => s.status);

  const list = orderedFiles({ files, fileOrder });

  if (list.length === 0) {
    return (
      <div className="px-6 py-6 text-[12px] text-muted">
        {status === "generating"
          ? "Waiting for the first file…"
          : "Files will appear here as they are generated."}
      </div>
    );
  }

  return (
    <div>
      {list.map((f) => (
        <FileRow
          key={f.path}
          path={f.path}
          complete={f.complete}
          bytes={f.content.length}
          active={f.path === activeFile}
          streaming={f.path === streamingFile}
          onClick={() => selectFile(f.path)}
        />
      ))}
    </div>
  );
}
