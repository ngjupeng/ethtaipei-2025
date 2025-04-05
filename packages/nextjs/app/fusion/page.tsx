"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import type { NextPage } from "next";
import { createSmartAccountClient } from "permissionless";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  createPublicClient,
  encodeFunctionData,
  encodePacked,
  erc20Abi,
  formatUnits,
  getContract,
  hexToBigInt,
  maxUint256,
  parseAbi,
  parseErc6492Signature,
} from "viem";
import {
  SmartAccount,
  ToCoinbaseSmartAccountReturnType,
  createWebAuthnCredential,
  entryPoint07Address,
  toCoinbaseSmartAccount,
  toWebAuthnAccount,
} from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { http } from "wagmi";

// Define token interface
interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string;
}

// Define cross-chain quote response interface
interface CrossChainQuoteResponse {
  srcToken: Token;
  dstToken: Token;
  dstAmount: string;
  srcChainId: number;
  dstChainId: number;
  protocols: any[];
  estimatedGas: number;
}

// Define order interface
interface FusionOrder {
  orderHash: string;
  srcChainId: number;
  dstChainId: number;
  srcToken: Token;
  dstToken: Token;
  amount: string;
  dstAmount: string;
  maker: string;
  status: string;
  createdAt: string;
}

const Fusion: NextPage = () => {
  // State for smart account
  const [smartAccount, setSmartAccount] = useState<SmartAccount | null>(null);

  // State for cross-chain swap
  const [sourceChain, setSourceChain] = useState<number>(8453); // Base
  const [destinationChain, setDestinationChain] = useState<number>(1); // Ethereum
  const [sourceToken, setSourceToken] = useState<string>("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"); // USDC on Base
  const [destinationToken, setDestinationToken] = useState<string>("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"); // USDC on Ethereum
  const [amount, setAmount] = useState<string>("10");
  const [quote, setQuote] = useState<CrossChainQuoteResponse | null>(null);
  const [activeOrders, setActiveOrders] = useState<FusionOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [tokens, setTokens] = useState<Record<string, Token>>({});

  // Chain options (hardcoded for now)
  const chainOptions = [
    { id: 1, name: "Ethereum" },
    { id: 8453, name: "Base" },
    { id: 137, name: "Polygon" },
    { id: 42161, name: "Arbitrum" },
    { id: 10, name: "Optimism" },
  ];

  // Fetch tokens on component mount
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const response = await axios.get(`/api/proxy/8453/tokens`);
        setTokens(response.data.tokens);
      } catch (error) {
        console.error("Error fetching tokens:", error);
      }
    };

    fetchTokens();
    fetchActiveOrders();
  }, []);

  // Create smart account
  const handleCreateSmartAccount = async () => {
    try {
      setLoading(true);
      const client = createPublicClient({
        chain: baseSepolia,
        transport: http(),
      });

      // Register a credential (ie. passkey)
      const credential = await createWebAuthnCredential({ name: "Fusion Wallet" });

      // Create a WebAuthn owner account from the credential
      const owner = toWebAuthnAccount({ credential });

      const account = await toCoinbaseSmartAccount({
        client,
        owners: [owner],
      });

      console.log("Smart account created:", account);
      setSmartAccount(account);
    } catch (error) {
      console.error("Error creating smart account:", error);
    } finally {
      setLoading(false);
    }
  };

  // Get cross-chain quote
  const getQuote = async () => {
    if (!sourceToken || !destinationToken || !amount) return;

    setLoading(true);
    try {
      // Mock API call for now - in production, you would call the 1inch Fusion+ API
      // const response = await axios.get(`/api/fusion/quote`, {
      //   params: {
      //     srcChainId: sourceChain,
      //     dstChainId: destinationChain,
      //     srcTokenAddress: sourceToken,
      //     dstTokenAddress: destinationToken,
      //     amount: (parseFloat(amount) * 10 ** 6).toString(), // Assuming USDC with 6 decimals
      //   },
      // });

      // Mock response for demo
      const mockQuote: CrossChainQuoteResponse = {
        srcToken: {
          address: sourceToken,
          symbol: "USDC",
          name: "USD Coin",
          decimals: 6,
          logoURI: "https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png",
        },
        dstToken: {
          address: destinationToken,
          symbol: "USDC",
          name: "USD Coin",
          decimals: 6,
          logoURI: "https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png",
        },
        dstAmount: (parseFloat(amount) * 0.995 * 10 ** 6).toString(), // 0.5% fee
        srcChainId: sourceChain,
        dstChainId: destinationChain,
        protocols: [],
        estimatedGas: 250000,
      };

      setQuote(mockQuote);
      console.log("Quote:", mockQuote);
    } catch (error) {
      console.error("Error getting quote:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch active orders
  const fetchActiveOrders = async () => {
    try {
      // Mock API call for now - in production, you would call the 1inch Fusion+ API
      // const response = await axios.get(`/api/fusion/active-orders`);

      // Mock response for demo
      const mockOrders: FusionOrder[] = [
        {
          orderHash: "0x123456789abcdef",
          srcChainId: 8453,
          dstChainId: 1,
          srcToken: {
            address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            symbol: "USDC",
            name: "USD Coin",
            decimals: 6,
            logoURI: "https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png",
          },
          dstToken: {
            address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            symbol: "USDC",
            name: "USD Coin",
            decimals: 6,
            logoURI: "https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png",
          },
          amount: "10000000", // 10 USDC
          dstAmount: "9950000", // 9.95 USDC
          maker: "0x1234567890abcdef1234567890abcdef12345678",
          status: "PENDING",
          createdAt: new Date().toISOString(),
        },
        {
          orderHash: "0xabcdef123456789",
          srcChainId: 1,
          dstChainId: 137,
          srcToken: {
            address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            symbol: "USDC",
            name: "USD Coin",
            decimals: 6,
            logoURI: "https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png",
          },
          dstToken: {
            address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
            symbol: "USDC",
            name: "USD Coin",
            decimals: 6,
            logoURI: "https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png",
          },
          amount: "50000000", // 50 USDC
          dstAmount: "49750000", // 49.75 USDC
          maker: "0xabcdef1234567890abcdef1234567890abcdef12",
          status: "FILLED",
          createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        },
      ];

      setActiveOrders(mockOrders);
    } catch (error) {
      console.error("Error fetching active orders:", error);
    }
  };

  // Place order
  const placeOrder = async () => {
    if (!smartAccount || !quote) return;

    setLoading(true);
    try {
      // In a real implementation, you would:
      // 1. Generate random secrets for the order
      // 2. Create a hash lock
      // 3. Sign the order with the smart account
      // 4. Submit the order to the 1inch Fusion+ API

      console.log("Placing order with smart account:", smartAccount.address);

      // Mock successful order placement
      alert("Order placed successfully! Check the active orders section.");

      // Add the new order to the active orders list
      const newOrder: FusionOrder = {
        orderHash: "0x" + Math.random().toString(16).substring(2, 18),
        srcChainId: sourceChain,
        dstChainId: destinationChain,
        srcToken: quote.srcToken,
        dstToken: quote.dstToken,
        amount: (parseFloat(amount) * 10 ** 6).toString(),
        dstAmount: quote.dstAmount,
        maker: smartAccount.address,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      };

      setActiveOrders([newOrder, ...activeOrders]);
    } catch (error) {
      console.error("Error placing order:", error);
    } finally {
      setLoading(false);
    }
  };

  // Format token amount for display
  const formatTokenAmount = (amount: string, decimals: number) => {
    return (BigInt(amount) / BigInt(10 ** decimals)).toString();
  };

  // Get chain name by ID
  const getChainName = (chainId: number) => {
    return chainOptions.find(chain => chain.id === chainId)?.name || `Chain ${chainId}`;
  };

  return (
    <div style={{ marginTop: 60, maxWidth: "800px", margin: "0 auto", padding: "20px" }}>
      <h1 className="text-2xl font-bold mb-6">1inch Fusion+ Cross-Chain Swaps</h1>

      {/* Account Management */}
      <div className="mb-8 p-4 border rounded">
        <h2 className="text-xl font-bold mb-4">Account Management</h2>

        {!smartAccount ? (
          <button className="p-3 bg-blue-500 text-white rounded" onClick={handleCreateSmartAccount} disabled={loading}>
            {loading ? "Creating Account..." : "Create Smart Account"}
          </button>
        ) : (
          <div>
            <p className="mb-2">
              <strong>Smart Account Address:</strong>
            </p>
            <p className="font-mono bg-gray-100 p-2 rounded">{smartAccount.address}</p>
          </div>
        )}
      </div>

      {/* Cross-Chain Swap Form */}
      <div className="mb-8 p-4 border rounded">
        <h2 className="text-xl font-bold mb-4">Create Cross-Chain Swap</h2>

        {/* Chain Selection */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block mb-2">From Chain</label>
            <select
              className="w-full p-2 border rounded"
              value={sourceChain}
              onChange={e => setSourceChain(Number(e.target.value))}
            >
              {chainOptions.map(chain => (
                <option key={`src-${chain.id}`} value={chain.id}>
                  {chain.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block mb-2">To Chain</label>
            <select
              className="w-full p-2 border rounded"
              value={destinationChain}
              onChange={e => setDestinationChain(Number(e.target.value))}
            >
              {chainOptions.map(chain => (
                <option key={`dst-${chain.id}`} value={chain.id}>
                  {chain.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Token Selection (hardcoded for now) */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block mb-2">From Token</label>
            <select
              className="w-full p-2 border rounded"
              value={sourceToken}
              disabled={true} // Hardcoded for now
            >
              <option value="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913">USDC</option>
            </select>
          </div>

          <div>
            <label className="block mb-2">To Token</label>
            <select
              className="w-full p-2 border rounded"
              value={destinationToken}
              disabled={true} // Hardcoded for now
            >
              <option value="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48">USDC</option>
            </select>
          </div>
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <label className="block mb-2">Amount</label>
          <input
            type="text"
            className="w-full p-2 border rounded"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="Enter amount"
          />
        </div>

        {/* Get Quote Button */}
        <button
          className="bg-blue-500 text-white p-2 rounded mb-4 w-full"
          onClick={getQuote}
          disabled={loading || !sourceToken || !destinationToken || !amount || !smartAccount}
        >
          {loading ? "Loading..." : "Get Quote"}
        </button>

        {/* Quote Display */}
        {quote && (
          <div className="bg-gray-100 p-4 rounded mb-4">
            <h3 className="font-bold mb-2">Quote</h3>
            <p className="mb-2">
              {amount} {quote.srcToken.symbol} on {getChainName(quote.srcChainId)} ≈{" "}
              {formatTokenAmount(quote.dstAmount, quote.dstToken.decimals)} {quote.dstToken.symbol} on{" "}
              {getChainName(quote.dstChainId)}
            </p>
            <p className="text-sm text-gray-600">Estimated Gas: {quote.estimatedGas}</p>

            {/* Place Order Button */}
            <button
              className="bg-green-500 text-white p-2 rounded mt-3 w-full"
              onClick={placeOrder}
              disabled={loading || !smartAccount}
            >
              {loading ? "Processing..." : "Place Order"}
            </button>
          </div>
        )}
      </div>

      {/* Active Orders */}
      <div className="p-4 border rounded">
        <h2 className="text-xl font-bold mb-4">Active Orders</h2>

        {activeOrders.length === 0 ? (
          <p>No active orders found.</p>
        ) : (
          <div className="space-y-4">
            {activeOrders.map(order => (
              <div key={order.orderHash} className="p-3 border rounded">
                <div className="flex justify-between mb-2">
                  <span className="font-bold">Order: {order.orderHash.substring(0, 10)}...</span>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      order.status === "PENDING"
                        ? "bg-yellow-200"
                        : order.status === "FILLED"
                          ? "bg-green-200"
                          : "bg-gray-200"
                    }`}
                  >
                    {order.status}
                  </span>
                </div>

                <p>
                  {formatTokenAmount(order.amount, order.srcToken.decimals)} {order.srcToken.symbol} on{" "}
                  {getChainName(order.srcChainId)} → {formatTokenAmount(order.dstAmount, order.dstToken.decimals)}{" "}
                  {order.dstToken.symbol} on {getChainName(order.dstChainId)}
                </p>

                <p className="text-xs text-gray-600 mt-2">Created: {new Date(order.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Fusion;
