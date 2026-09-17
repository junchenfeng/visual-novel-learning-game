import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadGalleryConfig } from "./galleryConfig";

const OSS_PREFIX = "poem-rpg";
const LOCAL_ROOT = path.join(process.cwd(), "assets", "poem-rpg");

export type UserPrefs = {
  selectedDlcByWork: Record<string, string>;
};

export type PutObjectOptions = {
  mime?: string;
  cacheControl?: string;
};

export type StoredObjectMeta = {
  key: string;
  size: number;
  updatedAt?: string;
};

export type ListObjectsResult = {
  keys: StoredObjectMeta[];
  /** 带 delimiter 时返回的「公共前缀」（目录），如 `poem-rpg/likes/`。 */
  prefixes: string[];
};

export type ListObjectsOptions = {
  /** 传 "/" 即按目录聚合（只拿一级子目录 / 本级文件），不传则递归列出全部。 */
  delimiter?: string;
};

export type PoemStore = {
  readJson<T>(key: string): Promise<T | null>;
  writeJson(key: string, value: unknown): Promise<void>;
  getObject(key: string): Promise<Buffer | null>;
  putObject(key: string, body: Buffer, options?: PutObjectOptions): Promise<void>;
  listObjects(prefix: string, options?: ListObjectsOptions): Promise<ListObjectsResult>;
};

/** 供内存 store / 测试复用的分组逻辑：给一批 key 加 delimiter 切出一级前缀。 */
export function groupKeysByDelimiter(
  prefix: string,
  keys: StoredObjectMeta[],
  delimiter?: string,
): ListObjectsResult {
  if (!delimiter) {
    return { keys: [...keys].sort((a, b) => a.key.localeCompare(b.key)), prefixes: [] };
  }
  const prefixes = new Set<string>();
  const files: StoredObjectMeta[] = [];
  for (const item of keys) {
    const remainder = item.key.slice(prefix.length);
    const index = remainder.indexOf(delimiter);
    if (index < 0) {
      files.push(item);
      continue;
    }
    prefixes.add(`${prefix}${remainder.slice(0, index + delimiter.length)}`);
  }
  return {
    keys: files.sort((a, b) => a.key.localeCompare(b.key)),
    prefixes: [...prefixes].sort((a, b) => a.localeCompare(b)),
  };
}

function isNoSuchKey(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { status?: number; code?: string; name?: string };
  return record.status === 404 || record.code === "NoSuchKey" || record.name === "NoSuchKeyError";
}

class LocalPoemStore implements PoemStore {
  private filePath(key: string) {
    return path.join(LOCAL_ROOT, key);
  }

  async getObject(key: string): Promise<Buffer | null> {
    const filePath = this.filePath(key);
    if (!existsSync(filePath)) {
      return null;
    }
    return readFileSync(filePath);
  }

  async putObject(key: string, body: Buffer): Promise<void> {
    const filePath = this.filePath(key);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, body);
  }

  async readJson<T>(key: string): Promise<T | null> {
    const body = await this.getObject(key);
    if (!body) {
      return null;
    }
    try {
      return JSON.parse(body.toString("utf8")) as T;
    } catch {
      return null;
    }
  }

  async writeJson(key: string, value: unknown): Promise<void> {
    await this.putObject(key, Buffer.from(`${JSON.stringify(value)}\n`, "utf8"));
  }

  async listObjects(prefix: string, options?: ListObjectsOptions): Promise<ListObjectsResult> {
    const collected: StoredObjectMeta[] = [];
    for (const filePath of walkFiles(path.join(LOCAL_ROOT, prefix))) {
      const stat = statSync(filePath);
      collected.push({
        key: path.relative(LOCAL_ROOT, filePath).split(path.sep).join("/"),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }
    return groupKeysByDelimiter(prefix, collected, options?.delimiter);
  }
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

type OssListObject = {
  name: string;
  size?: number;
  lastModified?: string;
  etag?: string;
};

type OssListResult = {
  objects?: OssListObject[] | null;
  prefixes?: string[] | null;
  isTruncated?: boolean;
  nextContinuationToken?: string;
};

type OssClient = {
  get: (key: string) => Promise<{ content: Buffer | string }>;
  put: (
    key: string,
    data: Buffer | string,
    options?: { mime?: string; headers?: Record<string, string> },
  ) => Promise<unknown>;
  list: (query: {
    prefix?: string;
    delimiter?: string;
    "max-keys"?: number;
    continuationToken?: string;
  }) => Promise<OssListResult>;
};

const OSS_LIST_PAGE_SIZE = 1000;

class OssPoemStore implements PoemStore {
  constructor(private readonly client: OssClient) {}

  async getObject(key: string): Promise<Buffer | null> {
    try {
      const result = await this.client.get(key);
      return typeof result.content === "string" ? Buffer.from(result.content, "utf8") : result.content;
    } catch (error) {
      if (isNoSuchKey(error)) {
        return null;
      }
      throw error;
    }
  }

  async putObject(key: string, body: Buffer, options?: PutObjectOptions): Promise<void> {
    const headers: Record<string, string> = {};
    if (options?.cacheControl) {
      headers["Cache-Control"] = options.cacheControl;
    }
    await this.client.put(key, body, {
      mime: options?.mime,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
  }

  async readJson<T>(key: string): Promise<T | null> {
    const body = await this.getObject(key);
    if (!body) {
      return null;
    }
    try {
      return JSON.parse(body.toString("utf8")) as T;
    } catch {
      return null;
    }
  }

  async writeJson(key: string, value: unknown): Promise<void> {
    await this.putObject(key, Buffer.from(`${JSON.stringify(value)}\n`, "utf8"), {
      mime: "application/json; charset=utf-8",
      cacheControl: "no-cache",
    });
  }

  async listObjects(prefix: string, options?: ListObjectsOptions): Promise<ListObjectsResult> {
    const keys: StoredObjectMeta[] = [];
    const prefixes = new Set<string>();
    let continuationToken: string | undefined;
    do {
      const result = await this.client.list({
        prefix,
        delimiter: options?.delimiter,
        "max-keys": OSS_LIST_PAGE_SIZE,
        continuationToken,
      });
      for (const item of result.objects ?? []) {
        keys.push({
          key: item.name,
          size: item.size ?? 0,
          updatedAt: item.lastModified,
        });
      }
      for (const item of result.prefixes ?? []) {
        prefixes.add(item);
      }
      continuationToken = result.isTruncated ? result.nextContinuationToken : undefined;
    } while (continuationToken);
    return {
      keys: keys.sort((a, b) => a.key.localeCompare(b.key)),
      prefixes: [...prefixes].sort((a, b) => a.localeCompare(b)),
    };
  }
}

let cachedStore: PoemStore | null = null;

export function getPoemStore(): PoemStore {
  if (cachedStore) {
    return cachedStore;
  }
  const gallery = loadGalleryConfig();
  if (gallery?.oss) {
    // ali-oss 在生产构建里按 CJS 解析
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const OSS = require("ali-oss") as new (options: Record<string, unknown>) => OssClient;
    const oss = gallery.oss;
    cachedStore = new OssPoemStore(
      new OSS({
        accessKeyId: oss.accessKeyId,
        accessKeySecret: oss.accessKeySecret,
        bucket: oss.bucket,
        region: oss.region,
        endpoint: oss.endpoint,
        secure: true,
      }),
    );
    return cachedStore;
  }
  cachedStore = new LocalPoemStore();
  return cachedStore;
}

export function emptyPrefs(): UserPrefs {
  return { selectedDlcByWork: {} };
}

export function userEventsKey(username: string) {
  return `${OSS_PREFIX}/${username}/events.json`;
}

export function userPrefsKey(username: string) {
  return `${OSS_PREFIX}/${username}/prefs.json`;
}

export function userSessionKey(username: string, sessionId: string) {
  return `${OSS_PREFIX}/${username}/sessions/${sessionId}.json`;
}

export function likeKey(dlcId: string, username: string) {
  return `${OSS_PREFIX}/likes/${dlcId}/${username}.json`;
}

export function uploadsIndexKey() {
  return `${OSS_PREFIX}/uploads/index.json`;
}

export function ingestPreviewIndexKey() {
  return `${OSS_PREFIX}/ingest-preview/index.json`;
}

export function uploadedCompiledKey(dlcId: string) {
  return `${OSS_PREFIX}/uploads/${dlcId}/compiled.json`;
}

export function rosterKey() {
  return `${OSS_PREFIX}/roster.json`;
}
