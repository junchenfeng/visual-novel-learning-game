/**
 * DLC 审核运维 CLI（事故排查/修复用，不属于日常测试）。
 *
 *   pnpm ingest:ops rereview-failed [--dry-run] [--include-all] [--base URL] [--json]
 *   pnpm ingest:ops verify-slots [userId...] [--status rejected|published|all] [--json]
 *
 * 两个子命令对应 2026-10-09「审核引擎不可用」事故里现场用的两个脚本：
 *
 * - `rereview-failed`：把**当前仍显示审核失败**的提交，按 OSS audit 里留存的原 zip 重跑一次。
 *   默认只挑「最近一次提交失败原因是 rule=审核引擎」的（引擎事故才值得重跑；学员 YAML 真有问题
 *   的单子重跑还是会被拒），`--include-all` 可放开。用提交人自己的 userId，不 bump 版本：
 *   这些包本来就没上架，`shouldSkipReview` 不会命中。
 * - `verify-slots`：只读核对预览台每个 slot 的状态与「最近一次提交到底报了什么」，
 *   含 Codex transcript.error（引擎故障的原始报错就在这里）。
 *
 * 两个坑见 `scripts/ingest-lib/auditStore.ts` 顶部注释（非提交记录、同内容孪生行）。
 */
import { getPoemStore, type PoemStore } from "../src/server/poemStore";
import type { PreviewEntry } from "../src/ingest/preview";
import {
  auditRecordKey,
  latestForSlot,
  loadIngestEntriesForUser,
  listAuditDirs,
  isEngineFailure,
  type AuditEntry,
} from "./ingest-lib/auditStore";
import { McpClient } from "./ingest-lib/mcp";
import { evaluateIngestOutcome, issueSummaries, type IngestResultLike } from "./ingest-lib/outcome";

const DEFAULT_BASE = "https://poem.aibeaver.cn";
const DEFAULT_MAX_MS = 300_000;

type Common = { base: string; json: boolean; maxMs: number };

function commonArgs(argv: string[]): { common: Common; rest: string[] } {
  const common: Common = { base: DEFAULT_BASE, json: false, maxMs: DEFAULT_MAX_MS };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--base") common.base = String(argv[++i] ?? "").trim() || DEFAULT_BASE;
    else if (item.startsWith("--base=")) common.base = item.slice("--base=".length);
    else if (item === "--json") common.json = true;
    else if (item === "--max-ms") common.maxMs = Number(argv[++i]) || DEFAULT_MAX_MS;
    else if (item.startsWith("--max-ms=")) common.maxMs = Number(item.slice("--max-ms=".length)) || DEFAULT_MAX_MS;
    else rest.push(item);
  }
  return { common, rest };
}

function mcpFor(common: Common): McpClient {
  return new McpClient({ endpoint: `${common.base.replace(/\/+$/, "")}/mcp`, timeoutMs: common.maxMs + 60_000 });
}

type SlotTarget = {
  slot: PreviewEntry;
  entry: AuditEntry;
  engine: boolean;
};

/** 找出「预览台仍失败、且能从 audit 里找回原 zip」的 slot。 */
async function collectFailedSlots(
  store: PoemStore,
  options: { includeAll: boolean },
): Promise<{ targets: SlotTarget[]; skipped: Array<{ slotKey: string; reason: string }> }> {
  const preview = await store.readJson<PreviewEntry[]>("poem-rpg/ingest-preview/index.json");
  const rejected = Array.isArray(preview) ? preview.filter((item) => item?.status === "rejected") : [];
  const dirs = await listAuditDirs(store);
  const targets: SlotTarget[] = [];
  const skipped: Array<{ slotKey: string; reason: string }> = [];

  for (const slot of rejected) {
    const entries = await loadIngestEntriesForUser(store, dirs, slot.userId);
    const latest = latestForSlot(entries, { poetId: slot.poetId, workTitle: slot.workTitle });
    if (!latest) {
      skipped.push({ slotKey: slot.slotKey, reason: "找不到该 slot 的提交记录" });
      continue;
    }
    const engine = isEngineFailure(latest.record);
    if (!engine && !options.includeAll) {
      skipped.push({ slotKey: slot.slotKey, reason: `最近一次失败不是引擎事故（${issueSummaries(latest.record.response?.issues ?? []) || "无 issues"}）` });
      continue;
    }
    const zip = await store.getObject(`${latest.dir.replace(/\/+$/, "")}/pack.zip`);
    if (!zip || zip.byteLength === 0) {
      skipped.push({ slotKey: slot.slotKey, reason: "audit 里没有 pack.zip（该次提交没带 zip）" });
      continue;
    }
    targets.push({ slot, entry: latest, engine });
  }
  return { targets, skipped };
}

async function rereviewFailed(argv: string[]): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const includeAll = argv.includes("--include-all");
  const { common } = commonArgs(argv.filter((item) => item !== "--dry-run" && item !== "--include-all"));
  const store = getPoemStore();
  const { targets, skipped } = await collectFailedSlots(store, { includeAll });

  console.log(`# 重审失败单${dryRun ? "（dry-run）" : ""}：候选 ${targets.length} 个，跳过 ${skipped.length} 个`);
  for (const target of targets) {
    console.log(`  重提 ${target.slot.userId} | ${target.slot.poetId} | ${target.slot.workTitle} | 最近失败 ${target.entry.record.timestamp ?? "?"} | 引擎事故=${target.engine}`);
  }
  for (const item of skipped) {
    console.log(`  跳过 ${item.slotKey}：${item.reason}`);
  }
  if (dryRun || targets.length === 0) {
    if (common.json) {
      console.log(JSON.stringify({ event: "rereview_plan", dryRun, targets: targets.length, skipped }, null, 2));
    }
    return;
  }

  const client = mcpFor(common);
  await client.initialize();
  const results: Array<{ slotKey: string; ok: boolean; verdict?: string; dlcId?: string; elapsedMs: number; problems: string[]; notes: string[] }> = [];
  for (const target of targets) {
    const startedAt = Date.now();
    const zip = await store.getObject(`${target.entry.dir.replace(/\/+$/, "")}/pack.zip`);
    console.log(`→ 提交 ${target.slot.slotKey}`);
    let result: IngestResultLike | null = null;
    const problems: string[] = [];
    const notes: string[] = [];
    try {
      const payload = await client.callToolSlow<IngestResultLike>(
        "ingest_dlc",
        {
          userId: target.slot.userId,
          poetId: target.slot.poetId,
          workTitle: target.slot.workTitle,
          zipBase64: zip!.toString("base64"),
        },
        common.maxMs + 60_000,
      );
      result = payload.value as IngestResultLike;
      const jobId = (payload.value as { jobId?: string }).jobId;
      if (jobId) {
        notes.push(`异步受理 jobId=${jobId}`);
      }
    } catch (error) {
      problems.push(`提交失败：${error instanceof Error ? error.message : String(error)}`);
    }
    const elapsedMs = Date.now() - startedAt;
    const evaluated = evaluateIngestOutcome({ result, elapsedMs, maxElapsedMs: common.maxMs, allowSkip: true });
    problems.push(...evaluated.problems);
    notes.push(...evaluated.notes);
    const ok = problems.length === 0;
    results.push({ slotKey: target.slot.slotKey, ok, verdict: result?.verdict, dlcId: result?.pack?.dlcId, elapsedMs, problems, notes });
    console.log(`${ok ? "✓" : "✗"} ${target.slot.slotKey}：${ok ? `${result?.verdict} ${result?.pack?.dlcId ?? ""} ${Math.round(elapsedMs / 1000)}s` : problems[0]}`);
  }

  const failed = results.filter((item) => !item.ok).length;
  console.log(`\n== 重审完成：${results.length - failed}/${results.length} 通过 ==`);
  if (common.json) {
    console.log(JSON.stringify({ event: "rereview_done", results }, null, 2));
  }
  for (const item of results.filter((row) => !row.ok)) {
    for (const problem of item.problems) console.log(`  ✗ ${item.slotKey}：${problem}`);
  }
  if (failed > 0) process.exitCode = 1;
}

async function verifySlots(argv: string[]): Promise<void> {
  const { common, rest } = commonArgs(argv);
  let status = "all";
  const users: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const item = rest[i];
    if (item === "--status") status = String(rest[++i] ?? "all");
    else if (item.startsWith("--status=")) status = item.slice("--status=".length);
    else users.push(item);
  }
  const store = getPoemStore();
  const preview = (await store.readJson<PreviewEntry[]>("poem-rpg/ingest-preview/index.json")) ?? [];
  const wanted = new Set(users.map((item) => item.trim()).filter(Boolean));
  const rows = preview.filter((item) => {
    if (wanted.size > 0 && !wanted.has(item.userId)) return false;
    if (status !== "all" && item.status !== status) return false;
    return true;
  });
  const summary = rows.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  const dirs = await listAuditDirs(store);
  const out: Array<Record<string, unknown>> = [];
  for (const slot of rows) {
    const entries = await loadIngestEntriesForUser(store, dirs, slot.userId);
    const latest = latestForSlot(entries, { poetId: slot.poetId, workTitle: slot.workTitle });
    const issues = latest?.record.response?.issues ?? [];
    const row = {
      slotKey: slot.slotKey,
      status: slot.status,
      dlcId: slot.dlcId || null,
      updatedAt: slot.updatedAt,
      lastVerdict: latest?.record.response?.verdict,
      lastIssues: [...new Set(issues.map((issue) => issue?.rule).filter(Boolean))].slice(0, 4),
      lastError: latest?.record.transcript?.error ? String(latest.record.transcript.error).slice(0, 120) : undefined,
      auditKey: latest ? auditRecordKey(latest.dir) : undefined,
    };
    out.push(row);
    console.log(
      `${slot.status.padEnd(9)} | ${slot.slotKey} | dlcId=${slot.dlcId || "-"} | 最近 ${row.lastVerdict ?? "?"} | ${(row.lastIssues as string[]).join(",") || "-"}${row.lastError ? ` | err=${row.lastError}` : ""}`,
    );
  }
  console.log(`\n== ${rows.length} 个 slot：${JSON.stringify(summary)} ==`);
  if (common.json) {
    console.log(JSON.stringify({ event: "verify_slots", summary, rows: out }, null, 2));
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    console.log("用法: tsx scripts/ingest-ops.ts <rereview-failed|verify-slots> [...]");
    console.log("  rereview-failed [--dry-run] [--include-all] [--base URL] [--json] [--max-ms N]");
    console.log("  verify-slots [userId...] [--status rejected|published|all] [--json]");
    return;
  }
  if (command === "rereview-failed") {
    await rereviewFailed(rest);
    return;
  }
  if (command === "verify-slots") {
    await verifySlots(rest);
    return;
  }
  throw new Error(`未知子命令：${command}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
