import { ChatAnthropic } from "@langchain/anthropic";

export function getLLM(name: string, anthropicApiKey: string) {
  if (!anthropicApiKey) {
    return;
  }

  switch (String(name).toLowerCase()) {
    case "anthropic":
      return new ChatAnthropic({
        modelName: "claude-3-5-sonnet-20241022",
        anthropicApiKey: anthropicApiKey,
      });
    default:
      throw new Error(`Unsupported AI provider`);
  }
}
