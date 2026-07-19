import { useEffect } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Sidebar } from "./components/Sidebar.tsx";
import { TraceTimeline } from "./components/TraceTimeline.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { startSocket } from "./lib/socket.ts";

export function App() {
  useEffect(() => {
    startSocket();
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* top bar */}
      <div className="flex items-center gap-2 px-4 h-10 shrink-0 bg-panel">
        <span className="text-ink font-semibold">Jaroku</span>
        <span className="text-faint">·</span>
        <span className="text-muted text-[12px]">live trace</span>
      </div>

      {/* two-pane resizable body (chat pane + graph/eval tabs deferred to later weeks) */}
      <PanelGroup direction="horizontal" autoSaveId="jaroku-layout" className="flex-1">
        <Panel defaultSize={22} minSize={15} maxSize={40}>
          <Sidebar />
        </Panel>
        <PanelResizeHandle className="w-[3px] bg-hair hover:bg-[#3a3a3f] transition-colors" />
        <Panel defaultSize={78}>
          <TraceTimeline />
        </Panel>
      </PanelGroup>

      <StatusBar />
    </div>
  );
}
