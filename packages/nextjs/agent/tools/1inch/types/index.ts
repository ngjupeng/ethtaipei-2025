/**
 * Parameters for executing a token swap
 * @property {string} sellTokenSymbol - Symbol of the token to sell
 * @property {string} buyTokenSymbol - Symbol of the token to buy
 * @property {number} sellAmount - Amount of tokens to sell
 */
export interface SwapPayloads {
  sellTokenSymbol: string;
  buyTokenSymbol: string;
  sellAmount: number;
  takerAddress: string;
}
