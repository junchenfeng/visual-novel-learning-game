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
  cdnBaseUrl: string;
};

function candidatePaths(): string[] {
  const fromEnv = process.env.AI_GALLERY_CONFIG?.trim();
  return [
    fromEnv,
    "/root/ai-gallery/config.json",
    path.resolve(process.cwd(), "../ai-gallery/config.json"),
  ].filter((item): item is string => Boolean(item));
}

function firstExistingPath(): string | null {
  for (const candidate of candidatePaths()) {
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
  const raw = asRecord(JSON.parse(readFileSync(configPath, "utf8")));
  if (!raw) {
    return null;
  }
  const cdn = asRecord(raw.cdn);
  return {
    path: configPath,
    oss: readOss(raw),
    llm: readLlm(raw),
    cdnBaseUrl: String(cdn?.baseUrl ?? "").replace(/\/+$/, ""),
  };
}
