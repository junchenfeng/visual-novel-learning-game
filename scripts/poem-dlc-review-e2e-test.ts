/**
 * 发布验证集：走一遍**完整 MCP 请求**的 DLC 审核链路。
 *
 *   pnpm poem-dlc-review-e2e-test [--base URL] [--case 名称]... [--json] [--dry-run] [--allow-skip]
 *
 * 目的：发布后立刻发现 2026-10-09 那类「审核引擎不可用 / 超时 → 全部审核失败」的事故——
 * 它当时不会被任何单测发现，因为链路依赖线上凭据（腾讯云 TokenHub key）与 Codex CLI。
 *
 * 做法：把 5 份**已上架学员包**（钉在 OSS audit 的 pack.zip）以 e2e 学员身份重新提交，
 * 每轮把 manifest.version 改成唯一值以绕开 skip 短路，强制跑完整 Codex 审核，然后断言：
 *   verdict=accept、issues 里没有 rule='审核引擎'、耗时在预算内、dlcId 与 list_my_dlc 对账一致。
 * e2e 包发布到独立 dlcId（`<shortId>-hh_000000X`），不碰学生线上包。
 *
 * **不进日常 `pnpm test`**（jest 只扫 tests/），只在发布验证/排查时手动跑。
 */
import { uploadedDlcId } from "../src/dlc/uploadPack";
import type { PoemStore } from "../src/server/poemStore";
import {
  auditRecordKey,
  defaultStore,
  latestForSlot,
  loadIngestEntriesForUser,
  listAuditDirs,
} from "./ingest-lib/auditStore";
import { McpClient, delay } from "./ingest-lib/mcp";
import { ENGINE_RULE, evaluateIngestOutcome, issueSummaries, type IngestResultLike } from "./ingest-lib/outcome";
import { buildE2eVersion, readZipManifest, rewriteManifestVersion } from "./ingest-lib/zipVersion";
import {
  assertFixtureConfig,
  assertFixtureRecord,
  findCases,
  loadFixtureZip,
  type E2eCase,
} from "./e2e-fixtures";

const DEFAULT_BASE = "https://poem.aibeaver.cn";
/**
 * 单例客户端预算。必须容纳**一次引擎故障重试**：codex 单次上限 240s × 2 次 + 机器校验/发布，
 * 最坏约 500s；给 540s 才不会把「重试救回来的成功」误报成轮询超时（2026-10-10 起 worker
 * 默认 `INGEST_REVIEW_ATTEMPTS=2`）。
 */
const DEFAULT_MAX_MS = 540_000;

type Args = {
  base: string;
  cases: string[];
  json: boolean;
  dryRun: boolean;
  allowSkip: boolean;
  maxMs: number;
};

type CaseOutcome = {
  name: string;
  ok: boolean;
  phase: "fixture" | "submit" | "verify" | "dry-run";
  verdict?: string;
  dlcId?: string;
  version?: string;
  elapsedMs: number;
  problems: string[];
  notes: string[];
  diagnostics?: string[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = { base: DEFAULT_BASE, cases: [], json: false, dryRun: false, allowSkip: false, maxMs: DEFAULT_MAX_MS };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--base") args.base = String(argv[++i] ?? "").trim() || DEFAULT_BASE;
    else if (item.startsWith("--base=")) args.base = item.slice("--base=".length);
    else if (item === "--case") args.cases.push(String(argv[++i] ?? ""));
    else if (item.startsWith("--case=")) args.cases.push(item.slice("--case=".length));
    else if (item === "--json") args.json = true;
    else if (item === "--dry-run") args.dryRun = true;
    else if (item === "--allow-skip") args.allowSkip = true;
    else if (item === "--max-ms") args.maxMs = Number(argv[++i]) || DEFAULT_MAX_MS;
    else if (item.startsWith("--max-ms=")) args.maxMs = Number(item.slice("--max-ms=".length)) || DEFAULT_MAX_MS;
    else if (item === "--help" || item === "-h") {
      console.log("用法: tsx scripts/poem-dlc-review-e2e-test.ts [--base URL] [--case 名称]... [--json] [--dry-run] [--allow-skip] [--max-ms N]");
      process.exit(0);
    } else {
      throw new Error(`未知参数：${item}`);
    }
  }
  args.cases = args.cases.flatMap((value) => String(value).split(",")).map((value) => value.trim()).filter(Boolean);
  return args;
}

function stamp(): string {
  const now = new Date();
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** 失败时的离线取证：这个 slot 最近一次提交到底报了什么（含 Codex transcript.error）。 */
async function collectDiagnostics(
  store: PoemStore,
  testCase: E2eCase,
  dirs: string[],
): Promise<string[]> {
  const lines: string[] = [];
  const entries = await loadIngestEntriesForUser(store, dirs, testCase.e2eUserId);
  const latest = latestForSlot(entries, testCase);
  if (!latest) {
    lines.push(`（该 e2e 身份还没有任何提交记录，audit 尚未写入）`);
    return lines;
  }
  const issues = Array.isArray(latest.record.response?.issues) ? latest.record.response.issues : [];
  lines.push(`最近一次提交：${latest.record.timestamp ?? "?"} verdict=${latest.record.response?.verdict ?? "?"}`);
  lines.push(`audit：${auditRecordKey(latest.dir)}`);
  if (issues.length > 0) {
    lines.push(`issues：${issueSummaries(issues, 6)}`);
  }
  const transcriptError = latest.record.transcript?.error;
  if (transcriptError) {
    lines.push(`transcript.error：${String(transcriptError).slice(0, 300)}`);
  }
  const userIdIssue = issues.some((issue) => issue?.rule === "userId");
  if (userIdIssue) {
    lines.push("提示：线上还没有发布含 e2e 学员的版本（先部署，再跑验证集）");
  }
  return lines;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const configProblems = assertFixtureConfig();
  if (configProblems.length > 0) {
    throw new Error(`用例配置有问题：\n  - ${configProblems.join("\n  - ")}`);
  }
  const cases = findCases(args.cases);
  const store = defaultStore();
  const endpoint = `${args.base.replace(/\/+$/, "")}/mcp`;
  const client = new McpClient({ endpoint, timeoutMs: args.maxMs + 60_000 });
  const runStamp = stamp();

  console.log(`# poem-dlc-review-e2e-test`);
  console.log(`端点：${endpoint}`);
  console.log(`用例：${cases.map((item) => item.name).join(" / ")}${args.dryRun ? "（dry-run：只做 fixture 与握手，不提交）" : ""}`);
  console.log(`预算：单例 < ${Math.round(args.maxMs / 1000)}s`);
  for (const item of cases.filter((row) => row.expect === "either")) {
    console.log(`注意：${item.name} 标为内容结论浮动 —— ${item.note}`);
  }

  const handshake = await client.initialize();
  const tools = await client.listTools();
  const notes: string[] = [];
  notes.push(`服务端：${handshake.serverInfo?.name ?? "?"} ${handshake.serverInfo?.version ?? "?"}（协议 ${handshake.protocolVersion ?? "?"}）`);
  for (const required of ["ingest_dlc", "list_my_dlc"]) {
    if (!tools.includes(required)) {
      throw new Error(`服务端没有暴露必需工具 ${required}（拿到 ${tools.length} 个工具）`);
    }
  }
  notes.push(tools.includes("get_ingest_job") ? "异步模式兼容：有 get_ingest_job，按 jobId 轮询" : "同步模式：无 get_ingest_job，直接等返回");
  for (const note of notes) console.log(`- ${note}`);

  const auditDirs = await listAuditDirs(store);
  const outcomes: CaseOutcome[] = [];

  for (const testCase of cases) {
    const startedAt = Date.now();
    const outcome: CaseOutcome = { name: testCase.name, ok: false, phase: "fixture", elapsedMs: 0, problems: [], notes: [] };

    const fixture = await assertFixtureRecord(store, testCase);
    if (fixture.problems.length > 0) {
      outcome.problems.push(...fixture.problems);
      outcome.elapsedMs = Date.now() - startedAt;
      outcomes.push(outcome);
      console.log(`✗ ${testCase.name}：fixture 校验失败 —— ${fixture.problems.join("；")}`);
      continue;
    }

    const zip = await loadFixtureZip(store, testCase);
    const manifest = await readZipManifest(zip);
    if (manifest.id !== testCase.expectedShortId) {
      outcome.problems.push(`fixture 包的 manifest.id=${manifest.id}，与配置的 ${testCase.expectedShortId} 不符（auditKey 指错了？）`);
      outcome.elapsedMs = Date.now() - startedAt;
      outcomes.push(outcome);
      console.log(`✗ ${testCase.name}：${outcome.problems[0]}`);
      continue;
    }

    const nextVersion = buildE2eVersion(manifest.version, `${runStamp}`);
    const expectedDlcId = uploadedDlcId(manifest.id, testCase.e2eUserId);
    outcome.version = nextVersion;

    if (args.dryRun) {
      const rewritten = await rewriteManifestVersion(zip, nextVersion);
      outcome.ok = true;
      outcome.phase = "dry-run";
      outcome.notes.push(`zip ${zip.byteLength}B → ${rewritten.zip.byteLength}B，version ${manifest.version} → ${nextVersion}`);
      outcome.notes.push(`预期 dlcId=${expectedDlcId}（e2e 身份 ${testCase.e2eUserId}）`);
      outcome.elapsedMs = Date.now() - startedAt;
      outcomes.push(outcome);
      console.log(`· ${testCase.name}：dry-run 通过（version → ${nextVersion}，预期 ${expectedDlcId}）`);
      continue;
    }

    outcome.phase = "submit";
    const rewritten = await rewriteManifestVersion(zip, nextVersion);
    let result: IngestResultLike | null = null;
    try {
      const payload = await client.callToolSlow<IngestResultLike>(
        "ingest_dlc",
        {
          userId: testCase.e2eUserId,
          poetId: testCase.poetId,
          workTitle: testCase.workTitle,
          zipBase64: rewritten.zip.toString("base64"),
        },
        args.maxMs + 60_000,
      );
      result = payload.value as IngestResultLike;
      const jobId = (payload.value as { jobId?: string }).jobId;
      if (jobId) {
        outcome.notes.push(`异步受理：jobId=${jobId}，轮询 get_ingest_job`);
        result = await pollJob(client, testCase.e2eUserId, jobId, args.maxMs, startedAt);
      }
    } catch (error) {
      outcome.problems.push(`提交失败：${error instanceof Error ? error.message : String(error)}`);
    }

    outcome.elapsedMs = Date.now() - startedAt;
    const evaluated = evaluateIngestOutcome({
      result,
      elapsedMs: outcome.elapsedMs,
      maxElapsedMs: args.maxMs,
      expectedDlcId,
      allowSkip: args.allowSkip,
      allowContentReject: testCase.expect === "either",
    });
    if (testCase.expect === "either") {
      outcome.notes.push(`expect=either：${testCase.note ?? "内容结论浮动"}`);
    }
    outcome.problems.push(...evaluated.problems);
    outcome.notes.push(...evaluated.notes);
    outcome.verdict = String(result?.verdict ?? "");
    outcome.dlcId = result?.pack?.dlcId;

    if (evaluated.ok && result && !evaluated.contentReject) {
      outcome.phase = "verify";
      const verifyProblems = await verifyPublished(client, testCase, expectedDlcId, result, outcome.notes);
      outcome.problems.push(...verifyProblems);
    } else if (evaluated.contentReject) {
      outcome.phase = "verify";
      outcome.notes.push("内容结论浮动（reject）：跳过 list_my_dlc 对账与试玩探活");
    }

    outcome.ok = outcome.problems.length === 0;
    if (!outcome.ok) {
      outcome.diagnostics = await collectDiagnostics(store, testCase, auditDirs);
    }
    outcomes.push(outcome);

    const icon = outcome.ok ? "✓" : "✗";
    const detail = outcome.ok
      ? `${outcome.verdict} ${outcome.dlcId ?? ""} ${Math.round(outcome.elapsedMs / 1000)}s`
      : outcome.problems[0];
    console.log(`${icon} ${testCase.name}：${detail}`);
  }

  report(outcomes, args);
  const failed = outcomes.filter((item) => !item.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

/** 异步模式：按 pollAfterMs 轮询到 completed/failed，或超出预算。 */
async function pollJob(
  client: McpClient,
  userId: string,
  jobId: string,
  maxMs: number,
  startedAt: number,
): Promise<IngestResultLike | null> {
  for (;;) {
    const payload = await client.callTool<{
      status?: string;
      result?: IngestResultLike;
      error?: string;
      pollAfterMs?: number;
    }>("get_ingest_job", { userId, jobId });
    const value = payload.value ?? {};
    const status = String(value.status ?? "");
    if (status === "completed") {
      return value.result ?? null;
    }
    if (status === "failed") {
      return { verdict: "reject", issues: [], error: value.error ?? "任务失败" };
    }
    if (Date.now() - startedAt > maxMs) {
      return { verdict: "", issues: [], error: `轮询超时（jobId=${jobId} 仍为 ${status || "?"}）` };
    }
    await delay(Number(value.pollAfterMs) > 0 ? Number(value.pollAfterMs) : 3000);
  }
}

/** accept 后用 list_my_dlc 对账，并确认试玩地址不是 404。 */
async function verifyPublished(
  client: McpClient,
  testCase: E2eCase,
  expectedDlcId: string,
  result: IngestResultLike,
  notes: string[],
): Promise<string[]> {
  const problems: string[] = [];
  const payload = await client.callTool<{ dlcs?: Array<{ dlcId?: string; playUrl?: string }> }>("list_my_dlc", {
    userId: testCase.e2eUserId,
  });
  const dlcs = Array.isArray(payload.value?.dlcs) ? payload.value.dlcs! : [];
  const mine = dlcs.find((item) => item?.dlcId === expectedDlcId);
  if (!mine) {
    problems.push(`list_my_dlc 里没有 ${expectedDlcId}（该身份共 ${dlcs.length} 个课包）`);
    return problems;
  }
  notes.push(`list_my_dlc 对账通过：${mine.dlcId}`);

  const playUrl = mine.playUrl ?? result.playUrl;
  if (!playUrl) {
    notes.push("没有 playUrl 可探活");
    return problems;
  }
  try {
    const response = await fetch(playUrl, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(20_000) });
    if (response.status === 404) {
      problems.push(`试玩地址 404：${playUrl}`);
    } else {
      notes.push(`试玩地址 ${response.status}（未登录会 307 到 needLogin，属正常）：${playUrl}`);
    }
  } catch (error) {
    notes.push(`试玩地址探活跳过（${error instanceof Error ? error.message : String(error)}）：${playUrl}`);
  }
  return problems;
}

function report(outcomes: CaseOutcome[], args: Args): void {
  const passed = outcomes.filter((item) => item.ok).length;
  const failed = outcomes.filter((item) => !item.ok);
  if (args.json) {
    console.log(JSON.stringify({ event: "e2e_report", base: args.base, dryRun: args.dryRun, passed, failed: failed.length, outcomes }, null, 2));
    return;
  }
  console.log(`\n== 汇总：${passed}/${outcomes.length} 通过 ==`);
  if (failed.length === 0) {
    return;
  }
  for (const item of failed) {
    console.log(`\n✗ ${item.name}（${item.phase}，${Math.round(item.elapsedMs / 1000)}s）`);
    for (const problem of item.problems) console.log(`   - ${problem}`);
    for (const line of item.diagnostics ?? []) console.log(`   · ${line}`);
  }
  if (failed.some((item) => item.problems.some((problem) => problem.includes(ENGINE_RULE)))) {
    console.log(`\n结论：审核引擎不通（${ENGINE_RULE}），不是学员 YAML 问题——按上面的提示排查凭据与超时设置。`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
