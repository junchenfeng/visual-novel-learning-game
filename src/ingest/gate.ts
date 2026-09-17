import type { PoemStore } from "../server/poemStore";
import { safeWriteIngestAudit, sha256Hex } from "./audit";
import { ingestUserReject, parseIngestUserId, type IngestUser } from "./userId";

export type IngestToolName =
  | "list_roster"
  | "upsert_poet"
  | "upsert_work"
  | "ingest_dlc"
  | "list_my_dlc"
  | "usage_manifest"
  | "download_usage_files";

export type IngestGateOptions = {
  store?: PoemStore;
  now?: Date;
};

export async function runWithIngestUser<T extends object>(options: {
  tool: IngestToolName;
  rawUserId: string;
  query: unknown;
  zipBuffer?: Buffer;
  portraitBuffer?: Buffer;
  run: (user: IngestUser) => Promise<T>;
  extractTranscript?: (result: T) => unknown;
} & IngestGateOptions): Promise<(T & { auditId?: string }) | (ReturnType<typeof ingestUserReject> & { auditId?: string })> {
  const user = parseIngestUserId(options.rawUserId);
  if (!user) {
    const response = ingestUserReject();
    const auditId = await safeWriteIngestAudit({
      tool: options.tool,
      rawUserId: options.rawUserId,
      user: null,
      query: options.query,
      response,
      zipBuffer: options.zipBuffer,
      portraitBuffer: options.portraitBuffer,
      store: options.store,
      now: options.now,
    });
    return attachAuditId(response, auditId);
  }

  const result = await options.run(user);
  const transcript = options.extractTranscript?.(result);
  const publicResult = omitTranscript(result);
  const auditId = await safeWriteIngestAudit({
    tool: options.tool,
    rawUserId: options.rawUserId,
    user,
    query: options.query,
    response: publicResult,
    transcript,
    zipBuffer: options.zipBuffer,
    portraitBuffer: options.portraitBuffer,
    store: options.store,
    now: options.now,
  });
  return attachAuditId(publicResult, auditId);
}

export function zipQueryMeta(zipBuffer: Buffer | null, extras: Record<string, unknown> = {}) {
  if (!zipBuffer) {
    return extras;
  }
  return {
    ...extras,
    zipBytes: zipBuffer.byteLength,
    zipSha256: sha256Hex(zipBuffer),
  };
}

export function portraitQueryMeta(portrait: Buffer | null, extras: Record<string, unknown> = {}) {
  if (!portrait) {
    return extras;
  }
  return {
    ...extras,
    portraitBytes: portrait.byteLength,
    portraitSha256: sha256Hex(portrait),
  };
}

/**
 * 下载类工具的审计 query：只记路径、条数与目标目录，**不记 base64 正文**。
 * 与 zipQueryMeta / portraitQueryMeta 同风格。
 */
export function usageDownloadQueryMeta(input: {
  userId: string;
  paths: string[];
  targetDir?: string;
}) {
  return {
    userId: input.userId,
    targetDir: input.targetDir,
    fileCount: input.paths.length,
    paths: input.paths,
  };
}

function omitTranscript<T>(value: T): T {
  if (!value || typeof value !== "object" || !("transcript" in value)) {
    return value;
  }
  const { transcript: _ignored, ...rest } = value as T & { transcript?: unknown };
  void _ignored;
  return rest as T;
}

function attachAuditId<T extends object>(value: T, auditId: string | null): T & { auditId?: string } {
  if (!auditId) {
    return value;
  }
  return { ...value, auditId };
}
