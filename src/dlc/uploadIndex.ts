import { STATIC_OSS_PREFIX } from "../assets/cdn";
import { getPoemStore, uploadedCompiledKey, uploadsIndexKey, type PoemStore } from "../server/poemStore";
import type { UploadedDlcSource, UploadedPack } from "./uploadedContent";

export type { UploadedPack } from "./uploadedContent";
export { findUploadedPack, publishedUploads, uploadedPackToCompileResult } from "./uploadedContent";

function asUploadedPack(value: unknown): UploadedPack | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const userId = String(record.userId ?? "").trim();
  const dlcId = String(record.dlcId ?? "").trim();
  if (!userId || !dlcId) {
    return null;
  }
  return {
    userId,
    dlcId,
    poetId: String(record.poetId ?? "").trim(),
    poet: String(record.poet ?? "").trim(),
    workTitle: String(record.workTitle ?? "").trim(),
    title: String(record.title ?? "").trim(),
    author: String(record.author ?? "").trim(),
    version: String(record.version ?? "").trim(),
    summary: String(record.summary ?? "").trim(),
    uploadedAt: String(record.uploadedAt ?? "").trim(),
    contentSha256: String(record.contentSha256 ?? "").trim() || undefined,
  };
}

export async function loadUploadIndex(store: PoemStore = getPoemStore()): Promise<UploadedPack[]> {
  const raw = await store.readJson<unknown>(uploadsIndexKey());
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(asUploadedPack).filter((item): item is UploadedPack => Boolean(item));
}

export async function saveUploadIndex(packs: UploadedPack[], store: PoemStore = getPoemStore()): Promise<void> {
  await store.writeJson(uploadsIndexKey(), packs);
}

export async function loadUploadedCompiled(
  dlcId: string,
  store: PoemStore = getPoemStore(),
): Promise<unknown | null> {
  return store.readJson(uploadedCompiledKey(dlcId));
}

export function staticDlcObjectKey(dlcId: string, relativePath: string): string {
  const cleaned = relativePath.replace(/^\/+/, "");
  return `${STATIC_OSS_PREFIX}/dlc/${dlcId}/${cleaned}`;
}

/**
 * 把 OSS 上传层接到内核的上传层端口上。
 *
 * 由根目录 instrumentation.ts 在服务启动时调用。store 在每次调用时才取，
 * 避免在启动阶段就把 OSS 凭据固化下来。
 */
export function createUploadedDlcSource(): UploadedDlcSource {
  return {
    listPacks: () => loadUploadIndex(),
    loadCompiled: (id) => loadUploadedCompiled(id),
  };
}
