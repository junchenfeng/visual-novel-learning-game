import { getPoemStore, ingestPreviewIndexKey, type PoemStore } from "../server/poemStore";
import { asPreviewEntry, previewSlotKey, type PreviewEntry, type PreviewStatus } from "./preview";

export type UpsertPreviewInput = {
  userId: string;
  poetId: string;
  workTitle: string;
  nickname?: string;
  poet?: string;
  status: PreviewStatus;
  dlcId?: string;
  now?: Date;
};

export async function loadPreviewIndex(store: PoemStore = getPoemStore()): Promise<PreviewEntry[]> {
  const raw = await store.readJson<unknown>(ingestPreviewIndexKey());
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(asPreviewEntry).filter((item): item is PreviewEntry => Boolean(item));
}

export async function savePreviewIndex(
  entries: PreviewEntry[],
  store: PoemStore = getPoemStore(),
): Promise<void> {
  await store.writeJson(ingestPreviewIndexKey(), entries);
}

export async function upsertPreviewEntry(
  input: UpsertPreviewInput,
  store: PoemStore = getPoemStore(),
): Promise<PreviewEntry> {
  const userId = input.userId.trim();
  const poetId = input.poetId.trim();
  const workTitle = input.workTitle.trim();
  const slotKey = previewSlotKey(userId, poetId, workTitle);
  const index = await loadPreviewIndex(store);
  const existing = index.find((item) => item.slotKey === slotKey);
  const next: PreviewEntry = {
    slotKey,
    userId,
    nickname: input.nickname?.trim() || existing?.nickname || "",
    poetId,
    poet: input.poet?.trim() || existing?.poet || "",
    workTitle,
    dlcId: nextDlcId(input.status, input.dlcId, existing?.dlcId),
    status: input.status,
    updatedAt: (input.now ?? new Date()).toISOString(),
  };
  await savePreviewIndex([next, ...index.filter((item) => item.slotKey !== slotKey)], store);
  return next;
}

export async function safeUpsertPreviewEntry(
  input: UpsertPreviewInput,
  store?: PoemStore,
): Promise<PreviewEntry | null> {
  try {
    return await upsertPreviewEntry(input, store ?? getPoemStore());
  } catch (error) {
    console.error("ingest preview 写入失败", error instanceof Error ? error.message : error);
    return null;
  }
}

function nextDlcId(status: PreviewStatus, incoming?: string, existing?: string): string {
  if (status === "published") {
    return incoming?.trim() || existing || "";
  }
  if (status === "rejected") {
    return "";
  }
  return existing || "";
}
