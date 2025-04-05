import { LLMService } from "../llm/llm";
import { ToolConfig } from "../tools/tool.interface";
import { ToolRegistryService } from "../tools/tool.registry";
import { formatToolResponse } from "../utils/formatToolResponse";
import { BaseMessage } from "@langchain/core/messages";

export class SummarizeAgentBrain {
  private toolRegistry: ToolRegistryService;
  private llm: LLMService;

  private agentName: string;
  private personality: string;

  constructor(
    agentName: string,
    personality: string,
    tools: ToolConfig[],
    aiProvider: string,
    anthropicApiKey: string,
    groqApiKey: string,
  ) {
    this.agentName = agentName;
    this.personality = personality;

    this.toolRegistry = new ToolRegistryService();
    this.llm = new LLMService(aiProvider, anthropicApiKey);

    this.toolRegistry.registerTools(tools);
  }

  async execute(results: any, responseFromActionAgent: string | null | undefined) {
    const generatePrompt = await this.generatePrompt(results, responseFromActionAgent);

    const result = await this.llm.invoke(generatePrompt);

    const response = await this.processResponse(result);

    return response;
  }

  async generatePrompt(results: any, responseFromActionAgent: string | null | undefined) {
    const agentName = this.agentName;
    const personality = this.personality;

    const prompt = `
      You are ${agentName} with the following personality:
      ${personality}
  
      I have executed some actions and need to provide a user-friendly summary of the results.
      
      This is the response from the Transaction Constructor Agent:
      ${responseFromActionAgent ? `${responseFromActionAgent}` : ""}
  
      Here are the results of the actions executed:
      ${results
        .map(
          (r: any) => `
      Action: ${r.action}
      Result: 
      ${formatToolResponse(r.result)}
      `,
        )
        .join("\n")}
      Provide a natural, informative summary.
  
      Important:
      - Be direct and concise
      - Don't use analogies or explanations
      - Don't mention internal agents or processes
      - If the Transaction Constructor Agent asked for information, state it directly
      - Do not suggest next steps
      - Focus only on summarizing what has happened
      - For successful actions, state what was done
      - For errors, state what's missing or what went wrong
      - Keep it professional but simple
      - Don't add your own questions
        `;

    return prompt;
  }

  async processResponse(response: BaseMessage) {
    try {
      return this.llm.extractContent(response);
    } catch (error) {
      console.error("Error processing response:", error);
    }
  }
}
