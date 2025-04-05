import { NextRequest, NextResponse } from "next/server";
import { ActionAgentBrain } from "../../../agent/agents/actions.agent";
import { createContextFromJson } from "../../../agent/agents/jsonConfig";
import { SummarizeAgentBrain } from "../../../agent/agents/summarize.agent";
import constructorAgentConfig from "../../../agent/config/agents/constructor.agent.json";
import summarizeAgentConfig from "../../../agent/config/agents/summarize.agent.json";
import { createSwapTool } from "../../../agent/tools/1inch";
import { ConversationHistory } from "../../../agent/types/chat";

// Initialize agents
let actionAgent: ActionAgentBrain | null = null;

const initializeAgent = async () => {
  if (!actionAgent) {
    try {
      const actionAgentPersonality = createContextFromJson(constructorAgentConfig);
      const summarizeAgentPersonality = createContextFromJson(summarizeAgentConfig);

      const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
      // Create the summarize agent
      const summarizeAgent = new SummarizeAgentBrain(
        "1inch AI Assistant",
        summarizeAgentPersonality,
        [],
        "anthropic",
        anthropicApiKey || "",
        "",
      );

      // Create the action agent
      actionAgent = new ActionAgentBrain(
        "1inch Transaction Constructor Agent",
        actionAgentPersonality,
        [createSwapTool()],
        summarizeAgent,
        "anthropic",
        anthropicApiKey || "",
      );
    } catch (error) {
      console.error("Error initializing agent:", error);
      throw error;
    }
  }

  return actionAgent;
};

export async function POST(req: NextRequest) {
  try {
    const { message, conversationHistory } = await req.json();

    // Initialize agent if not already done
    const agent = await initializeAgent();

    // Execute the agent
    const result = await agent.execute(message, conversationHistory);

    return NextResponse.json({ result });
  } catch (error) {
    console.error("Error processing agent request:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
