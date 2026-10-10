import { performance } from "node:perf_hooks";
import { IngestQueue } from "./queue";
import { ingestDlcTool } from "../mcp/tools";
import { withIngestTrace } from "./timing";

export async function processNextJob(queue: IngestQueue, handler = ingestDlcTool): Promise<boolean> {
  const job = queue.claim();
  if (!job) return false;
  const start = performance.now(), timings: Record<string, number> = { queueMs: job.queuedMs };
  let result: Awaited<ReturnType<typeof handler>> | null = null, error: string | null = null;
  try {
    result = await withIngestTrace({ jobId: job.jobId, timings }, () => handler({ ...job.input, zipBuffer: job.zip }));
  } catch (cause) {
    console.error(JSON.stringify({ event: "ingest_job_error", jobId: job.jobId, message: cause instanceof Error ? cause.message : String(cause) }));
    error = "审核执行失败，请查询已上架课包后重试，或联系老师";
  }
  timings.processingMs = Math.round(performance.now() - start);
  timings.totalMs = Date.now() - job.createdAt;
  queue.finish(job.jobId, result, error, timings);
  console.info(JSON.stringify({ event: "ingest_job_finished", jobId: job.jobId, outcome: error ? "failed" : result?.verdict, timings }));
  return true;
}
