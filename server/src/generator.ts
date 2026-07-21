// Builder AI layer (doc §8, 🟡): prompt -> Claude -> a complete LangGraph project, streamed.
//
// Safety properties this module is responsible for:
//   * Staging + atomic swap. Files are written to agents/.staging/<id>/ and only moved into
//     agents/<id>/ after validation passes. A crash, a truncated stream, or a rule violation
//     leaves any previously working agent untouched.
//   * Path confinement. Every path the model emits is checked; absolute paths, "..", and
//     anything escaping the staging root are rejected outright.
//   * The API key never leaves this process. It is read from runtime/.env and is never
//     logged, echoed to a client, or written into a generated file.
//
// Cost control: the stable half of the prompt carries a cache breakpoint, and
// JAROKU_GEN_FIXTURE records/replays a generation so streaming UX can be iterated for free.

import Anthropic from "@anthropic-ai/sdk";
import { EventEmitter } from "node:events";
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
import { loadConnectors, requiredEnv, resolveSelected, templatesDir, type Connector } from "./connectors.ts";
import { FileProtocolParser, type ProtocolEvent } from "./fileProtocol.ts";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.ts";
import { validateProject } from "./validator.ts";

export const GENERATION_MODEL = process.env.JAROKU_GEN_MODEL ?? "claude-haiku-4-5";
const MAX_TOKENS = 16000;
const STAGING_DIRNAME = ".staging";

export interface GenerateOptions {
  runtimeDir: string;
  prompt: string;
  connectors?: string[];
  name?: string;
}

export interface GeneratorEvents {
  file_start: [{ path: string }];
  file_delta: [{ path: string; text: string }];
  file_end: [{ path: string }];
  done: [{ agentId: string; name: string; files: string[]; usage: UsageSummary }];
  error: [{ message: string; problems?: string[] }];
}

export interface UsageSummary {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cost_usd: number;
}

// claude-haiku-4-5 list price, USD per token. Cache reads ~0.1x, writes ~1.25x.
const PRICE_IN = 1e-6;
const PRICE_OUT = 5e-6;

export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const cleaned = /^[a-z]/.test(base) ? base : `agent_${base}`;
  return cleaned.replace(/_+$/, "") || "agent";
}

export function agentsDir(runtimeDir: string): string {
  return join(runtimeDir, "agents");
}

function uniqueAgentId(runtimeDir: string, desired: string): string {
  let id = desired;
  let n = 2;
  while (existsSync(join(agentsDir(runtimeDir), id))) id = `${desired}_${n++}`;
  return id;
}

/** Reject anything that could write outside the project directory. */
export function safeRelativePath(root: string, candidate: string): string | null {
  if (!candidate || isAbsolute(candidate) || candidate.includes("\0")) return null;
  const normalized = normalize(candidate).replace(/^(\.\/)+/, "");
  if (normalized.startsWith("..")) return null;
  const resolved = join(root, normalized);
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return normalized;
}

export class Generator extends EventEmitter<GeneratorEvents> {
  private client: Anthropic | null = null;

  private anthropic(): Anthropic {
    if (!this.client) {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("ANTHROPIC_API_KEY is not set (expected in runtime/.env)");
      this.client = new Anthropic({ apiKey: key });
    }
    return this.client;
  }

  async generate(opts: GenerateOptions): Promise<void> {
    const { runtimeDir } = opts;
    const all = loadConnectors(runtimeDir);
    const selected = resolveSelected(all, opts.connectors);

    const name = (opts.name?.trim() || opts.prompt.trim().split("\n")[0] || "agent").slice(0, 60);
    const agentId = uniqueAgentId(runtimeDir, slugify(opts.name?.trim() || opts.prompt));

    const staging = join(agentsDir(runtimeDir), STAGING_DIRNAME, agentId);
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });

    const buffers = new Map<string, string>();
    let usage: UsageSummary = {
      input_tokens: 0, output_tokens: 0,
      cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cost_usd: 0,
    };

    const onEvent = (event: ProtocolEvent) => {
      if (event.type === "file_start") {
        const safe = safeRelativePath(staging, event.path);
        if (!safe) throw new Error(`refusing unsafe generated path: ${event.path}`);
        buffers.set(event.path, "");
        this.emit("file_start", { path: safe });
      } else if (event.type === "file_delta") {
        buffers.set(event.path, (buffers.get(event.path) ?? "") + event.text);
        this.emit("file_delta", { path: event.path, text: event.text });
      } else {
        // Write on close: a file exists on disk only once it is complete.
        const safe = safeRelativePath(staging, event.path)!;
        const target = join(staging, safe);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, buffers.get(event.path) ?? "", "utf8");
        this.emit("file_end", { path: safe });
      }
    };

    const parser = new FileProtocolParser(onEvent);

    try {
      const fixture = process.env.JAROKU_GEN_FIXTURE;
      if (fixture && existsSync(fixture)) {
        await replayFixture(fixture, (chunk) => parser.push(chunk));
      } else {
        const raw = await this.streamGeneration(all, {
          prompt: opts.prompt, agentId, agentName: name, connectors: selected,
        }, (chunk) => parser.push(chunk), (u) => (usage = u));
        if (fixture) writeFileSync(fixture, raw, "utf8"); // record for future free runs
      }

      const protocolError = parser.finish();
      if (protocolError) throw new Error(protocolError);

      // Host-owned files. Written after the model's, so the model cannot shadow them.
      const connectorFiles = this.installConnectors(staging, selected, runtimeDir);
      this.writeHostFiles(staging, { agentId, name, description: opts.prompt, selected });

      const result = await validateProject(staging, {
        runtimeDir,
        connectorFiles,
        // Connector tools are real tool objects too — calling one directly crashes the
        // same way, so they must be part of the "do not call directly" set.
        connectorToolNames: selected.flatMap((c) => c.tools.map((t) => t.name)),
      });
      if (!result.ok) {
        rmSync(staging, { recursive: true, force: true });
        this.emit("error", {
          message: "the generated project failed validation and was discarded",
          problems: result.problems,
        });
        return;
      }

      this.commit(staging, join(agentsDir(runtimeDir), agentId));
      this.emit("done", { agentId, name, files: parser.files, usage });
    } catch (err) {
      rmSync(staging, { recursive: true, force: true });
      this.emit("error", { message: (err as Error).message });
    }
  }

  private async streamGeneration(
    allConnectors: Connector[],
    req: { prompt: string; agentId: string; agentName: string; connectors: Connector[] },
    onChunk: (text: string) => void,
    onUsage: (u: UsageSummary) => void,
  ): Promise<string> {
    let raw = "";
    const stream = this.anthropic().messages.stream({
      model: GENERATION_MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: buildSystemPrompt(allConnectors),
          // Stable across every generation -> cache hit on all but the first call.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: buildUserPrompt(req) }],
    });

    stream.on("text", (delta) => {
      raw += delta;
      onChunk(delta);
    });

    const final = await stream.finalMessage();
    const u = final.usage;
    onUsage({
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
      cost_usd:
        u.input_tokens * PRICE_IN +
        u.output_tokens * PRICE_OUT +
        (u.cache_read_input_tokens ?? 0) * PRICE_IN * 0.1 +
        (u.cache_creation_input_tokens ?? 0) * PRICE_IN * 1.25,
    });
    return raw;
  }

  /** Copy reviewed connector templates in verbatim. Returns their project-relative paths. */
  private installConnectors(staging: string, selected: Connector[], runtimeDir: string): string[] {
    const toolsDir = join(staging, "tools");
    mkdirSync(toolsDir, { recursive: true });
    const written: string[] = [];
    for (const c of selected) {
      const src = join(templatesDir(runtimeDir), c.file);
      if (!existsSync(src)) continue;
      copyFileSync(src, join(toolsDir, c.file)); // byte-for-byte; never re-rendered
      written.push(join("tools", c.file));
    }
    return written;
  }

  private writeHostFiles(
    staging: string,
    meta: { agentId: string; name: string; description: string; selected: Connector[] },
  ): void {
    const env = requiredEnv(meta.selected);

    writeFileSync(
      join(staging, "jaroku.json"),
      JSON.stringify(
        {
          agent_id: meta.agentId,
          name: meta.name,
          description: meta.description.trim().slice(0, 500),
          entry: "agent",
          schema_version: 1,
          connectors: meta.selected.map((c) => c.id),
          required_env: env,
          default_provider: "fake",
          created_at: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    // Merge connector env into whatever the model wrote, so .env.example is complete even
    // if the model forgot a key.
    const envPath = join(staging, ".env.example");
    const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
    const missing = env.filter((k) => !existing.includes(k));
    if (missing.length) {
      const block = ["", "# Required by the connectors this agent uses:", ...missing.map((k) => `${k}=`), ""].join("\n");
      writeFileSync(envPath, `${existing.trimEnd()}\n${block}`, "utf8");
    } else if (!existing) {
      writeFileSync(envPath, "# This agent needs no credentials.\n", "utf8");
    }

    // Package markers so `agents.<id>.agent` imports cleanly.
    writeFileSync(join(staging, "__init__.py"), `"""${meta.name} — generated by Jaroku."""\n`, "utf8");
  }

  /** Replace agents/<id>/ with the staged project, keeping the old copy until it succeeds. */
  private commit(staging: string, target: string): void {
    const backup = `${target}.replaced-${Date.now()}`;
    if (existsSync(target)) renameSync(target, backup);
    try {
      mkdirSync(dirname(target), { recursive: true });
      renameSync(staging, target);
    } catch (err) {
      if (existsSync(backup)) renameSync(backup, target); // put it back
      throw err;
    }
    rmSync(backup, { recursive: true, force: true });
  }
}

/** Replay a recorded generation, chunked and paced, so the UI behaves as it would live. */
async function replayFixture(path: string, onChunk: (text: string) => void): Promise<void> {
  const raw = readFileSync(path, "utf8");
  const size = 24;
  for (let i = 0; i < raw.length; i += size) {
    onChunk(raw.slice(i, i + size));
    await new Promise((r) => setTimeout(r, 4));
  }
}
