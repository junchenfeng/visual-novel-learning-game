import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

export type PoemStore = {
  readJson<T>(key: string): Promise<T | null>;
  writeJson(key: string, value: unknown): Promise<void>;
  getObject(key: string): Promise<Buffer | null>;
  putObject(key: string, body: Buffer, options?: PutObjectOptions): Promise<void>;
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
}

type OssClient = {
  get: (key: string) => Promise<{ content: Buffer | string }>;
  put: (
    key: string,
    data: Buffer | string,
    options?: { mime?: string; headers?: Record<string, string> },
  ) => Promise<unknown>;
};

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
