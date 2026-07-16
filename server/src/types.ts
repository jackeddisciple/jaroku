// Mirrors schema/events.md (v1). Keep in sync with runtime/jaroku_interceptor/schema.py.

export const SCHEMA_VERSION = 1;

export type RunStatus = "running" | "completed" | "error";
export type StepType = "llm_call" | "tool_call" | "state_update" | "router";

export interface Run {
  id: string;
  agent_id: string;
  provider: string;
  model: string;
  status: RunStatus;
  started_at: string;
  ended_at: string | null;
  cost: number;
  tokens: number;
  error: string | null;
}

export interface Step {
  id: string;
  run_id: string;
  seq: number;
  type: StepType;
  name: string;
  input: unknown;
  output: unknown;
  state_before: unknown;
  state_after: unknown;
  tokens: number | null;
  cost: number | null;
  latency_ms: number;
  error: string | null;
  parent_step_id: string | null;
  started_at: string;
}

export type TraceEvent =
  | { kind: "run_start"; schema_version: number; run: Run }
  | { kind: "step"; schema_version: number; step: Step }
  | { kind: "run_end"; schema_version: number; run: Run };

export function isTraceEvent(v: unknown): v is TraceEvent {
  if (typeof v !== "object" || v === null) return false;
  const k = (v as { kind?: unknown }).kind;
  return k === "run_start" || k === "step" || k === "run_end";
}
