import { getLLM } from "./model";
import { ChatAnthropic } from "@langchain/anthropic";
import { BaseMessage } from "@langchain/core/messages";

export class LLMService {
  private model: ChatAnthropic;

  constructor(aiProvider: string, anthropicApiKey: string) {
    this.model = getLLM(aiProvider, anthropicApiKey)!;
  }

  async invoke(prompt: string): Promise<BaseMessage> {
    return await this.model.invoke(prompt);
  }

  extractContent(message: BaseMessage): string {
    if (typeof message.content === "string") {
      return message.content;
    }
    if (Array.isArray(message.content)) {
      return message.content
        .map(item => {
          if (typeof item === "string") return item;
          if ("text" in item) return item.text;
          return "";
        })
        .join("");
    }
    return "";
  }
}
