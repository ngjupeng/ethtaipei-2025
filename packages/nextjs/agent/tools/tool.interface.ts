export interface ToolParameters {
  [key: string]: string;
}

export interface ToolConfig {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute: (params: any) => Promise<any>;
}

export type ToolRegistry = Map<string, ToolConfig>;

export interface ToolResult {
  status: "success" | "failure";
  data?: any;
  error?: string;
}
