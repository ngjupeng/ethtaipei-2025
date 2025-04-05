// ... existing code ...
import { ToolResponse } from "../../../common";
import { createErrorResponse } from "../../../common/error";
import { formatTokenAmount } from "../../../web3/formatAmount";
import { SLIPPAGE_PERCENTAGE } from "../constants";
import { SwapPayloads } from "../types";
import { TokenService } from "./fetchTokens";
import { formatUnits } from "ethers";

// Define interfaces for 1inch API responses
interface ApproveResponse {
  data: string;
  gasPrice: string;
  to: string;
  value: string;
}

interface SwapResponse {
  srcToken: TokenInfo;
  dstToken: TokenInfo;
  dstAmount: string;
  protocols?: any[][];
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gasPrice: string;
    gas: number;
  };
}

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string;
}

/**
 * Service handling token swap operations using 1inch API
 * @class SwapService
 */
export class SwapService {
  private walletAddress: string;
  private tokenService: TokenService;
  private chainId: number = 8453; // Default to Base chain
  private apiKey: string = "pIEkOQOA0KzMSEKjD7LtdNxKgVDa0BJH"; // Your 1inch API key

  /**
   * Creates an instance of SwapService
   * @param {string} walletAddress - The wallet address executing the swaps
   */
  constructor(walletAddress: string) {
    this.walletAddress = walletAddress;
    this.tokenService = new TokenService();
  }

  /**
   * Initializes the token service
   * @returns {Promise<void>}
   */
  async initialize(chainId: number = 8453): Promise<void> {
    this.chainId = chainId;
    await this.tokenService.initializeTokens(chainId);
  }

  /**
   * Safely stringifies objects containing BigInt values
   * @private
   * @param {unknown} obj - Object to stringify
   * @returns {string} JSON string with BigInt values converted to strings
   */
  private safeStringify(obj: unknown): string {
    return JSON.stringify(obj, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2);
  }

  /**
   * Gets approval transaction data for token spending
   * @private
   * @param {string} tokenAddress - Address of the token to approve
   * @returns {Promise<ApproveResponse>} Approval transaction data
   */
  private async getApprovalTransaction(tokenAddress: string): Promise<ApproveResponse> {
    const approveUrl = new URL(`https://api.1inch.dev/swap/v6.0/${this.chainId}/approve/transaction`);
    approveUrl.searchParams.append("tokenAddress", tokenAddress);
    // No amount parameter for infinite approval

    const approveResponse = await fetch(approveUrl.toString(), {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!approveResponse.ok) {
      throw new Error(`Approve API responded with status: ${approveResponse.status}`);
    }

    return await approveResponse.json();
  }

  /**
   * Builds a token swap transaction
   * @param {SwapParams} params - The swap parameters
   */
  async buildSwapTransaction(params: SwapPayloads): Promise<ToolResponse> {
    try {
      await this.initialize(this.chainId);

      // get token symbol from token service by address
      const sellTokenSymbol = this.tokenService.getToken(params.sellTokenSymbol)?.symbol;
      const buyTokenSymbol = this.tokenService.getToken(params.buyTokenSymbol)?.symbol;
      if (!sellTokenSymbol || !buyTokenSymbol) {
        throw new Error("Invalid token address");
      }

      const { sellToken, buyToken } = this.tokenService.validateTokenPair(sellTokenSymbol, buyTokenSymbol);

      const formattedAmount = formatTokenAmount(params.sellAmount.toString(), sellToken.decimals);

      // 1. Get approval transaction data
      const approveData = await this.getApprovalTransaction(sellToken.address);

      // 2. Get swap transaction data
      const swapUrl = new URL(`https://api.1inch.dev/swap/v6.0/${this.chainId}/swap`);
      swapUrl.searchParams.append("src", sellToken.address);
      swapUrl.searchParams.append("dst", buyToken.address);
      swapUrl.searchParams.append("amount", formattedAmount);
      swapUrl.searchParams.append("from", this.walletAddress);
      swapUrl.searchParams.append("slippage", String(SLIPPAGE_PERCENTAGE));
      swapUrl.searchParams.append("includeTokensInfo", "true");
      swapUrl.searchParams.append("origin", this.walletAddress);
      swapUrl.searchParams.append("disableEstimate", "true"); // Disable onchain simulation for smart accounts

      const swapResponse = await fetch(swapUrl.toString(), {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!swapResponse.ok) {
        throw new Error(`Swap API responded with status: ${swapResponse.status}`);
      }

      const swapData: SwapResponse = await swapResponse.json();

      // Prepare transaction call data - include both approve and swap
      const calls = [
        {
          to: approveData.to as `0x${string}`,
          data: approveData.data as `0x${string}`,
          value: "0",
        },
        {
          to: swapData.tx.to as `0x${string}`,
          data: swapData.tx.data as `0x${string}`,
          value: BigInt(swapData.tx.value || "0").toString(),
        },
      ];

      return {
        status: "success",
        dataForAgent: {
          message: `Successfully constructed swap transaction for ${params.sellAmount} ${sellTokenSymbol} for ${buyTokenSymbol}`,
          sellAmount: params.sellAmount,
          sellToken: sellTokenSymbol,
          buyToken: buyTokenSymbol,
          buyAmount: formatUnits(swapData.dstAmount, Number(buyToken.decimals)),
        },
        dataForUser: {
          calls,
          metadata: {
            sellAmount: params.sellAmount,
            sellToken: sellTokenSymbol,
            buyToken: buyTokenSymbol,
            buyAmount: formatUnits(swapData.dstAmount, Number(buyToken.decimals)),
            buyAmountWithDecimals: swapData.dstAmount,
            fromToken: sellToken,
            toToken: buyToken,
            beneficiary: this.walletAddress,
          },
        },
      };
    } catch (error) {
      console.error("Detailed swap error:", error);
      if (error instanceof Error) {
        console.error("Error type:", error.constructor.name);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      return createErrorResponse(error, "swap execution");
    }
  }
}
export const createSwapService = (walletAddress?: string): SwapService => {
  if (!walletAddress) {
    throw new Error("Wallet address not configured");
  }

  return new SwapService(walletAddress);
};

export const swapTokens = async (params: SwapPayloads) => {
  try {
    const swapService = createSwapService(params.takerAddress);
    const result = await swapService.buildSwapTransaction(params);
    return result;
  } catch (error) {
    console.error("Detailed swap error:", error);
    if (error instanceof Error) {
      console.error("Error type:", error.constructor.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    return createErrorResponse(error, "swap execution");
  }
};
