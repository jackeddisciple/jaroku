// WebSocket relay (doc §8): pushes trace events to browser clients in real time, and
// serves the static debug client over the same HTTP port. On connect, a client receives the
// run history snapshot; thereafter it receives live events as they arrive.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { WebSocketServer, WebSocket } from "ws";
import type { TraceStore } from "./store.ts";
import type { TraceEvent } from "./types.ts";

export type RunCommand = {
  cmd: "run";
  input?: string;
  provider?: string;
  model?: string;
  agentId?: string;
};
export type LoadRunCommand = { cmd: "loadRun"; runId: string };
export type GenerateCommand = {
  cmd: "generate";
  prompt: string;
  connectors?: string[];
  name?: string;
};
export type ListAgentsCommand = { cmd: "listAgents" };
export type ClientCommand = RunCommand | LoadRunCommand | GenerateCommand | ListAgentsCommand;

// Generation rides its own channel, deliberately parallel to "trace". It never enters the
// trace store or the event schema — schema/events.md v1 stays frozen.
export type GenEvent =
  | { type: "file_start"; path: string }
  | { type: "file_delta"; path: string; text: string }
  | { type: "file_end"; path: string }
  | { type: "started"; prompt: string }
  | { type: "done"; agentId: string; name: string; files: string[]; usage: unknown }
  | { type: "error"; message: string; problems?: string[] };

export interface RelayOptions {
  port: number;
  store: TraceStore;
  clientHtmlPath: string;
  // "loadRun" and "listAgents" are answered locally; the rest are forwarded.
  onCommand?: (cmd: RunCommand | GenerateCommand) => void;
  listAgents?: () => unknown[];
}

export class WsRelay {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private store: TraceStore;
  private onCommand?: (cmd: RunCommand | GenerateCommand) => void;

  constructor(private opts: RelayOptions) {
    this.store = opts.store;
    this.onCommand = opts.onCommand;

    const http = createServer((req, res) => this.serveStatic(req, res));
    this.wss = new WebSocketServer({ server: http });

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      // Snapshot: recent runs + the agent list so a reconnecting client isn't blank.
      this.sendTo(ws, { channel: "history", runs: this.store.listRuns() });
      this.sendTo(ws, { channel: "agents", agents: this.opts.listAgents?.() ?? [] });

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString()) as ClientCommand;
          if (!msg || typeof msg.cmd !== "string") return;
          if (msg.cmd === "run") {
            this.onCommand?.(msg);
          } else if (msg.cmd === "generate" && typeof msg.prompt === "string") {
            this.onCommand?.(msg);
          } else if (msg.cmd === "listAgents") {
            this.sendTo(ws, { channel: "agents", agents: this.opts.listAgents?.() ?? [] });
          } else if (msg.cmd === "loadRun" && typeof msg.runId === "string") {
            // Answer only the requesting client with that run's steps (ordered by seq).
            this.sendTo(ws, {
              channel: "runSteps",
              runId: msg.runId,
              steps: this.store.stepsForRun(msg.runId),
            });
          }
        } catch {
          /* ignore malformed client messages */
        }
      });
      ws.on("close", () => this.clients.delete(ws));
      ws.on("error", () => this.clients.delete(ws));
    });

    http.listen(opts.port, () => {
      console.log(`[relay] http+ws listening on http://localhost:${opts.port}`);
    });
  }

  private async serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.url === "/" || req.url === "/index.html") {
      try {
        const html = await readFile(this.opts.clientHtmlPath);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
      } catch {
        res.writeHead(500).end("debug client not found");
      }
      return;
    }
    res.writeHead(404).end("not found");
  }

  private sendTo(ws: WebSocket, payload: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }

  // Broadcast a trace event to every connected client.
  broadcast(event: TraceEvent): void {
    const msg = JSON.stringify({ channel: "trace", event });
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  // Broadcast a diagnostic (stderr line, parse error) for visibility in the client.
  broadcastLog(level: "stderr" | "parseError", text: string): void {
    const msg = JSON.stringify({ channel: "log", level, text });
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  // Broadcast a generation event. Separate channel from "trace" by design.
  broadcastGen(event: GenEvent): void {
    const msg = JSON.stringify({ channel: "gen", ...event });
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  // Push a refreshed agent list to everyone (after a generation lands).
  broadcastAgents(): void {
    const msg = JSON.stringify({ channel: "agents", agents: this.opts.listAgents?.() ?? [] });
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }
}
