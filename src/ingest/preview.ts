import type { UploadedPack } from "../dlc/uploadIndex";
import { L2_STUDENT_BY_ID } from "./l2Students";
import { parseIngestUserId } from "./userId";

export type PreviewStatus = "reviewing" | "rejected" | "published";

export type PreviewEntry = {
  slotKey: string;
  userId: string;
  nickname: string;
  poetId: string;
  poet: string;
  workTitle: string;
  dlcId: string;
  status: PreviewStatus;
  updatedAt: string;
};

export const PREVIEW_STATUS_LABEL: Record<PreviewStatus, string> = {
  reviewing: "审核中",
  rejected: "审核失败",
  published: "上架成功",
};

const STATUSES = new Set<PreviewStatus>(["reviewing", "rejected", "published"]);

export function previewSlotKey(userId: string, poetId: string, workTitle: string): string {
  return `${userId.trim()}::${poetId.trim()}::${workTitle.trim()}`;
}

export function nicknameForUserId(userId: string): string {
  const parsed = parseIngestUserId(userId);
  if (parsed?.nickname) {
    return parsed.nickname;
  }
  const digits = userId.trim().match(/\d+$/);
  const student = digits ? L2_STUDENT_BY_ID.get(digits[0]) : undefined;
  return student?.nickname ?? "";
}

export function asPreviewEntry(value: unknown): PreviewEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const userId = String(record.userId ?? "").trim();
  const poetId = String(record.poetId ?? "").trim();
  const workTitle = String(record.workTitle ?? "").trim();
  if (!userId || !poetId || !workTitle) {
    return null;
  }
  const status = STATUSES.has(record.status as PreviewStatus) ? (record.status as PreviewStatus) : null;
  if (!status) {
    return null;
  }
  return {
    slotKey: String(record.slotKey ?? "").trim() || previewSlotKey(userId, poetId, workTitle),
    userId,
    nickname: String(record.nickname ?? "").trim(),
    poetId,
    poet: String(record.poet ?? "").trim(),
    workTitle,
    dlcId: String(record.dlcId ?? "").trim(),
    status,
    updatedAt: String(record.updatedAt ?? "").trim(),
  };
}

export function previewFromUploadedPack(pack: UploadedPack, nickname = ""): PreviewEntry {
  return {
    slotKey: previewSlotKey(pack.userId, pack.poetId, pack.workTitle),
    userId: pack.userId,
    nickname: nickname || nicknameForUserId(pack.userId),
    poetId: pack.poetId,
    poet: pack.poet,
    workTitle: pack.workTitle,
    dlcId: pack.dlcId,
    status: "published",
    updatedAt: pack.uploadedAt,
  };
}

export function mergePreviewRows(previews: PreviewEntry[], packs: UploadedPack[]): PreviewEntry[] {
  const map = new Map<string, PreviewEntry>();
  for (const pack of packs) {
    const row = previewFromUploadedPack(pack);
    if (!row.slotKey) {
      continue;
    }
    map.set(row.slotKey, row);
  }
  for (const preview of previews) {
    map.set(preview.slotKey, preview);
  }
  return [...map.values()].sort((left, right) => {
    const byTime = right.updatedAt.localeCompare(left.updatedAt);
    if (byTime !== 0) {
      return byTime;
    }
    return left.slotKey.localeCompare(right.slotKey);
  });
}

export function previewPlayDlcId(entry: PreviewEntry): string {
  return entry.status === "published" ? entry.dlcId : "";
}
