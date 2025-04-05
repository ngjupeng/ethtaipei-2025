import { ToolResponse } from '.';

export const createErrorResponse = (
  error: unknown,
  step: string,
): ToolResponse => {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  return {
    status: 'failure',
    dataForAgent: {
      error: errorMessage,
      step,
    },
    dataForUser: null,
  };
};
