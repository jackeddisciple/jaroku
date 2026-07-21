// Wires the pipeline: ProcessManager (Python agent) -> TraceStore (SQLite) -> WsRelay (browser).
//
//   uv-spawned agent  --stdout JSON-->  ProcessManager  --event-->  { persist + broadcast }
//
// Run:  npm run dev        (in server/)
// Then open http://localhost:4317 to watch traces live.

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { ProcessManager } from "./processManager.ts";
import { TraceStore } from "./store.ts";
import { WsRelay, type ClientCommand } from "./wsRelay.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(__dirname, "..");
const REPO_DIR = resolve(SERVER_DIR, "..");
const RUNTIME_DIR = join(REPO_DIR, "runtime");
const DB_PATH = process.env.JAROKU_DB ?? join(SERVER_DIR, "jaroku.db");
const PORT = Number(process.env.JAROKU_PORT ?? 4317);

const store = new TraceStore(DB_PATH);
const manager = new ProcessManager();

const relay = new WsRelay({
  port: PORT,
  store,
  clientHtmlPath: join(SERVER_DIR, "debug-client.html"),
  onCommand: (cmd: ClientCommand) => {
    if (cmd.cmd === "run") runAgent(cmd.input, cmd.provider, cmd.model);
  },
});

// --- pipeline ---------------------------------------------------------------
manager.on("event", (event) => {
  // Persist first (source of truth), then broadcast to live clients.
  try {
    if (event.kind === "run_start" || event.kind === "run_end") {
      store.upsertRun(event.run);
    } else if (event.kind === "step") {
      store.insertStep(event.step);
    }
  } catch (err) {
    console.error("[store] failed to persist event:", (err as Error).message);
  }
  relay.broadcast(event);
});

manager.on("parseError", ({ line, error }) => {
  console.error(`[manager] non-event stdout line (${error}):`, line.slice(0, 200));
  relay.broadcastLog("parseError", `${error}: ${line.slice(0, 200)}`);
});

manager.on("stderr", (line) => {
  console.error("[agent]", line);
  relay.broadcastLog("stderr", line);
});

manager.on("spawnError", (err) => {
  console.error("[manager] spawn error:", err.message);
});

manager.on("exit", ({ code, signal }) => {
  console.log(`[manager] agent exited (code=${code} signal=${signal})`);
});

// --- run trigger ------------------------------------------------------------
function runAgent(input?: string, provider?: string, model?: string): void {
  if (manager.running) {
    console.log("[manager] agent already running; ignoring run request");
    return;
  }
  console.log(`[manager] starting agent${input ? ` — "${input}"` : ""}`);
  // Model is forwarded explicitly so a real-provider run can't silently fall back to
  // the agent's expensive default; unset means the agent picks its own default.
  const env: NodeJS.ProcessEnv = {};
  if (provider) env.JAROKU_PROVIDER = provider;
  if (model) env.JAROKU_MODEL = model;
  manager.start({
    runtimeDir: RUNTIME_DIR,
    input,
    env: Object.keys(env).length ? env : undefined,
  });
}

// Kick off one run on startup unless suppressed (set JAROKU_NO_AUTORUN=1 to just serve).
if (process.env.JAROKU_NO_AUTORUN !== "1") {
  // Small delay so the relay is listening before the first events land.
  setTimeout(() => runAgent(), 300);
}

// --- graceful shutdown ------------------------------------------------------
function shutdown(): void {
  console.log("\n[server] shutting down…");
  manager.stop();
  store.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
