// WebSocket client for the Jaroku relay. Mirrors the reconnect pattern of the Week-1
// debug-client.html (1s backoff) and dispatches each server message into the trace store.
// The relay only speaks WebSocket, so this is the single channel between UI and pipeline.

import { useTraceStore } from "../store/traceStore.ts";
import type { ClientCommand, ServerMessage } from "../types.ts";

const WS_URL = import.meta.env.VITE_JAROKU_WS ?? `ws://localhost:4317`;
const RECONNECT_MS = 1000;

let ws: WebSocket | null = null;
let started = false;

function dispatch(msg: ServerMessage): void {
  const s = useTraceStore.getState();
  switch (msg.channel) {
    case "history":
      s.applyHistory(msg.runs);
      break;
    case "trace":
      s.applyEvent(msg.event);
      break;
    case "runSteps":
      s.applyRunSteps(msg.runId, msg.steps);
      break;
    case "log":
      s.addLog({ level: msg.level, text: msg.text });
      break;
  }
}

function connect(): void {
  useTraceStore.getState().setConnection("connecting");
  ws = new WebSocket(WS_URL);

  ws.onopen = () => useTraceStore.getState().setConnection("open");

  ws.onmessage = (ev) => {
    try {
      dispatch(JSON.parse(ev.data as string) as ServerMessage);
    } catch {
      /* ignore malformed server frames */
    }
  };

  ws.onclose = () => {
    useTraceStore.getState().setConnection("closed");
    ws = null;
    setTimeout(connect, RECONNECT_MS); // auto-reconnect
  };

  // On error the socket also fires close; let close drive reconnection.
  ws.onerror = () => ws?.close();
}

/** Start the singleton connection once (safe under React StrictMode double-invoke). */
export function startSocket(): void {
  if (started) return;
  started = true;
  connect();
}

function send(cmd: ClientCommand): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(cmd));
}

export function sendRun(input?: string, provider?: string): void {
  send({ cmd: "run", input: input || undefined, provider });
}

export function sendLoadRun(runId: string): void {
  send({ cmd: "loadRun", runId });
}
