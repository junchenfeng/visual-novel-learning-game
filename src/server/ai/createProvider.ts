import type { AIProvider } from "./AIProvider";
import { CozeAIProvider } from "./CozeAIProvider";
import { LiveAIProvider } from "./LiveAIProvider";
import { MockAIProvider } from "./MockAIProvider";

function requiredApiKey(provider: string): string {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(`AI_PROVIDER=${provider} 需要在 .env.local 中设置 AI_API_KEY`);
  }
  return apiKey;
}

export function createAIProvider(customHeaders?: Record<string, string>): AIProvider {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (provider === "mock") {
    return new MockAIProvider();
  }
  if (provider === "openai" || provider === "compatible" || provider === "deepseek") {
    const isDeepseek = provider === "deepseek";
    return new LiveAIProvider({
      baseUrl:
        process.env.AI_BASE_URL?.trim() ||
        (isDeepseek ? "https://api.deepseek.com" : "https://api.openai.com/v1"),
      apiKey: requiredApiKey(provider),
      model:
        process.env.AI_MODEL?.trim() ||
        (isDeepseek ? "deepseek-v4-flash" : "gpt-4o-mini"),
    });
  }
  return new CozeAIProvider(customHeaders);
}
