import {
  BEHAVIOR_EVENT_SCHEMA_VERSION,
  behaviorLogSchema,
  type BehaviorEvent,
} from "../analytics/eventSchema";
import type { UploadedPack } from "../dlc/uploadedContent";
import { isUnpublishedDlc } from "../dlc/unpublished";
import { loadUploadIndex } from "../dlc/uploadIndex";
import type { IngestUser } from "../ingest/userId";
import { getPoemStore, type PoemStore } from "../server/poemStore";
import { recordedSessionSchema } from "../sessions/recordedSession";
import {
  assertSafeRelativePath,
  eventsLocalPath,
  playerEventsKey,
  playerSessionsPrefix,
  RESERVED_PLAYER_DIRS,
  sessionLocalPath,
  sha256Hex,
  USAGE_OSS_PREFIX,
} from "./paths";
import {
  DEFAULT_USAGE_TARGET_DIR,
  MAX_USAGE_FILE_BYTES,
  MAX_USAGE_FILES_PER_CALL,
  UsageAccessError,
  UsageLimitError,
  usageManifestSchema,
  type UsageDownloadFile,
  type UsageDownloadResult,
  type UsageFileEntry,
  type UsageManifest,
} from "./types";

export type UsageCollectOptions = {
  store?: PoemStore;
  now?: Date;
  /** 只导出指定课包（必须都是本人课包，否则拒绝）。 */
  dlcIds?: string[];
  /** 清单缓存 TTL，默认 60s；传 0 关闭。 */
  cacheTtlMs?: number;
};

const DEFAULT_CACHE_TTL_MS = 60_000;
const manifestCache = new Map<string, { manifest: UsageManifest; expiresAt: number }>();

/** 测试与「先清单后下载」两次调用之间需要强制刷新时使用。 */
export function clearUsageManifestCache(): void {
  manifestCache.clear();
}

/** 本人（按上传索引 userId 归属）已上架、且未被隐藏的课包。 */
export async function listMyDlcs(
  user: IngestUser,
  options: UsageCollectOptions = {},
): Promise<UploadedPack[]> {
  const store = options.store ?? getPoemStore();
  const index = await loadUploadIndex(store);
  return index
    .filter((pack) => pack.userId === user.canonical && !isUnpublishedDlc(pack.dlcId))
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
}

/**
 * 枚举「我的课包」的使用数据清单。
 *
 * 数据是按游玩者用户名存的（`poem-rpg/{玩家}/sessions/*.json` 与 `.../events.json`），
 * `dlcId` 只在 JSON 内部，没有按 dlcId 的反查索引；因此这里先列出一级玩家目录，
 * 再逐个读回、按归属过滤。过滤必须读内容，哈希顺带算出，没有额外 I/O。
 */
export async function buildUsageManifest(
  user: IngestUser,
  options: UsageCollectOptions = {},
): Promise<UsageManifest> {
  const cacheKey = `${user.canonical}::${(options.dlcIds ?? []).join(",")}`;
  const ttl = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cached = manifestCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && ttl > 0) {
    return cached.manifest;
  }

  const store = options.store ?? getPoemStore();
  const packs = await listMyDlcs(user, options);
  const owned = new Map(packs.map((pack) => [pack.dlcId, pack]));
  const dlcIds = resolveRequestedDlcIds(options.dlcIds, owned);
  const ownedSet = new Set(dlcIds);

  const players = await listPlayers(store);
  const files: UsageFileEntry[] = [];
  for (const player of players) {
    files.push(...(await collectPlayerUsage(store, player, ownedSet)));
  }
  files.sort((left, right) => left.path.localeCompare(right.path));

  const manifest = usageManifestSchema.parse({
    userId: user.canonical,
    generatedAt: (options.now ?? new Date()).toISOString(),
    dlcIds,
    files,
  });
  if (ttl > 0) {
    manifestCache.set(cacheKey, { manifest, expiresAt: Date.now() + ttl });
  }
  return manifest;
}

/**
 * 按清单路径取内容。只接受清单里的路径；读回后再次校验归属，越权一律拒绝整单。
 */
export async function readUsageObjects(
  user: IngestUser,
  paths: string[],
  options: UsageCollectOptions & { targetDir?: string } = {},
): Promise<UsageDownloadResult> {
  const wanted = [...new Set(paths.map((path) => assertSafeRelativePath(path)))];
  if (wanted.length === 0) {
    throw new UsageAccessError(paths.length > 0 ? paths : ["(空路径)"]);
  }
  if (wanted.length > MAX_USAGE_FILES_PER_CALL) {
    throw new UsageLimitError(`一次最多下载 ${MAX_USAGE_FILES_PER_CALL} 个文件，当前 ${wanted.length} 个`);
  }

  const manifest = await buildUsageManifest(user, options);
  const byPath = new Map(manifest.files.map((file) => [file.path, file]));
  const invalid = wanted.filter((path) => !byPath.has(path));
  if (invalid.length > 0) {
    throw new UsageAccessError(invalid);
  }

  const store = options.store ?? getPoemStore();
  const files: UsageDownloadFile[] = [];
  for (const path of wanted) {
    const entry = byPath.get(path) as UsageFileEntry;
    const buffer = await loadOwnedObject(store, entry);
    files.push({
      ...entry,
      size: buffer.byteLength,
      sha256: sha256Hex(buffer),
      contentBase64: buffer.toString("base64"),
    });
  }
  return {
    userId: manifest.userId,
    targetDir: options.targetDir ?? DEFAULT_USAGE_TARGET_DIR,
    files,
  };
}

function resolveRequestedDlcIds(requested: string[] | undefined, owned: Map<string, UploadedPack>): string[] {
  const all = [...owned.keys()];
  if (!requested || requested.length === 0) {
    return all;
  }
  const unique = [...new Set(requested.map((item) => item.trim()).filter(Boolean))];
  const unknown = unique.filter((id) => !owned.has(id));
  if (unknown.length > 0) {
    throw new UsageAccessError(unknown);
  }
  return unique;
}

async function listPlayers(store: PoemStore): Promise<string[]> {
  const root = `${USAGE_OSS_PREFIX}/`;
  const listed = await store.listObjects(root, { delimiter: "/" });
  const players: string[] = [];
  for (const prefix of listed.prefixes) {
    if (!prefix.startsWith(root)) {
      continue;
    }
    const name = prefix.slice(root.length).replace(/\/+$/, "");
    if (!name || name.includes("/") || RESERVED_PLAYER_DIRS.has(name)) {
      continue;
    }
    players.push(name);
  }
  return players;
}

async function collectPlayerUsage(
  store: PoemStore,
  player: string,
  owned: Set<string>,
): Promise<UsageFileEntry[]> {
  const files: UsageFileEntry[] = [];
  const sessions = await store.listObjects(playerSessionsPrefix(player));
  for (const meta of sessions.keys) {
    const buffer = await store.getObject(meta.key);
    if (!buffer) {
      continue;
    }
    const session = parseSession(buffer);
    if (!session || !owned.has(session.dlcId)) {
      continue;
    }
    files.push({
      path: sessionLocalPath(session.dlcId, player, session.id),
      source: meta.key,
      dlcId: session.dlcId,
      kind: "session",
      player,
      size: buffer.byteLength,
      updatedAt: meta.updatedAt,
      sha256: sha256Hex(buffer),
    });
  }

  const eventsSource = playerEventsKey(player);
  const eventsBuffer = await store.getObject(eventsSource);
  if (eventsBuffer) {
    for (const [dlcId, body] of splitEventsByDlc(eventsBuffer, owned)) {
      files.push({
        path: eventsLocalPath(dlcId, player),
        source: eventsSource,
        dlcId,
        kind: "events",
        player,
        size: body.byteLength,
        sha256: sha256Hex(body),
      });
    }
  }
  return files;
}

function parseSession(buffer: Buffer) {
  try {
    const parsed = recordedSessionSchema.safeParse(JSON.parse(buffer.toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** events.json 是同一个人所有 DLC 的整体日志，必须逐条按归属拆开，绝不整份外带。 */
function splitEventsByDlc(buffer: Buffer, owned: Set<string>): Array<[string, Buffer]> {
  let raw: unknown;
  try {
    raw = JSON.parse(buffer.toString("utf8"));
  } catch {
    return [];
  }
  const parsed = behaviorLogSchema.safeParse(raw);
  if (!parsed.success) {
    return [];
  }
  const grouped = new Map<string, BehaviorEvent[]>();
  for (const event of parsed.data.events) {
    if (!owned.has(event.dlcId)) {
      continue;
    }
    const list = grouped.get(event.dlcId);
    if (list) {
      list.push(event);
    } else {
      grouped.set(event.dlcId, [event]);
    }
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dlcId, events]) => [
      dlcId,
      Buffer.from(
        `${JSON.stringify({ schemaVersion: BEHAVIOR_EVENT_SCHEMA_VERSION, events }, null, 2)}\n`,
        "utf8",
      ),
    ]);
}

/** 下载阶段按 entry 重新读回内容，并二次校验归属。 */
async function loadOwnedObject(store: PoemStore, entry: UsageFileEntry): Promise<Buffer> {
  if (entry.kind === "session") {
    const buffer = await store.getObject(entry.source);
    if (!buffer) {
      throw new UsageAccessError([entry.path]);
    }
    const session = parseSession(buffer);
    if (!session || session.dlcId !== entry.dlcId) {
      throw new UsageAccessError([entry.path]);
    }
    if (buffer.byteLength > MAX_USAGE_FILE_BYTES) {
      throw new UsageLimitError(`文件超过 ${Math.round(MAX_USAGE_FILE_BYTES / 1024 / 1024)}MB：${entry.path}`);
    }
    return buffer;
  }

  const source = await store.getObject(entry.source);
  if (!source) {
    throw new UsageAccessError([entry.path]);
  }
  const one = new Map([[entry.dlcId, source]]);
  const split = splitEventsByDlc(source, new Set(one.keys()));
  const body = split[0]?.[1];
  if (!body) {
    throw new UsageAccessError([entry.path]);
  }
  if (body.byteLength > MAX_USAGE_FILE_BYTES) {
    throw new UsageLimitError(`文件超过 ${Math.round(MAX_USAGE_FILE_BYTES / 1024 / 1024)}MB：${entry.path}`);
  }
  return body;
}
