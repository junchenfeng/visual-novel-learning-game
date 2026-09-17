import { STATIC_OSS_PREFIX } from "../assets/cdn";
import type { CompileResult } from "./compiler";
import { getPoemStore, uploadedCompiledKey, uploadsIndexKey, type PoemStore } from "../server/poemStore";
import { isUnpublishedDlc } from "./unpublished";

export type UploadedPack = {
  userId: string;
  dlcId: string;
  poetId: string;
  poet: string;
  workTitle: string;
  title: string;
  author: string;
  version: string;
  summary: string;
  uploadedAt: string;
};

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
  };
}

export function uploadedPackToCompileResult(pack: UploadedPack): CompileResult {
  return {
    id: pack.dlcId,
    version: pack.version,
    title: pack.title,
    author: pack.author,
    poet: pack.poet,
    poetId: pack.poetId,
    workTitle: pack.workTitle,
    summary: pack.summary,
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

export function findUploadedPack(index: UploadedPack[], dlcId: string): UploadedPack | undefined {
  return index.find((item) => item.dlcId === dlcId);
}

export function publishedUploads(
  index: UploadedPack[],
  reservedGitIds: Set<string>,
): UploadedPack[] {
  return index.filter((item) => !isUnpublishedDlc(item.dlcId) && !reservedGitIds.has(item.dlcId));
}
