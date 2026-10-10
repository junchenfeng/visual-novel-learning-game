import { statSync } from "node:fs";
import { MAX_ZIP_BYTES } from "../dlc/uploadPack";
import { parseIngestUserId, ingestUserReject } from "../ingest/userId";
import { IngestQueue, QueueFullError } from "../ingest/queue";
import { machineIssue } from "../ingest/issues";
import { decodeBase64Payload, ingestDlcTool, readOptionalPath } from "./tools";
import { runWithIngestUser } from "../ingest/gate";

type Input = Parameters<typeof ingestDlcTool>[0];
export async function submitIngestDlc(input: Input) {
  if (process.env.INGEST_ASYNC_ENABLED !== "1") return ingestDlcTool(input);
  // Authenticate before reading server-local paths or decoding large buffers.
  const user = parseIngestUserId(input.userId);
  if (!user) return runWithIngestUser({ tool: "ingest_dlc", rawUserId: input.userId,
    query: { poetId: input.poetId, workTitle: input.workTitle }, run: async () => ingestUserReject() });
  const reject = (message: string) => ({ verdict: "reject" as const, issues: [machineIssue(message, { rule: "zip" })] });
  if (!input.poetId.trim() || !input.workTitle.trim()) return reject("诗人和篇目不能为空");
  try {
    if ((input.zipBase64?.length || 0) > Math.ceil(MAX_ZIP_BYTES / 3) * 4 + 1024 ||
        (input.zipPath && statSync(input.zipPath).size > MAX_ZIP_BYTES)) return reject("zip 超过 30MB");
    const zip = input.zipBuffer ?? readOptionalPath(input.zipPath) ?? (input.zipBase64 ? decodeBase64Payload(input.zipBase64) : null);
    if (!zip?.length || zip.length > MAX_ZIP_BYTES) return reject("请提供非空且不超过 30MB 的 zip");
    const queue = new IngestQueue();
    try {
      return queue.enqueue({ userId: user.canonical, poetId: input.poetId.trim(), workTitle: input.workTitle.trim(), origin: input.origin }, zip);
    } finally { queue.close(); }
  } catch (error) {
    if (error instanceof QueueFullError) return { error: "queue_full", message: error.message, retryAfterMs: 5000 };
    console.error(JSON.stringify({ event: "ingest_enqueue_error", message: error instanceof Error ? error.message : String(error) }));
    return { error: "enqueue_failed", message: "提交未受理，请稍后重试" };
  }
}

export function getIngestJob(input: { userId: string; jobId: string }) {
  const user = parseIngestUserId(input.userId);
  if (!user) return ingestUserReject();
  if (!/^[0-9a-f-]{36}$/.test(input.jobId)) return { error: "not_found", message: "任务不存在或不属于当前学员" };
  const queue = new IngestQueue();
  try { return queue.status(input.jobId, user.canonical) ?? { error: "not_found", message: "任务不存在或不属于当前学员" }; }
  finally { queue.close(); }
}
