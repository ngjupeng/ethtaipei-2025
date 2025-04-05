export interface ToolResponse {
  status: string;
  dataForAgent: Record<string, any>;
  dataForUser: Record<string, any> | null;
}

export interface ToolExecutionResult {
  result: Record<string, any> | string | null;
  action: string;
}
