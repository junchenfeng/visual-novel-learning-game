import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";

type Trace = { jobId: string; timings: Record<string, number> };
const context = new AsyncLocalStorage<Trace>();
export function withIngestTrace<T>(trace: Trace, run: () => Promise<T>): Promise<T> {
  return context.run(trace, run);
}
export async function ingestStage<T>(stage: string, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  let outcome = "ok";
  try { return await run(); } catch (error) { outcome = "error"; throw error; }
  finally {
    const trace = context.getStore(), durationMs = Math.round(performance.now() - start);
    if (trace) trace.timings[stage] = (trace.timings[stage] || 0) + durationMs;
    const log = trace ? console.info : console.error; // Keep stdio MCP stdout protocol-only.
    log(JSON.stringify({ event: "ingest_stage", jobId: trace?.jobId, stage, durationMs, outcome }));
  }
}
export function ingestJobId(): string | undefined { return context.getStore()?.jobId; }

export function ingestMetric(name: string, value: number): void {
  const trace = context.getStore();
  if (trace) trace.timings[name] = value;
}
