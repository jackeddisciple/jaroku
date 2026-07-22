// Shared Anthropic plumbing for the generation and edit flows: one lazy client, one
// usage/cost accounting. The API key is read from the process env (loaded from runtime/.env
// by index.ts) and never logged, echoed to a client, or written anywhere.

import Anthropic from "@anthropic-ai/sdk";

export interface UsageSummary {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cost_usd: number;
}

// claude-haiku-4-5 list price, USD per token. Cache reads ~0.1x, writes ~1.25x.
export const PRICE_IN = 1e-6;
export const PRICE_OUT = 5e-6;

let client: Anthropic | null = null;

export function anthropicClient(): Anthropic {
  if (!client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set (expected in runtime/.env)");
    client = new Anthropic({ apiKey: key });
  }
  return client;
}

export function summarizeUsage(u: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): UsageSummary {
  return {
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    cost_usd:
      u.input_tokens * PRICE_IN +
      u.output_tokens * PRICE_OUT +
      (u.cache_read_input_tokens ?? 0) * PRICE_IN * 0.1 +
      (u.cache_creation_input_tokens ?? 0) * PRICE_IN * 1.25,
  };
}

export function emptyUsage(): UsageSummary {
  return {
    input_tokens: 0, output_tokens: 0,
    cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cost_usd: 0,
  };
}
