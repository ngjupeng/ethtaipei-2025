import { ToolExecutionResult } from "../common";
import { LLMService } from "../llm/llm";
import { ToolConfig } from "../tools/tool.interface";
import { ToolRegistryService } from "../tools/tool.registry";
import { ConversationHistory } from "../types/chat";
import { SummarizeAgentBrain } from "./summarize.agent";
import { BaseMessage } from "@langchain/core/messages";

export class ActionAgentBrain {
  private toolRegistry: ToolRegistryService;
  private llm: LLMService;
  private summarizeAgent: SummarizeAgentBrain;

  private agentName: string;
  private personality: string;

  constructor(
    agentName: string,
    personality: string,
    tools: ToolConfig[],
    summarizeAgent: SummarizeAgentBrain,
    aiProvider: string,
    anthropicApiKey: string,
  ) {
    this.agentName = agentName;
    this.personality = personality;
    this.summarizeAgent = summarizeAgent;

    this.toolRegistry = new ToolRegistryService();
    this.llm = new LLMService(aiProvider, anthropicApiKey);
    this.toolRegistry.registerTools(tools);
  }

  async execute(prompt: string, conversationHistory: ConversationHistory[]) {
    const generatePrompt = await this.generatePrompt(
      {
        chatHistory: conversationHistory,
      },
      this.toolRegistry.getRegisteredTools(),
      prompt,
    );

    const result = await this.llm.invoke(generatePrompt);

    const response = await this.processResponse(result);

    return response;
  }

  async generatePrompt(
    context: {
      chatHistory: ConversationHistory[];
    },
    tools: ToolConfig[],
    userPrompt: string,
  ) {
    // Build the tool descriptions with exact parameter specifications
    const toolDescriptions = tools
      .map(tool => {
        let description = `${tool.name}: ${tool.description}\n`;
        try {
          const params = tool.parameters;
          description += "Parameters:\n";
          for (const [param, desc] of Object.entries(params)) {
            description += `  - ${param}: ${desc}\n`;
          }
        } catch (_e) {
          description += "Parameters: None\n";
        }
        return description;
      })
      .join("\n");

    // Format the context with clear sections
    const formattedContext = `
    Chat History:
    ${
      context.chatHistory.length > 0
        ? context.chatHistory
            .map((msg, index) => {
              return `${index + 1}. ${msg.sender}: ${msg.content}`;
            })
            .join("\n")
        : "No previous conversation"
    }
    `;

    // Get the agent's name
    const agentName = this.agentName;
    const personality = this.personality;

    // Construct the prompt with enhanced tool descriptions
    const prompt = `
    You are: ${agentName}.
    
    Your personality:
    ${personality}

    User's question/request:
    ${userPrompt}

    Here is your current context:
    ${formattedContext}
    
    Here are the tools available to you. You MUST use the exact tool names and parameter formats:
    ${toolDescriptions}
    
    Compose your next action(s). You can specify multiple actions to be executed in sequence.
    For each action, structure your response like this:
    
    ACTION 1:
    ACTION: The exact name of the tool you want to use.
    PARAMETERS: A JSON object containing the exact parameters for the tool.
    REASON: Explain why you are using this tool.

    ACTION 2:
    ACTION: ...
    PARAMETERS: ...
    REASON: ...

    IMPORTANT: 
    - You can ONLY use the tools listed above
    - You MUST follow the exact format provided
    - For general questions where no tool is needed, use ACTION: NONE and provide your answer in the REASON section
    - You MUST list ALL actions explicitly. DO NOT use placeholders like "[Actions 3-10 continue...]" or skip any actions.
    - If there are many similar actions (e.g., multiple transfers), you must still list each one individually with its complete ACTION, PARAMETERS, and REASON.
    - For actions related to tokens, if you can't find the token symbol from user prompt and chat histotry, don't infer it. Ask the user for the token symbol.
    `;

    return prompt;
  }

  async processResponse(response: BaseMessage) {
    const responseString = this.llm.extractContent(response);
    const resultsForAgent: ToolExecutionResult[] = [];
    const resultsForUser: ToolExecutionResult[] = [];

    try {
      const res = await this.parseAction(responseString);

      // execute actions
      for (const action of res?.actions || []) {
        // if action == none, skip
        if (action.ACTION == "NONE") {
          resultsForAgent.push({
            action: action.ACTION,
            result: action.REASON,
          });
          continue;
        }
        const res = await this.toolRegistry.executeTool(action.ACTION, action.PARAMETERS);

        resultsForAgent.push({
          action: action.ACTION,
          result: res.dataForAgent,
        });

        // check if data for user is not null
        if (res.dataForUser) {
          resultsForUser.push({
            action: action.ACTION,
            result: res.dataForUser,
          });
        }
      }

      const summarizedActions = (await this.summarizeAgent.execute(resultsForAgent, responseString)) || "";

      return {
        summarizedActions,
        resultsForUser,
      };
    } catch (error) {
      console.error("Error processing response:", error);
    }
  }

  parseAction(response: string): {
    actions: { ACTION: string; PARAMETERS: any; REASON: string | null }[];
    responseToUser: string | null | undefined;
  } | null {
    let responseToUser;
    try {
      // Clean the response string
      const cleanedResponse = response
        .replace(/['']/g, "'") // Replace smart quotes
        .replace(/[""]/g, '"') // Replace smart double quotes
        .replace(/–/g, "-") // Replace en dash with regular dash
        .trim();

      console.log("cleanedResponse", cleanedResponse, response);

      const actions = [];

      // First try to split by numbered actions
      let actionBlocks = cleanedResponse.split(/ACTION \d+:/g).filter((block: string) => block.trim());

      // If no numbered blocks found, treat the entire response as one action block
      if (actionBlocks.length === 0) {
        actionBlocks = [cleanedResponse];
      }

      for (const block of actionBlocks) {
        const actionRegex = /ACTION:\s*([a-zA-Z0-9_]+)/;
        const parametersRegex = /PARAMETERS:\s*({[\s\S]*?})/m;
        const reasonRegex = /REASON:\s*([\s\S]*?)(?=$|ACTION\s*\d*:)/;

        const actionMatch = block.match(actionRegex);
        const parametersMatch = block.match(parametersRegex);
        const reasonMatch = block.match(reasonRegex);

        if (actionMatch) {
          const actionName = actionMatch[1].trim();
          if (actionName == "SUMMARIZE") {
            responseToUser = reasonMatch ? reasonMatch[1].trim() : null;
          } else {
            const action = {
              ACTION: actionMatch[1].trim(),
              PARAMETERS: parametersMatch ? JSON.parse(parametersMatch[1]) : {},
              REASON: reasonMatch ? reasonMatch[1].trim() : null,
            };
            actions.push(action);
          }
        }
      }

      return {
        actions,
        responseToUser,
      };
    } catch (error) {
      console.error("Error parsing action:", error);
      return null;
    }
  }
}
