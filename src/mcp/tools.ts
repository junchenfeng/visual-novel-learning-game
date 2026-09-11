import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { MAX_ZIP_BYTES } from "../dlc/uploadPack";
import { portraitQueryMeta, runWithIngestUser, zipQueryMeta, type IngestGateOptions } from "../ingest/gate";
import { type IngestResult } from "../ingest/issues";
import { reviewAndIngestDlc } from "../ingest/reviewIngest";
import { portraitHint } from "../roster/portrait";
import { loadRoster, upsertPoet, upsertWork } from "../roster/store";

export function decodeBase64Payload(raw: string): Buffer {
  const cleaned = raw.trim().replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  return Buffer.from(cleaned, "base64");
}

export function readOptionalPath(filePath?: string): Buffer | null {
  if (!filePath?.trim()) {
    return null;
  }
  return readFileSync(filePath.trim());
}

export function jsonText(value: unknown): { content: { type: "text"; text: string }[] } {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

export async function listRosterTool(input: { userId: string }, options: IngestGateOptions = {}) {
  return runWithIngestUser({
    tool: "list_roster",
    rawUserId: input.userId,
    query: { userId: input.userId },
    store: options.store,
    now: options.now,
    run: async () => {
      const poets = await loadRoster();
      return {
        poets: poets.map((poet) => ({
          poetId: poet.poetId,
          poet: poet.poet,
          works: poet.works.map((work) => work.title),
        })),
        portraitHint: portraitHint(),
      };
    },
  });
}

export async function upsertPoetTool(
  input: {
    userId: string;
    poetId: string;
    poet: string;
    portraitBase64?: string;
    portraitPath?: string;
    portraitMime?: string;
  },
  options: IngestGateOptions = {},
) {
  const fromPath = readOptionalPath(input.portraitPath);
  const portrait = fromPath ?? (input.portraitBase64 ? decodeBase64Payload(input.portraitBase64) : null);
  return runWithIngestUser({
    tool: "upsert_poet",
    rawUserId: input.userId,
    query: portraitQueryMeta(portrait, {
      userId: input.userId,
      poetId: input.poetId,
      poet: input.poet,
      portraitPath: input.portraitPath,
      portraitMime: input.portraitMime,
    }),
    portraitBuffer: portrait ?? undefined,
    store: options.store,
    now: options.now,
    run: async () => {
      if (!portrait) {
        return { issues: [`缺少头像。${portraitHint()}`] };
      }
      const mime =
        input.portraitMime ||
        (input.portraitPath
          ? {
              ".png": "image/png",
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".webp": "image/webp",
            }[extname(input.portraitPath).toLowerCase()]
          : undefined);
      return upsertPoet({
        poetId: input.poetId,
        poet: input.poet,
        portrait,
        portraitMime: mime,
      });
    },
  });
}

export async function upsertWorkTool(
  input: { userId: string; poetId: string; workTitle: string },
  options: IngestGateOptions = {},
) {
  return runWithIngestUser({
    tool: "upsert_work",
    rawUserId: input.userId,
    query: {
      userId: input.userId,
      poetId: input.poetId,
      workTitle: input.workTitle,
    },
    store: options.store,
    now: options.now,
    run: async () => upsertWork(input.poetId, input.workTitle),
  });
}

export async function ingestDlcTool(
  input: {
    userId: string;
    poetId: string;
    workTitle: string;
    zipBase64?: string;
    zipPath?: string;
    zipBuffer?: Buffer;
    origin?: string;
  },
  options: IngestGateOptions = {},
): Promise<IngestResult> {
  const fromPath = readOptionalPath(input.zipPath);
  const zipBuffer =
    input.zipBuffer ?? fromPath ?? (input.zipBase64 ? decodeBase64Payload(input.zipBase64) : null);
  return runWithIngestUser<IngestResult>({
    tool: "ingest_dlc",
    rawUserId: input.userId,
    query: zipQueryMeta(zipBuffer, {
      userId: input.userId,
      poetId: input.poetId,
      workTitle: input.workTitle,
      zipPath: input.zipPath,
    }),
    zipBuffer: zipBuffer ?? undefined,
    store: options.store,
    now: options.now,
    extractTranscript: (result) => result.transcript,
    run: async (user) => {
      if (!zipBuffer) {
        return {
          verdict: "reject" as const,
          issues: [
            {
              severity: "blocking" as const,
              source: "machine" as const,
              rule: "zip",
              message: "请提供 zipBase64，或在本机 stdio 下提供 zipPath",
            },
          ],
        };
      }
      if (zipBuffer.byteLength > MAX_ZIP_BYTES) {
        return {
          verdict: "reject" as const,
          issues: [
            {
              severity: "blocking" as const,
              source: "machine" as const,
              rule: "zip 大小",
              message: `zip 超过 ${Math.round(MAX_ZIP_BYTES / (1024 * 1024))}MB`,
            },
          ],
        };
      }
      return reviewAndIngestDlc({
        form: { userId: user.canonical, poetId: input.poetId.trim(), workTitle: input.workTitle.trim() },
        zipBuffer,
        origin: input.origin,
      });
    },
  });
}
