import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type GalleryOssConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  endpoint?: string;
};

export type GalleryLlmConfig = {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type GalleryConfig = {
  path: string;
  oss: GalleryOssConfig | null;
  llm: GalleryLlmConfig | null;
};

/**
 * 显式设了 `AI_GALLERY_CONFIG` 就以它为准：设了但文件不存在 = 明确要「没有配置」。
 *
 * 这条「显式即权威」很关键：否则一个写错的路径会**静默回落到**其它候选
 * （本机 `../ai-gallery/config.json` 往往真实存在），于是测试或本地脚本在毫不知情的情况下
 * 连上生产 OSS —— 2026-09-18 就是这样把线上诗人头像与名册写坏的。测试环境用
 * tests/setup-env.ts 把它指向不存在的路径来强制降级到本地 store。
 */
function firstExistingPath(): string | null {
  const fromEnv = process.env.AI_GALLERY_CONFIG?.trim();
  if (fromEnv) {
    return existsSync(fromEnv) ? fromEnv : null;
  }
  const fallbacks = [
    "/root/ai-gallery/config.json",
    path.resolve(process.cwd(), "../ai-gallery/config.json"),
  ];
  for (const candidate of fallbacks) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readOss(raw: Record<string, unknown>): GalleryOssConfig | null {
  const oss = asRecord(raw.oss);
  if (!oss) {
    return null;
  }
  const accessKeyId = String(oss.accessKeyId ?? "").trim();
  const accessKeySecret = String(oss.accessKeySecret ?? "").trim();
  const bucket = String(oss.bucket ?? "").trim();
  const region = String(oss.region ?? "").trim();
  if (!accessKeyId || !accessKeySecret || !bucket || !region) {
    return null;
  }
  const endpoint = String(oss.endpoint ?? "").trim();
  return {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
    endpoint: endpoint || undefined,
  };
}

function normalizeLlmEntry(entry: unknown): GalleryLlmConfig | null {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }
  const apiKey = String(record["api-key"] ?? record.apiKey ?? record.api_key ?? "").trim();
  if (!apiKey) {
    return null;
  }
  return {
    name: String(record.name ?? record.provider ?? "deepseek").trim().toLowerCase() || "deepseek",
    apiKey,
    baseUrl: String(record.baseUrl ?? record.base_url ?? "https://api.deepseek.com").replace(/\/+$/, ""),
    model: String(record.model ?? "deepseek-v4-flash").trim() || "deepseek-v4-flash",
  };
}

function readLlm(raw: Record<string, unknown>, provider = "deepseek"): GalleryLlmConfig | null {
  const llmRaw = raw.llm;
  const entries: GalleryLlmConfig[] = [];
  if (Array.isArray(llmRaw)) {
    for (const item of llmRaw) {
      const normalized = normalizeLlmEntry(item);
      if (normalized) {
        entries.push(normalized);
      }
    }
  } else {
    const record = asRecord(llmRaw);
    if (record) {
      const direct = normalizeLlmEntry(record);
      if (direct) {
        entries.push(direct);
      } else {
        for (const value of Object.values(record)) {
          const normalized = normalizeLlmEntry(value);
          if (normalized) {
            entries.push(normalized);
          }
        }
      }
    }
  }
  if (entries.length === 0) {
    return null;
  }
  return entries.find((item) => item.name === provider) ?? entries[0] ?? null;
}

export function loadGalleryConfig(): GalleryConfig | null {
  const configPath = firstExistingPath();
  if (!configPath) {
    return null;
  }
  const raw = asRecord(JSON.parse(readFileSync(/* turbopackIgnore: true */ configPath, "utf8")));
  if (!raw) {
    return null;
  }
  return {
    path: configPath,
    oss: readOss(raw),
    llm: readLlm(raw),
  };
}
