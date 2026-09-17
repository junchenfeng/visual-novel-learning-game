import { createHash } from "node:crypto";

/** 与 src/server/poemStore.ts 的 OSS_PREFIX 保持一致；这里只写常量，避免拉进宿主依赖。 */
export const USAGE_OSS_PREFIX = "poem-rpg";

/** 挂在 poem-rpg/ 下的系统目录，不是游玩者目录，枚举时必须跳过。 */
export const RESERVED_PLAYER_DIRS = new Set([
  "likes",
  "uploads",
  "ingest-audit",
  "ingest-preview",
  "static",
  "usage",
]);

export function sha256Hex(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * 游玩者用户名的稳定 slug。
 *
 * 用户名允许中文、下划线、短横线，直接做文件名在部分环境不稳；这里保留可读的
 * ASCII 前缀并追加内容哈希，保证「同一用户名总是同一个 slug」，中文名也能落盘。
 */
export function playerSlug(username: string): string {
  const trimmed = username.trim();
  const ascii = trimmed.replace(/[^A-Za-z0-9_-]+/g, "").slice(0, 16);
  const digest = createHash("sha1").update(trimmed).digest("hex").slice(0, 8);
  return `${ascii || "player"}-${digest}`;
}

export function playerObjectPrefix(player: string): string {
  return `${USAGE_OSS_PREFIX}/${player}/`;
}

export function playerSessionsPrefix(player: string): string {
  return `${playerObjectPrefix(player)}sessions/`;
}

export function playerEventsKey(player: string): string {
  return `${playerObjectPrefix(player)}events.json`;
}

export function sessionLocalPath(dlcId: string, player: string, sessionFileId: string): string {
  return `${dlcId}/sessions/${playerSlug(player)}-${safeFileToken(sessionFileId)}.json`;
}

export function eventsLocalPath(dlcId: string, player: string): string {
  return `${dlcId}/events/${playerSlug(player)}.json`;
}

/** 会话文件 id 已由 idSchema 约束为 [a-z0-9_-]，这里只做兜底清洗。 */
export function safeFileToken(value: string): string {
  const cleaned = value.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "session";
}

/**
 * 落盘路径安全校验：只接受相对路径，禁止 `..`、绝对路径、空段与反斜杠。
 * 与 src/dlc/uploadPack.ts 的 resolveSafeZipTarget 同等级。
 */
export function assertSafeRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.startsWith("/")) {
    throw new Error(`不安全的落盘路径：${value}`);
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`不安全的落盘路径：${value}`);
  }
  return normalized;
}
