import { swapTokens } from "./actions/swap";

export const createSwapTool = () => {
  return {
    name: "swap",
    description: "Swap ERC20 tokens",
    parameters: {
      sellTokenSymbol: "string - The symbol of the token to sell",
      buyTokenSymbol: "string - The symbol of the token to buy",
      sellAmount: "string - The amount of tokens to sell",
      takerAddress: "string - The address of the taker",
    },
    execute: swapTokens,
  };
};
