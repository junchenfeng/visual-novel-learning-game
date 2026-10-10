import { createHash, randomUUID } from "node:crypto";
import { openStateDb, transaction, type StateDb } from "./state";
import type { IngestResult } from "./issues";

export type JobInput = { userId: string; poetId: string; workTitle: string; origin?: string };
export type JobState = "queued" | "running" | "completed" | "failed";
export type JobStatus = {
  jobId: string; status: JobState; createdAt: string; startedAt?: string; finishedAt?: string;
  result?: IngestResult; error?: string; timings?: Record<string, number>; pollAfterMs: number;
};
export class QueueFullError extends Error {}
export class IngestQueue {
  readonly db: StateDb;
  constructor(dir?: string) { this.db = openStateDb(dir); }
  close() { this.db.close(); }
  enqueue(input: JobInput, zip: Buffer): JobStatus {
    const dedup = createHash("sha256").update(JSON.stringify([input.userId, input.poetId, input.workTitle])).update(zip).digest("hex");
    const id = transaction(this.db, () => {
      const existing = this.db.prepare("SELECT id FROM jobs WHERE dedup=? AND state IN ('queued','running')").get(dedup);
      if (existing) return String(existing.id);
      const totals = this.db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(zip_bytes),0) AS bytes FROM jobs WHERE state IN ('queued','running')").get()!;
      if (Number(totals.n) >= 100 || Number(totals.bytes) + zip.length > 512 * 1024 * 1024) {
        throw new QueueFullError("审核队列已满，请稍后重试");
      }
      const jobId = randomUUID();
      this.db.prepare("INSERT INTO jobs(id,user_id,dedup,state,created_at,payload,zip,zip_bytes) VALUES (?,?,?,'queued',?,?,?,?)")
        .run(jobId, input.userId, dedup, Date.now(), JSON.stringify(input), zip, zip.length);
      return jobId;
    });
    return this.status(id, input.userId)!;
  }
  status(id: string, userId: string): JobStatus | null {
    const row = this.db.prepare("SELECT id,state,created_at,started_at,finished_at,result,error,timings FROM jobs WHERE id=? AND user_id=?").get(id,userId);
    if (!row) return null;
    return {
      jobId: String(row.id), status: row.state as JobState, createdAt: new Date(Number(row.created_at)).toISOString(),
      startedAt: row.started_at == null ? undefined : new Date(Number(row.started_at)).toISOString(),
      finishedAt: row.finished_at == null ? undefined : new Date(Number(row.finished_at)).toISOString(),
      result: row.result ? JSON.parse(String(row.result)) : undefined,
      error: row.error ? String(row.error) : undefined,
      timings: row.timings ? JSON.parse(String(row.timings)) : undefined,
      pollAfterMs: row.state === "queued" || row.state === "running" ? 3000 : 0,
    };
  }
  claim(): { jobId: string; input: JobInput; zip: Buffer; queuedMs: number; createdAt: number } | null {
    return transaction(this.db, () => {
      const row = this.db.prepare(`SELECT candidate.* FROM jobs candidate WHERE candidate.state='queued'
        AND NOT EXISTS (SELECT 1 FROM jobs active WHERE active.state='running' AND active.user_id=candidate.user_id
        AND json_extract(active.payload,'$.poetId')=json_extract(candidate.payload,'$.poetId')
        AND json_extract(active.payload,'$.workTitle')=json_extract(candidate.payload,'$.workTitle'))
        ORDER BY candidate.created_at,candidate.rowid LIMIT 1`).get();
      if (!row) return null;
      const now = Date.now();
      this.db.prepare("UPDATE jobs SET state='running',started_at=? WHERE id=? AND state='queued'").run(now,row.id);
      return { jobId: String(row.id), input: JSON.parse(String(row.payload)), zip: Buffer.from(row.zip as Uint8Array), queuedMs: now-Number(row.created_at), createdAt: Number(row.created_at) };
    });
  }
  finish(id: string, result: IngestResult | null, error: string | null, timings: Record<string, number>) {
    this.db.prepare("UPDATE jobs SET state=?,finished_at=?,result=?,error=?,timings=?,zip=NULL WHERE id=? AND state='running'")
      .run(error ? "failed" : "completed", Date.now(), result ? JSON.stringify(result) : null, error, JSON.stringify(timings), id);
  }
  /** Only under the exclusive worker lock: do not silently retry a possibly published job. */
  recoverInterrupted() {
    this.db.prepare("UPDATE jobs SET state='failed',finished_at=?,error=?,zip=NULL WHERE state='running'")
      .run(Date.now(), "审核进程中断；请先查询已上架课包，再重新提交。同内容提交会跳过已完成发布。");
  }
  prune() {
    this.db.prepare("DELETE FROM jobs WHERE state IN ('completed','failed') AND finished_at<?").run(Date.now()-7*86400_000);
  }
}
