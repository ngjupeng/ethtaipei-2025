import { ToolResponse } from "../common";
import { ToolConfig, ToolRegistry } from "./tool.interface";

export class ToolRegistryService {
  private registry: ToolRegistry = new Map();

  constructor() {}

  async registerTools(tools: Array<ToolConfig>) {
    tools.forEach(tool => {
      this.registerTool(tool);
    });
  }

  async registerTool(tool: ToolConfig) {
    this.registry.set(tool.name, tool);
  }

  getRegisteredTool(name: string): ToolConfig | undefined {
    return this.registry.get(name);
  }

  getRegisteredTools(): ToolConfig[] {
    return Array.from(this.registry.values());
  }

  async executeTool(toolName: string, parameters: any): Promise<ToolResponse> {
    const tool = this.getRegisteredTool(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    if (typeof tool.execute === "function") {
      return await tool.execute(parameters);
    } else {
      throw new Error(`Tool ${toolName} does not have an execute method`);
    }
  }
}
