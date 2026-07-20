// Reducer-aware state diff for `state_update` steps.
//
// The honest-diff problem: LangGraph gives us `state_before` = the node's full input state,
// but `state_after` = the node's *return value*, which is a PARTIAL update — the reducer
// (e.g. `add_messages`) merges it into the state after the node returns. Real captured data:
//
//   state_before: { messages: [3 msgs] }      state_after: { messages: [1 new msg] }
//
// A literal deep-diff reads that as "3 removed, 1 added" and paints the conversation red on
// every step. That is a lying UI. So: removals are only ever rendered when they are provable
// (before is a prefix of after, or a value genuinely changed / went away in a full state).
// Otherwise the after-value is treated as an update and its items render as additions, with
// the untouched prior items reported as a count.

export type EntryKind = "added" | "removed" | "changed" | "unchanged";

/** One item line inside a list-valued key. */
export interface DiffItem {
  kind: "added" | "removed";
  value: unknown;
}

export interface DiffEntry {
  key: string;
  kind: EntryKind;
  /** Set for scalar/object `changed` and `removed`. */
  before?: unknown;
  /** Set for scalar/object `changed` and `added`. */
  after?: unknown;
  /** Set when both sides are arrays: the per-item lines to render. */
  items?: DiffItem[];
  /** Array only: items carried over from `before` that this step did not touch. */
  carriedOver?: number;
  /** True when `after` was a partial (reducer-merged) update rather than the full list. */
  partial?: boolean;
  /** Short right-aligned label, e.g. "+1 item" / "changed". */
  summary: string;
}

export interface StateDiff {
  entries: DiffEntry[];
  /** Keys present in `before` that `after` never mentions — untouched, NOT removed. */
  untouchedKeys: string[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Structural equality via canonical JSON. Payloads here are already JSON-safe. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** True when `a` is a leading prefix of `b` (item-wise deep equality). */
function isPrefixOf(a: unknown[], b: unknown[]): boolean {
  return a.length <= b.length && a.every((v, i) => deepEqual(v, b[i]));
}

/**
 * Diff one key whose value is an array on both sides.
 *
 * Removals are rendered ONLY when provable — i.e. when the two lists share a leading
 * prefix, which is the signature of `after` being a full post-state view of `before`.
 * Any other shape is treated as a partial (reducer-merged) update: its items are
 * additions and the prior items are reported as an untouched count. Guessing "removed"
 * from a same-length or disjoint list would paint the whole conversation red on a step
 * that only appended one message.
 */
function diffArrays(key: string, before: unknown[], after: unknown[]): DiffEntry {
  // `before` ⊑ `after`: full post-state, tail is genuinely new.
  if (isPrefixOf(before, after)) {
    const addedItems = after.slice(before.length);
    if (addedItems.length === 0) {
      return { key, kind: "unchanged", items: [], summary: "unchanged" };
    }
    return {
      key,
      kind: "added",
      items: addedItems.map((value) => ({ kind: "added" as const, value })),
      carriedOver: before.length,
      summary: `+${plural(addedItems.length, "item")}`,
    };
  }

  // `after` ⊏ `before`: full post-state with the tail genuinely dropped. The one case
  // where a removal is provable.
  if (isPrefixOf(after, before)) {
    const removedItems = before.slice(after.length);
    return {
      key,
      kind: "removed",
      items: removedItems.map((value) => ({ kind: "removed" as const, value })),
      carriedOver: after.length,
      summary: `−${plural(removedItems.length, "item")}`,
    };
  }

  // No prefix relation — `after` is this step's update, not the whole list.
  return {
    key,
    kind: "added",
    items: after.map((value) => ({ kind: "added" as const, value })),
    carriedOver: before.length,
    partial: true,
    summary: `+${plural(after.length, "item")}`,
  };
}

/**
 * Diff a step's `state_before` against `state_after`.
 *
 * Returns an empty diff when either side isn't a plain object — the caller falls back to
 * the raw JSON view rather than inventing structure.
 */
export function diffState(before: unknown, after: unknown): StateDiff | null {
  if (!isPlainObject(before) || !isPlainObject(after)) return null;

  const entries: DiffEntry[] = [];
  for (const key of Object.keys(after)) {
    const a = after[key];
    if (!(key in before)) {
      entries.push({ key, kind: "added", after: a, summary: "added" });
      continue;
    }
    const b = before[key];
    if (deepEqual(b, a)) {
      entries.push({ key, kind: "unchanged", before: b, after: a, summary: "unchanged" });
      continue;
    }
    if (Array.isArray(b) && Array.isArray(a)) {
      entries.push(diffArrays(key, b, a));
      continue;
    }
    entries.push({ key, kind: "changed", before: b, after: a, summary: "changed" });
  }

  // Keys the update never mentions are untouched. Calling them removals is the lie.
  const untouchedKeys = Object.keys(before).filter((k) => !(k in after));

  return { entries, untouchedKeys };
}

/**
 * One-line summary of a value for a diff row. LangChain messages get a readable shape
 * (`ai · "text"` / `tool get_weather → "18°C"`); everything else falls back to compact JSON.
 * The full payload is always one toggle away in the raw view.
 */
export function summarizeItem(value: unknown): string {
  if (!isPlainObject(value)) {
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }

  const type = typeof value["type"] === "string" ? (value["type"] as string) : null;
  if (type) {
    const parts: string[] = [type];
    const name = value["name"];
    if (typeof name === "string" && name) parts.push(name);

    const calls = value["tool_calls"];
    if (Array.isArray(calls) && calls.length > 0) {
      const names = calls
        .map((c) => (isPlainObject(c) && typeof c["name"] === "string" ? c["name"] : "?"))
        .join(", ");
      parts.push(`→ ${names}`);
    }

    const content = value["content"];
    if (typeof content === "string" && content) parts.push(JSON.stringify(content));
    else if (Array.isArray(content) && content.length) parts.push(`[${content.length} blocks]`);

    return parts.join(" · ");
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
