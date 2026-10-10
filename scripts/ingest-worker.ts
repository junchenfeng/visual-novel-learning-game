import { acquireIngestLock } from "../src/ingest/state";
import { IngestQueue } from "../src/ingest/queue";
import { processNextJob } from "../src/ingest/worker";
import { setUploadedDlcSource } from "../src/dlc/uploadedContent";
import { createUploadedDlcSource } from "../src/dlc/uploadIndex";

async function main() {
  const concurrency = Number(process.env.INGEST_WORKER_CONCURRENCY || 2);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error("INGEST_WORKER_CONCURRENCY must be 1..8");
  const release = await acquireIngestLock("worker", 0);
  const queue = new IngestQueue();
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
  try {
    setUploadedDlcSource(createUploadedDlcSource());
    queue.recoverInterrupted(); queue.prune();
    console.info(JSON.stringify({ event: "ingest_worker_started", concurrency }));
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (!stopping) {
        if (!await processNextJob(queue)) {
          queue.prune();
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }));
  } finally {
    process.off("SIGTERM", stop); process.off("SIGINT", stop);
    queue.close(); release();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
