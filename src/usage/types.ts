import { z } from "zod";

/** 导出文件的分门别类：对局记录 / 行为事件流。 */
export const usageFileKindSchema = z.enum(["session", "events"]);
export type UsageFileKind = z.infer<typeof usageFileKindSchema>;

/**
 * 清单里的一个待落盘文件。
 *
 * `path` 是相对 targetDir（默认 assets/user_data）的稳定路径：同一份来源每次同步
 * 都会得到同一个 path，增量比对才成立。`source` 是它在 OSS / 本机 store 里的原始 key。
 */
export const usageFileEntrySchema = z.object({
  path: z.string().min(1),
  source: z.string().min(1),
  dlcId: z.string().min(1),
  kind: usageFileKindSchema,
  /** 游玩者自填用户名（原样保留，文件名另走 slug）。 */
  player: z.string(),
  size: z.number().int().nonnegative(),
  updatedAt: z.string().optional(),
  sha256: z.string().min(1),
});
export type UsageFileEntry = z.infer<typeof usageFileEntrySchema>;

export const usageManifestSchema = z.object({
  userId: z.string().min(1),
  generatedAt: z.string().min(1),
  dlcIds: z.array(z.string()),
  files: z.array(usageFileEntrySchema),
});
export type UsageManifest = z.infer<typeof usageManifestSchema>;

/** 默认落盘根目录（相对调用方仓库根）。 */
export const DEFAULT_USAGE_TARGET_DIR = "assets/user_data";

/** 单次下载调用允许的文件数与单文件体积上限，避免超大 tool result。 */
export const MAX_USAGE_FILES_PER_CALL = 25;
export const MAX_USAGE_FILE_BYTES = 8 * 1024 * 1024;

/** 请求了不属于本人课包、或不在清单中的路径。 */
export class UsageAccessError extends Error {
  constructor(public readonly paths: string[]) {
    super(`以下路径不属于你的课包或不在清单中：${paths.join("、")}`);
    this.name = "UsageAccessError";
  }
}

/** 超过单次导出上限。 */
export class UsageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageLimitError";
  }
}

export type UsageDownloadFile = UsageFileEntry & { contentBase64: string };

export type UsageDownloadResult = {
  userId: string;
  targetDir: string;
  files: UsageDownloadFile[];
};
