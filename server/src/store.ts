// SQLite persistence for runs + steps (doc §5.2 trace store: SQLite -> Postgres later).
// Uses Node's built-in node:sqlite (no native build). JSON payload fields are stored as TEXT.

import { DatabaseSync } from "node:sqlite";
import type { Run, Step } from "./types.ts";

export class TraceStore {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id          TEXT PRIMARY KEY,
        agent_id    TEXT NOT NULL,
        provider    TEXT NOT NULL,
        model       TEXT NOT NULL,
        status      TEXT NOT NULL,
        started_at  TEXT NOT NULL,
        ended_at    TEXT,
        cost        REAL NOT NULL DEFAULT 0,
        tokens      INTEGER NOT NULL DEFAULT 0,
        error       TEXT
      );
      CREATE TABLE IF NOT EXISTS steps (
        id             TEXT PRIMARY KEY,
        run_id         TEXT NOT NULL,
        seq            INTEGER NOT NULL,
        type           TEXT NOT NULL,
        name           TEXT NOT NULL,
        input          TEXT,
        output         TEXT,
        state_before   TEXT,
        state_after    TEXT,
        tokens         INTEGER,
        cost           REAL,
        latency_ms     REAL NOT NULL DEFAULT 0,
        error          TEXT,
        parent_step_id TEXT,
        started_at     TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(id)
      );
      CREATE INDEX IF NOT EXISTS idx_steps_run_seq ON steps(run_id, seq);
    `);
  }

  private static j(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    return JSON.stringify(v);
  }

  // Insert (or replace, for the run_end update) a run.
  upsertRun(run: Run): void {
    this.db
      .prepare(
        `INSERT INTO runs (id, agent_id, provider, model, status, started_at, ended_at, cost, tokens, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status=excluded.status, ended_at=excluded.ended_at,
           cost=excluded.cost, tokens=excluded.tokens, error=excluded.error`,
      )
      .run(
        run.id, run.agent_id, run.provider, run.model, run.status,
        run.started_at, run.ended_at, run.cost, run.tokens, run.error,
      );
  }

  insertStep(step: Step): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO steps
           (id, run_id, seq, type, name, input, output, state_before, state_after,
            tokens, cost, latency_ms, error, parent_step_id, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        step.id, step.run_id, step.seq, step.type, step.name,
        TraceStore.j(step.input), TraceStore.j(step.output),
        TraceStore.j(step.state_before), TraceStore.j(step.state_after),
        step.tokens, step.cost, step.latency_ms, step.error,
        step.parent_step_id, step.started_at,
      );
  }

  listRuns(limit = 50): Run[] {
    return this.db
      .prepare(`SELECT * FROM runs ORDER BY started_at DESC LIMIT ?`)
      .all(limit) as unknown as Run[];
  }

  stepsForRun(runId: string): Step[] {
    return this.db
      .prepare(`SELECT * FROM steps WHERE run_id = ? ORDER BY seq ASC`)
      .all(runId) as unknown as Step[];
  }

  close(): void {
    this.db.close();
  }
}
