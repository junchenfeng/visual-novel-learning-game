/**
 * OSS 侧审核留存的只读访问（预览索引 + ingest-audit）。
 *
 * 走仓库自己的 `PoemStore`（`getPoemStore()`），凭据来源与 `scripts/codex-exec.sh` 同源：
 * `AI_GALLERY_CONFIG` → `/root/ai-gallery/config.json` → `../ai-gallery/config.json`。
 *
 * 两个坑（2026-10-10 排查时踩过）：
 * 1. audit 目录里的记录**不只有提交**：list_my_dlc / list_roster / upsert_poet 也会写，
 *    它们没有 issues 也没有 zip。找「最近一次提交」必须先按 `tool === 'ingest_dlc'` 过滤，
 *    否则会把一次查询当成「审核成功/失败」。
 * 2. 摘要里的时间戳是**写审计的时刻**，不是开始时刻；同一 slot 的多次提交按它排序即可。
 */
import { getPoemStore, ingestPreviewIndexKey, type PoemStore } from "../../src/server/poemStore";
import { loadPreviewIndex } from "../../src/ingest/previewIndex";
import type { PreviewEntry } from "../../src/ingest/preview";

export const INGEST_AUDIT_PREFIX = "poem-rpg/ingest-audit/";

export type AuditUser = {
  raw?: string;
  canonical?: string | null;
  studentId?: string | null;
  nickname?: string | null;
  classId?: string | null;
};

export type AuditRecord = {
  auditId?: string;
  jobId?: string;
  timestamp?: string;
  tool?: string;
  user?: AuditUser;
  query?: Record<string, unknown>;
  response?: {
    verdict?: string;
    issues?: Array<{ rule?: string; message?: string; severity?: string }>;
    pack?: { dlcId?: string; version?: string };
    playUrl?: string;
    reason?: string;
  } | null;
  transcript?: { error?: string; lastMessage?: string; model?: string } | null;
};

export type AuditEntry = { dir: string; record: AuditRecord };

export function auditRecordKey(dir: string): string {
  return `${dir.replace(/\/+$/, "")}/record.json`;
}

export function auditPackZipKey(dir: string): string {
  return `${dir.replace(/\/+$/, "")}/pack.zip`;
}

export function userDigits(userId: string): string {
  return String(userId ?? "").match(/\d+$/)?.[0] ?? "";
}

export function defaultStore(): PoemStore {
  return getPoemStore();
}

export async function listAuditDirs(store: PoemStore = defaultStore()): Promise<string[]> {
  const { prefixes } = await store.listObjects(INGEST_AUDIT_PREFIX, { delimiter: "/" });
  return [...prefixes].sort((a, b) => a.localeCompare(b));
}

export function auditDirsForUser(dirs: string[], userId: string): string[] {
  const digits = userDigits(userId);
  if (!digits) return [];
  return dirs.filter((dir) => dir.includes(`_${digits}_`));
}

export async function readAuditRecord(store: PoemStore, dir: string): Promise<AuditRecord | null> {
  return store.readJson<AuditRecord>(auditRecordKey(dir));
}

/** 只认「提交」记录；查询类工具（list_my_dlc 等）与无效用户记录一律排除。 */
export function isIngestDlcRecord(record: AuditRecord | null | undefined): boolean {
  return String(record?.tool ?? "") === "ingest_dlc";
}

export function recordMatchesSlot(
  record: AuditRecord,
  slot: { canonical: string; poetId: string; workTitle: string },
): boolean {
  if (String(record.user?.canonical ?? "") !== slot.canonical) return false;
  const query = record.query ?? {};
  const poetId = String(query.poetId ?? "");
  const workTitle = String(query.workTitle ?? "");
  if (poetId && poetId !== slot.poetId) return false;
  if (workTitle && workTitle !== slot.workTitle) return false;
  return true;
}

export function isEngineFailure(record: AuditRecord): boolean {
  const issues = record.response?.issues;
  return Array.isArray(issues) && issues.some((issue) => issue?.rule === "审核引擎");
}

export function newestFirst(entries: AuditEntry[]): AuditEntry[] {
  return [...entries].sort((a, b) => String(b.record.timestamp ?? "").localeCompare(String(a.record.timestamp ?? "")));
}

/** 某个学员的全部提交记录（已按时间倒序）。 */
export async function loadIngestEntriesForUser(
  store: PoemStore,
  dirs: string[],
  canonical: string,
): Promise<AuditEntry[]> {
  const entries: AuditEntry[] = [];
  for (const dir of auditDirsForUser(dirs, canonical)) {
    const record = await readAuditRecord(store, dir);
    if (!isIngestDlcRecord(record) || !record) continue;
    if (String(record.user?.canonical ?? "") !== canonical) continue;
    entries.push({ dir, record });
  }
  return newestFirst(entries);
}

/** 某个 slot（学员 + 诗人 + 篇目）最近一次真正的提交；找不到返回 null。 */
export function latestForSlot(entries: AuditEntry[], slot: { poetId: string; workTitle: string }): AuditEntry | null {
  const hit = entries.find((entry) => {
    const query = entry.record.query ?? {};
    const poetId = String(query.poetId ?? "");
    const workTitle = String(query.workTitle ?? "");
    if (poetId && poetId !== slot.poetId) return false;
    if (workTitle && workTitle !== slot.workTitle) return false;
    return true;
  });
  return hit ?? null;
}

export function previewKey(): string {
  return ingestPreviewIndexKey();
}

export async function readPreviewEntries(store: PoemStore = defaultStore()): Promise<PreviewEntry[]> {
  return loadPreviewIndex(store);
}

export async function readBuffer(store: PoemStore, key: string): Promise<Buffer | null> {
  return store.getObject(key);
}

export async function readText(store: PoemStore, key: string): Promise<string | null> {
  const buffer = await store.getObject(key);
  return buffer ? buffer.toString("utf8") : null;
}
