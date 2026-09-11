import { loadGalleryConfig } from "../galleryConfig";
import type { AIProvider } from "./AIProvider";
import { CozeAIProvider } from "./CozeAIProvider";
import { LiveAIProvider } from "./LiveAIProvider";
import { MockAIProvider } from "./MockAIProvider";

function liveFromGallery() {
  return loadGalleryConfig()?.llm ?? null;
}

function requiredApiKey(provider: string): string {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (apiKey) {
    return apiKey;
  }
  const fromGallery = liveFromGallery()?.apiKey;
  if (fromGallery) {
    return fromGallery;
  }
  throw new Error(`AI_PROVIDER=${provider} 需要 AI_API_KEY，或可读的 ai-gallery config.json llm 配置`);
}

export function createAIProvider(customHeaders?: Record<string, string>): AIProvider {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  const provider = explicit || (process.env.NODE_ENV === "production" ? "deepseek" : "");
  if (provider === "mock") {
    return new MockAIProvider();
  }
  if (provider === "openai" || provider === "compatible" || provider === "deepseek") {
    const isDeepseek = provider === "deepseek";
    const gallery = liveFromGallery();
    return new LiveAIProvider({
      baseUrl:
        process.env.AI_BASE_URL?.trim() ||
        gallery?.baseUrl ||
        (isDeepseek ? "https://api.deepseek.com" : "https://api.openai.com/v1"),
      apiKey: requiredApiKey(provider),
      model:
        process.env.AI_MODEL?.trim() ||
        gallery?.model ||
        (isDeepseek ? "deepseek-v4-flash" : "gpt-4o-mini"),
    });
  }
  return new CozeAIProvider(customHeaders);
}
