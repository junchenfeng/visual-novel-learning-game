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

/**
 * 取内置 `node:sqlite` 的 DatabaseSync。
 *
 * **必须走 `process.getBuiltinModule`，不能用 `require("node:sqlite")`**：Next 的服务端
 * 构建会把后者改写成 URL 型 external，运行期直接抛
 * `Cannot find module 'node:sqlite': Unsupported external type Url for commonjs reference`，
 * 于是 Web 侧**每一次受理**都 `enqueue_failed`（2026-10-10 部署异步队列时线上实测：
 * 5 个 e2e 用例全部「提交未受理」；worker 走 tsx 不经打包，所以它照常启动，
 * 只有 Web 侧挂——这种半边故障很容易误判成队列满）。
 * `getBuiltinModule` 只是 process 上的一个属性访问，打包器不会碰它。
 */
function loadSqlite(): { DatabaseSync: new (file: string) => StateDb } {
  const getBuiltinModule = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
  if (typeof getBuiltinModule !== "function") {
    throw new Error("当前 Node 不支持 process.getBuiltinModule（需要 Node >= 22.3）");
  }
  const mod = getBuiltinModule.call(process, "node:sqlite") as { DatabaseSync?: new (file: string) => StateDb } | undefined;
  if (!mod?.DatabaseSync) {
    throw new Error("node:sqlite 不可用（需要 Node >= 22.5；22.x 还要 --experimental-sqlite，24 起免开关）");
  }
  return { DatabaseSync: mod.DatabaseSync };
}

export function openStateDb(dir = ingestDataDir()): StateDb {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Node >=22.13; production and local Node 24 verified. No external DB service.
  const { DatabaseSync } = loadSqlite();
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
