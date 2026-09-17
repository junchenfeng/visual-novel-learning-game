import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { UploadedPack } from "../dlc/uploadedContent";
import { usageDownloadQueryMeta, runWithIngestUser, type IngestGateOptions } from "../ingest/gate";
import { playUrl } from "../server/siteUrl";
import { buildUsageManifest, listMyDlcs, readUsageObjects } from "../usage/collect";
import { assertSafeRelativePath } from "../usage/paths";
import {
  DEFAULT_USAGE_TARGET_DIR,
  UsageAccessError,
  UsageLimitError,
  type UsageDownloadFile,
} from "../usage/types";

/** stdio 传输下工具进程就在调用方本机，允许直接落盘；远程只回内容。 */
export const MCP_TRANSPORT_ENV = "POEM_MCP_TRANSPORT";

export function isStdioTransport(): boolean {
  return process.env[MCP_TRANSPORT_ENV] === "stdio";
}

function siteOrigin(origin?: string): string {
  const fromEnv = process.env.PUBLIC_SITE_URL?.trim();
  return (origin || fromEnv || "https://poem.aibeaver.cn").replace(/\/+$/, "");
}

export async function listMyDlcTool(
  input: { userId: string; origin?: string },
  options: IngestGateOptions = {},
) {
  return runWithIngestUser({
    tool: "list_my_dlc",
    rawUserId: input.userId,
    query: { userId: input.userId },
    store: options.store,
    now: options.now,
    run: async (user) => {
      try {
        const packs = await listMyDlcs(user, { store: options.store, now: options.now });
        const origin = siteOrigin(input.origin);
        return {
          userId: user.canonical,
          nickname: user.nickname,
          classId: user.classId,
          dlcs: packs.map((pack) => dlcSummary(pack, origin)),
        };
      } catch (error) {
        return usageErrorResult(error);
      }
    },
  });
}

export async function usageManifestTool(
  input: {
    userId: string;
    dlcId?: string;
    targetDir?: string;
    cacheTtlMs?: number;
  },
  options: IngestGateOptions = {},
) {
  return runWithIngestUser({
    tool: "usage_manifest",
    rawUserId: input.userId,
    query: {
      userId: input.userId,
      dlcId: input.dlcId,
      targetDir: input.targetDir,
    },
    store: options.store,
    now: options.now,
    run: async (user) => {
      try {
        const manifest = await buildUsageManifest(user, {
          store: options.store,
          now: options.now,
          dlcIds: input.dlcId ? [input.dlcId] : undefined,
          cacheTtlMs: input.cacheTtlMs,
        });
        const targetDir = input.targetDir?.trim() || DEFAULT_USAGE_TARGET_DIR;
        return {
          ...manifest,
          nickname: user.nickname,
          targetDir,
          summary: `${manifest.dlcIds.length} 个课包、${manifest.files.length} 个文件`,
        };
      } catch (error) {
        return usageErrorResult(error);
      }
    },
  });
}

export async function downloadUsageFilesTool(
  input: {
    userId: string;
    paths: string[];
    targetDir?: string;
    cacheTtlMs?: number;
  },
  options: IngestGateOptions = {},
) {
  const targetDir = input.targetDir?.trim() || DEFAULT_USAGE_TARGET_DIR;
  return runWithIngestUser({
    tool: "download_usage_files",
    rawUserId: input.userId,
    query: usageDownloadQueryMeta({ userId: input.userId, paths: input.paths, targetDir }),
    store: options.store,
    now: options.now,
    run: async (user) => {
      try {
        const result = await readUsageObjects(user, input.paths, {
          store: options.store,
          now: options.now,
          targetDir,
          cacheTtlMs: input.cacheTtlMs,
        });
        if (!isStdioTransport()) {
          return {
            userId: result.userId,
            targetDir,
            transport: "remote",
            files: result.files.map(remoteFile),
          };
        }
        const written = writeLocalFiles(targetDir, result.files);
        return {
          userId: result.userId,
          targetDir,
          transport: "stdio",
          writtenRoot: written.root,
          files: written.files,
        };
      } catch (error) {
        return usageErrorResult(error);
      }
    },
  });
}

function dlcSummary(pack: UploadedPack, origin: string) {
  return {
    dlcId: pack.dlcId,
    poetId: pack.poetId,
    poet: pack.poet,
    workTitle: pack.workTitle,
    title: pack.title,
    version: pack.version,
    uploadedAt: pack.uploadedAt,
    playUrl: playUrl(origin, pack.dlcId),
  };
}

function remoteFile(file: UsageDownloadFile) {
  return {
    path: file.path,
    source: file.source,
    dlcId: file.dlcId,
    kind: file.kind,
    player: file.player,
    size: file.size,
    sha256: file.sha256,
    contentBase64: file.contentBase64,
  };
}

function writeLocalFiles(targetDir: string, files: UsageDownloadFile[]) {
  const root = path.resolve(process.cwd(), targetDir);
  const written: Array<{ path: string; dlcId: string; kind: string; size: number; sha256: string }> = [];
  for (const file of files) {
    const relative = assertSafeRelativePath(file.path);
    const dest = path.join(root, relative);
    const inside = path.relative(root, dest);
    if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) {
      throw new UsageAccessError([file.path]);
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(file.contentBase64, "base64"));
    written.push({
      path: relative,
      dlcId: file.dlcId,
      kind: file.kind,
      size: file.size,
      sha256: file.sha256,
    });
  }
  return { root, files: written };
}

function usageErrorResult(error: unknown): { error: string; invalidPaths?: string[] } {
  if (error instanceof UsageAccessError) {
    return { error: error.message, invalidPaths: error.paths };
  }
  if (error instanceof UsageLimitError) {
    return { error: error.message };
  }
  console.error("usage 读取失败", error instanceof Error ? error.message : error);
  return { error: "读取使用数据失败，请稍后重试" };
}
