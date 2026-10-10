/**
 * Codex 审核探针：本地跑一次真实评审，并把 **codex 内部耗时分解** 打出来。
 *
 *   pnpm probe:codex-review [用例名]      # 用例名见 scripts/e2e-fixtures.ts，默认 望岳
 *
 * 它用 e2e 验证集里钉死的那份学员包（只读 OSS），走与线上完全相同的评审路径
 * （`runCodexSpecReview`：同样的 SPEC、同样的提示词、同样的 codex-home），所以结果可以和线上对比。
 *
 * 输出 = `transcript.metrics`（也随每次线上评审落进 audit 的 transcript）：
 * - `startupMs`：CLI 启动到 thread.started/turn.started
 * - `thinkMs`：两次事件之间的「模型侧时间」（推理完成 / 最终消息到达之前那段）
 * - `toolMs`：shell 命令本身（started→completed）
 * - `commands`：命令原文（看它到底读了什么、写了什么）
 * - `segments`：逐段事件时间线，超时被 SIGTERM 杀掉时这段就是唯一的现场证据
 *
 * 实测参考（2026-10-10）：正常一次 80–200s，几乎全是 thinkMs；偶尔会「turn.started 之后
 * 240s 无任何事件」——那是模型侧服务没有回数据，不是本仓库能优化的部分。
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractZipBuffer, findPackRoot } from "../src/dlc/uploadPack";
import { defaultStore } from "./ingest-lib/auditStore";
import { E2E_CASES, loadFixtureZip } from "./e2e-fixtures";
import { runCodexSpecReview } from "../src/ingest/codexReview";

export type ProbeReport = {
  case: string;
  elapsedMs: number;
  issueCount: number;
  blocking: number;
  promptBytes: number;
  error?: string;
  metrics?: ReturnType<typeof summarize>;
  stdoutPath: string;
  promptPath: string;
};

function summarize(metrics: NonNullable<Awaited<ReturnType<typeof runCodexSpecReview>>["transcript"]>["metrics"]) {
  if (!metrics) return undefined;
  return {
    totalMs: metrics.totalMs,
    startupMs: metrics.startupMs,
    thinkMs: metrics.thinkMs,
    toolMs: metrics.toolMs,
    reasoning: metrics.reasoningCount,
    commands: metrics.commandCount,
    agentMessages: metrics.agentMessageCount,
    usage: metrics.usage,
    segments: metrics.segments.map((segment) => `${segment.kind} ${segment.ms}ms ${segment.detail ?? ""}`.trim()),
    commandTexts: metrics.commands.map((command) => command.replace(/\s+/g, " ").slice(0, 100)),
  };
}

export async function runProbe(name = "望岳"): Promise<ProbeReport> {
  const testCase = E2E_CASES.find((item) => item.name === name);
  if (!testCase) {
    throw new Error(`没有用例 ${name}；可选：${E2E_CASES.map((item) => item.name).join(" / ")}`);
  }
  const store = defaultStore();
  const zip = await loadFixtureZip(store, testCase);
  const tempRoot = mkdtempSync(path.join(tmpdir(), "codex-probe-"));
  try {
    await extractZipBuffer(zip, tempRoot);
    const packRoot = findPackRoot(tempRoot);
    const started = Date.now();
    const outcome = await runCodexSpecReview({ packRoot, machineIssues: [], workspace: path.join(tempRoot, "codex-job") });
    const elapsedMs = Date.now() - started;
    const transcript = outcome.transcript ?? { model: "?", prompt: "" };
    const stdoutPath = path.join(process.cwd(), ".cache", `codex-probe-${name}.jsonl`);
    const promptPath = path.join(process.cwd(), ".cache", `codex-probe-${name}.prompt.txt`);
    writeFileSync(stdoutPath, transcript.stdout ?? "");
    writeFileSync(promptPath, transcript.prompt ?? "");
    return {
      case: name,
      elapsedMs,
      issueCount: outcome.issues.length,
      blocking: outcome.issues.filter((issue) => issue.severity === "blocking").length,
      promptBytes: Buffer.byteLength(transcript.prompt ?? ""),
      error: transcript.error,
      metrics: summarize(transcript.metrics),
      stdoutPath,
      promptPath,
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runProbe(process.argv[2] ?? "望岳")
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
