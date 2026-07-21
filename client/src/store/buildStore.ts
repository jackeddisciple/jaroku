// Build/generation state — deliberately a SEPARATE store from traceStore.
//
// The trace store has invariants that keep the trace honest (dedupe by step id, render in
// seq order, never arrival order). Generation has none of those needs and would only add
// churn to a store whose correctness matters. They share a socket and nothing else.

import { create } from "zustand";
import type { AgentSummary, GenUsage } from "../types.ts";

export type GenStatus = "idle" | "generating" | "done" | "error";

export interface GenFile {
  path: string;
  content: string;
  complete: boolean;
}

interface BuildState {
  status: GenStatus;
  prompt: string;
  files: Record<string, GenFile>;
  fileOrder: string[]; // arrival order — this is a build log, not a sorted tree
  activeFile: string | null;
  streamingFile: string | null;
  error: string | null;
  problems: string[];
  usage: GenUsage | null;

  agents: AgentSummary[];
  activeAgentId: string | null;

  startGeneration: (prompt: string) => void;
  fileStart: (path: string) => void;
  fileDelta: (path: string, text: string) => void;
  fileEnd: (path: string) => void;
  finish: (agentId: string, usage: GenUsage) => void;
  fail: (message: string, problems?: string[]) => void;
  selectFile: (path: string) => void;
  setAgents: (agents: AgentSummary[]) => void;
  selectAgent: (agentId: string | null) => void;
}

export const useBuildStore = create<BuildState>((set) => ({
  status: "idle",
  prompt: "",
  files: {},
  fileOrder: [],
  activeFile: null,
  streamingFile: null,
  error: null,
  problems: [],
  usage: null,
  agents: [],
  activeAgentId: null,

  startGeneration: (prompt) =>
    set({
      status: "generating",
      prompt,
      files: {},
      fileOrder: [],
      activeFile: null,
      streamingFile: null,
      error: null,
      problems: [],
      usage: null,
    }),

  fileStart: (path) =>
    set((s) => ({
      files: { ...s.files, [path]: { path, content: "", complete: false } },
      fileOrder: s.fileOrder.includes(path) ? s.fileOrder : [...s.fileOrder, path],
      streamingFile: path,
      // Follow the stream: the newest file is what the user wants to watch.
      activeFile: path,
    })),

  fileDelta: (path, text) =>
    set((s) => {
      const prev = s.files[path];
      if (!prev) return {};
      return { files: { ...s.files, [path]: { ...prev, content: prev.content + text } } };
    }),

  fileEnd: (path) =>
    set((s) => {
      const prev = s.files[path];
      if (!prev) return {};
      return {
        files: { ...s.files, [path]: { ...prev, complete: true } },
        streamingFile: s.streamingFile === path ? null : s.streamingFile,
      };
    }),

  finish: (agentId, usage) =>
    set({ status: "done", streamingFile: null, usage, activeAgentId: agentId }),

  fail: (message, problems) =>
    set({ status: "error", error: message, problems: problems ?? [], streamingFile: null }),

  selectFile: (path) => set({ activeFile: path }),

  setAgents: (agents) =>
    set((s) => ({
      agents,
      // Keep a selection if it still exists; otherwise fall back to the newest agent.
      activeAgentId:
        s.activeAgentId && agents.some((a) => a.agent_id === s.activeAgentId)
          ? s.activeAgentId
          : (agents[0]?.agent_id ?? null),
    })),

  selectAgent: (activeAgentId) => set({ activeAgentId }),
}));

/** Files in arrival order — the order they streamed in, which is the order they were built. */
export function orderedFiles(state: {
  files: Record<string, GenFile>;
  fileOrder: string[];
}): GenFile[] {
  return state.fileOrder.map((p) => state.files[p]).filter((f): f is GenFile => Boolean(f));
}
