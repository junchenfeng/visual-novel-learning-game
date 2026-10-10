import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { IngestQueue, QueueFullError } from "../src/ingest/queue";
import { acquireIngestLock } from "../src/ingest/state";
import { processNextJob } from "../src/ingest/worker";
import { itWithSqlite } from "./helpers/sqlite";

const input = { userId: "hh_11016863", poetId: "sushi", workTitle: "水调歌头" };
let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "ingest-queue-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

itWithSqlite("persists across reopen, deduplicates inflight uploads, and isolates student queries", () => {
  let q = new IngestQueue(dir);
  const job = q.enqueue(input, Buffer.from("zip"));
  expect(q.enqueue(input, Buffer.from("zip")).jobId).toBe(job.jobId);
  expect(q.status(job.jobId, "hh_other")).toBeNull();
  q.close(); q = new IngestQueue(dir);
  expect(q.status(job.jobId,input.userId)?.status).toBe("queued");
  const other = new IngestQueue(dir);
  expect(q.claim()?.jobId).toBe(job.jobId);
  expect(other.claim()).toBeNull();
  expect(q.enqueue(input, Buffer.from("zip")).jobId).toBe(job.jobId);
  q.finish(job.jobId, { verdict: "accept", issues: [] }, null, { agentMs: 12 });
  expect(q.status(job.jobId,input.userId)?.result?.verdict).toBe("accept");
  expect(q.db.prepare("SELECT zip FROM jobs WHERE id=?").get(job.jobId)?.zip).toBeNull();
  expect(q.enqueue(input, Buffer.from("zip")).jobId).not.toBe(job.jobId);
  other.close(); q.close();
});

itWithSqlite("bounds admission and distinguishes worker interruption from content rejection", async () => {
  const q = new IngestQueue(dir);
  for (let i=0;i<100;i++) q.enqueue(input,Buffer.from(String(i)));
  expect(() => q.enqueue(input,Buffer.from("overflow"))).toThrow(QueueFullError);
  const running = q.claim()!;
  q.recoverInterrupted();
  const status = q.status(running.jobId,input.userId)!;
  expect(status.status).toBe("failed"); expect(status.result).toBeUndefined();
  expect(status.error).toMatch(/中断/);
  q.close();
});

itWithSqlite("worker saves timings and a rejection result without treating it as an execution failure", async () => {
  const q = new IngestQueue(dir), job = q.enqueue(input,Buffer.from("zip"));
  const handler = jest.fn(async () => ({ verdict: "reject" as const, issues: [] }));
  expect(await processNextJob(q,handler)).toBe(true);
  const done = q.status(job.jobId,input.userId)!;
  expect(done.status).toBe("completed"); expect(done.result?.verdict).toBe("reject");
  expect(done.timings?.queueMs).toBeGreaterThanOrEqual(0);
  expect(done.timings?.totalMs).toBeGreaterThanOrEqual(0);
  expect(await processNextJob(q,handler)).toBe(false);
  const failed = q.enqueue(input,Buffer.from("retry"));
  await processNextJob(q, async () => { throw new Error("private details"); });
  expect(q.status(failed.jobId,input.userId)?.status).toBe("failed");
  expect(q.status(failed.jobId,input.userId)?.error).not.toContain("private details");
  q.close();
});

itWithSqlite("does not steal live process locks, but recovers a dead owner transactionally", async () => {
  const release = await acquireIngestLock("worker",0,dir);
  await expect(acquireIngestLock("worker",0,dir)).rejects.toThrow(/busy/);
  release();
  const q = new IngestQueue(dir);
  q.db.prepare("INSERT INTO locks VALUES (?,?,?)").run("worker","dead",2147483647);
  const recovered = await acquireIngestLock("worker",0,dir);
  recovered(); q.close();
});

itWithSqlite("processes versions of the same work in order while allowing other works to run", () => {
  const q = new IngestQueue(dir);
  const first = q.enqueue(input, Buffer.from("v1"));
  const second = q.enqueue(input, Buffer.from("v2"));
  const other = q.enqueue({ ...input, workTitle: "other" }, Buffer.from("v1"));
  expect(q.claim()?.jobId).toBe(first.jobId);
  expect(q.claim()?.jobId).toBe(other.jobId);
  expect(q.claim()).toBeNull();
  q.finish(first.jobId, { verdict: "accept", issues: [] }, null, {});
  expect(q.claim()?.jobId).toBe(second.jobId);
  q.close();
});
