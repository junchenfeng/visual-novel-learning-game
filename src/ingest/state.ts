import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

type Statement = {
  run(...args: unknown[]): { changes: number | bigint };
  get(...args: unknown[]): Record<string, unknown> | undefined;
  all(...args: unknown[]): Record<string, unknown>[];
};
export type StateDb = { exec(sql: string): void; prepare(sql: string): Statement; close(): void };

export function ingestDataDir(): string {
  return process.env.INGEST_DATA_DIR || (process.env.JEST_WORKER_ID
    ? path.join(tmpdir(), `poem-ingest-test-${process.pid}`)
    : path.join(process.cwd(), ".cache", "ingest"));
}

export function openStateDb(dir = ingestDataDir()): StateDb {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Node >=22.13; production and local Node 24 verified. No external DB service.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (file: string) => StateDb };
  const file = path.join(dir, "queue.sqlite");
  const db = new DatabaseSync(file);
  chmodSync(file, 0o600);
  db.exec(`PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS locks (name TEXT PRIMARY KEY, token TEXT NOT NULL, pid INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, dedup TEXT NOT NULL,
      state TEXT NOT NULL, created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER,
      payload TEXT NOT NULL, zip BLOB, zip_bytes INTEGER NOT NULL,
      result TEXT, error TEXT, timings TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS active_dedup ON jobs(dedup) WHERE state IN ('queued','running');
    CREATE INDEX IF NOT EXISTS jobs_state_created ON jobs(state,created_at);
  `);
  return db;
}

export function transaction<T>(db: StateDb, run: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try { const result = run(); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}

/** Same-host cross-process mutex. Never expires a live owner during slow OSS writes. */
export async function acquireIngestLock(name: string, timeoutMs = 60_000, dir = ingestDataDir()): Promise<() => void> {
  const db = openStateDb(dir), token = randomUUID(), deadline = Date.now() + timeoutMs;
  try {
    for (;;) {
      const acquired = transaction(db, () => {
        const owner = db.prepare("SELECT pid FROM locks WHERE name=?").get(name);
        if (owner && alive(Number(owner.pid))) return false;
        db.prepare("DELETE FROM locks WHERE name=?").run(name);
        db.prepare("INSERT INTO locks VALUES (?,?,?)").run(name, token, process.pid);
        return true;
      });
      if (acquired) return () => {
        try { db.prepare("DELETE FROM locks WHERE name=? AND token=?").run(name, token); }
        finally { db.close(); }
      };
      if (Date.now() >= deadline) throw new Error(`ingest lock busy: ${name}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } catch (error) { db.close(); throw error; }
}

export async function withIngestLock<T>(name: string, run: () => Promise<T>): Promise<T> {
  const release = await acquireIngestLock(name);
  try { return await run(); } finally { release(); }
}
