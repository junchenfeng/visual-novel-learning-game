import { createHash } from "node:crypto";
import { getPoemStore, type PoemStore } from "../server/poemStore";
import type { IngestUser } from "./userId";

const OSS_PREFIX = "poem-rpg";

export type IngestAuditRecord = {
  auditId: string;
  timestamp: string;
  tool: string;
  user: {
    raw: string;
    canonical: string | null;
    studentId: string | null;
    nickname: string | null;
    classId: string | null;
  };
  query: unknown;
  response: unknown;
  transcript?: unknown;
};

export function compactAuditTimestamp(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d+/, "");
}

export function ingestAuditPrefix(canonicalUserId: string, timestamp: string): string {
  return `${OSS_PREFIX}/ingest-audit/${canonicalUserId}_${compactAuditTimestamp(timestamp)}`;
}

export function sha256Hex(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

export async function writeIngestAudit(options: {
  tool: string;
  rawUserId: string;
  user?: IngestUser | null;
  query: unknown;
  response: unknown;
  transcript?: unknown;
  zipBuffer?: Buffer;
  portraitBuffer?: Buffer;
  store?: PoemStore;
  now?: Date;
}): Promise<string> {
  const store = options.store ?? getPoemStore();
  const timestamp = (options.now ?? new Date()).toISOString();
  const canonical = options.user?.canonical ?? `invalid_${sanitizeKey(options.rawUserId) || "unknown"}`;
  const auditId = `${canonical}_${compactAuditTimestamp(timestamp)}`;
  const prefix = ingestAuditPrefix(canonical, timestamp);
  const record: IngestAuditRecord = {
    auditId,
    timestamp,
    tool: options.tool,
    user: {
      raw: options.rawUserId,
      canonical: options.user?.canonical ?? null,
      studentId: options.user?.studentId ?? null,
      nickname: options.user?.nickname ?? null,
      classId: options.user?.classId ?? null,
    },
    query: options.query,
    response: options.response,
    transcript: options.transcript,
  };
  await store.writeJson(`${prefix}/query.json`, {
    tool: record.tool,
    timestamp: record.timestamp,
    user: record.user,
    query: record.query,
  });
  await store.writeJson(`${prefix}/response.json`, record.response);
  if (options.transcript !== undefined) {
    await store.writeJson(`${prefix}/transcript.json`, options.transcript);
  }
  if (options.zipBuffer && options.zipBuffer.byteLength > 0) {
    await store.putObject(`${prefix}/pack.zip`, options.zipBuffer, {
      mime: "application/zip",
      cacheControl: "private, max-age=0, no-cache",
    });
  }
  if (options.portraitBuffer && options.portraitBuffer.byteLength > 0) {
    await store.putObject(`${prefix}/portrait.bin`, options.portraitBuffer, {
      mime: "application/octet-stream",
      cacheControl: "private, max-age=0, no-cache",
    });
  }
  await store.writeJson(`${prefix}/record.json`, record);
  return auditId;
}

function sanitizeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
}

export async function safeWriteIngestAudit(
  options: Parameters<typeof writeIngestAudit>[0],
): Promise<string | null> {
  try {
    return await writeIngestAudit(options);
  } catch (error) {
    console.error("ingest audit 写入失败", error instanceof Error ? error.message : error);
    return null;
  }
}
