import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadGalleryConfig } from "./galleryConfig";

const OSS_PREFIX = "poem-rpg";
const LOCAL_ROOT = path.join(process.cwd(), "assets", "poem-rpg");

export type UserPrefs = {
  selectedDlcByWork: Record<string, string>;
};

export type PoemStore = {
  readJson<T>(key: string): Promise<T | null>;
  writeJson(key: string, value: unknown): Promise<void>;
};

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

  async readJson<T>(key: string): Promise<T | null> {
    const filePath = this.filePath(key);
    if (!existsSync(filePath)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(filePath, "utf8")) as T;
    } catch {
      return null;
    }
  }

  async writeJson(key: string, value: unknown): Promise<void> {
    const filePath = this.filePath(key);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
  }
}

class OssPoemStore implements PoemStore {
  constructor(private readonly client: { get: (key: string) => Promise<{ content: Buffer | string }>; put: (key: string, data: Buffer | string) => Promise<unknown> }) {}

  async readJson<T>(key: string): Promise<T | null> {
    try {
      const result = await this.client.get(key);
      const body = typeof result.content === "string" ? result.content : result.content.toString("utf8");
      return JSON.parse(body) as T;
    } catch (error) {
      if (isNoSuchKey(error)) {
        return null;
      }
      throw error;
    }
  }

  async writeJson(key: string, value: unknown): Promise<void> {
    await this.client.put(key, Buffer.from(`${JSON.stringify(value)}\n`, "utf8"));
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
    const OSS = require("ali-oss") as new (options: Record<string, unknown>) => {
      get: (key: string) => Promise<{ content: Buffer | string }>;
      put: (key: string, data: Buffer | string) => Promise<unknown>;
    };
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
