"use client";

import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { createSmartAccountClient } from "permissionless";
import { ToEcdsaKernelSmartAccountReturnType, toEcdsaKernelSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  createPublicClient,
  encodeFunctionData,
  encodePacked,
  erc20Abi,
  getContract,
  hexToBigInt,
  http,
  maxUint256,
  parseAbi,
  parseErc6492Signature,
} from "viem";
import { SmartAccount, createBundlerClient, entryPoint07Address } from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
import { generatePrivateKey } from "viem/accounts";
import { base } from "viem/chains";
import { ChatMessageSender, ConversationHistory } from "~~/agent/types/chat";

// Message type definition
interface Message {
  id: string;
  content: string;
  sender: "user" | "ai";
  timestamp: Date;
}

// User type definition
interface User {
  id: string;
  username: string;
}

// Token type definition
interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string;
}

// Transaction type definition
interface Transaction {
  id: string;
  type: string;
  amount: string;
  token: string;
  timestamp: Date;
  status: "completed" | "pending" | "failed";
}

const Chat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [smartAccount, setSmartAccount] = useState<SmartAccount | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "swap">("chat");
  const [accountBalance, setAccountBalance] = useState<string>("0.0");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [privateKey, setPrivateKey] = useState<`0x${string}` | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string>("0.0");
  const [currentBlockNumber, setCurrentBlockNumber] = useState<string | null>(null);

  // Swap state
  const [tokens, setTokens] = useState<Record<string, Token>>({});
  const [sourceToken, setSourceToken] = useState<string>("");
  const [destinationToken, setDestinationToken] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [quote, setQuote] = useState<any | null>(null);
  const [swapLoading, setSwapLoading] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [transactionStatus, setTransactionStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [transactionError, setTransactionError] = useState<string | null>(null);

  const [conversationHistory, setConversationHistory] = useState<ConversationHistory[]>([]);
  const [transactionData, setTransactionData] = useState<any>(null);

  const [accountTokenCount, setAccountTokenCount] = useState<number>(0);
  const [accountNftCount, setAccountNftCount] = useState<number>(0);

  useEffect(() => {
    // Fetch current block number
    const fetchBlockNumber = async () => {
      try {
        const response = await axios.post(
          "https://base-mainnet.nodit.io/B7GgY9rcHogCnmT68P4VAdRzCvAP1lgK",
          {
            jsonrpc: "2.0",
            method: "eth_blockNumber",
            params: [],
            id: 1,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (response.data && response.data.result) {
          // Convert hex to decimal
          const blockNumberDecimal = parseInt(response.data.result, 16).toString();
          setCurrentBlockNumber(blockNumberDecimal);
        }
      } catch (error) {
        console.error("Error fetching block number:", error);
      }
    };

    // Fetch block number initially and then every 15 seconds
    fetchBlockNumber();
    const intervalId = setInterval(fetchBlockNumber, 15000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (smartAccount) {
      const getAccountDetails = async () => {
        try {
          // Fetch account stats
          const stats = await fetchAccountStats(smartAccount.address);
          if (stats) {
            console.log("Account stats:", stats);
            // You can update state with the stats data here
            // For example, you might want to show token count in the UI
            if (stats.assets) {
              setAccountTokenCount(stats.assets.tokens || 0);
              setAccountNftCount(stats.assets.nfts || 0);
            }
          }

          // Fetch USDC balance
          const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base
          const client = createPublicClient({
            chain: base,
            transport: http(),
          });

          try {
            const usdc = getContract({
              client,
              address: usdcAddress,
              abi: erc20Abi,
            });

            const usdcBalanceWei = await usdc.read.balanceOf([smartAccount.address]);
            // USDC has 6 decimals
            const formattedBalance = (Number(usdcBalanceWei) / 10 ** 6).toFixed(2);
            setUsdcBalance(formattedBalance);
          } catch (error) {
            console.error("Error fetching USDC balance:", error);
            setUsdcBalance("0.00");
          }

          // Your existing code to fetch balance, etc.
        } catch (error) {
          console.error("Error getting account details:", error);
        }
      };

      getAccountDetails();
    }
  }, [smartAccount]);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Save messages to localStorage whenever messages change
  useEffect(() => {
    if (user) {
      localStorage.setItem(`chat_history_${user.id}`, JSON.stringify(messages));
    }
  }, [messages, user]);

  // Mock tokens data
  useEffect(() => {
    if (isLoggedIn) {
      const fetchData = async () => {
        const response = await axios.get(`/api/proxy/8453/tokens`);
        setTokens(response.data.tokens);

        // Set default tokens (ETH and a popular token)
        setSourceToken("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"); // ETH
        setDestinationToken("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"); // USDC on Base
      };

      fetchData();

      // Mock transaction history
      setTransactions([
        {
          id: "tx1",
          type: "Swap",
          amount: "0.1",
          token: "ETH → USDC",
          timestamp: new Date(Date.now() - 86400000), // 1 day ago
          status: "completed",
        },
        {
          id: "tx2",
          type: "Transfer",
          amount: "50",
          token: "USDC",
          timestamp: new Date(Date.now() - 172800000), // 2 days ago
          status: "completed",
        },
        {
          id: "tx3",
          type: "Swap",
          amount: "100",
          token: "USDC → ETH",
          timestamp: new Date(Date.now() - 259200000), // 3 days ago
          status: "completed",
        },
      ]);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    const storedPrivateKey = localStorage.getItem("wallet_private_key");
    if (storedPrivateKey) {
      setPrivateKey(storedPrivateKey as `0x${string}`);
      handleCreateAccountFromPrivateKey(storedPrivateKey as `0x${string}`);
    }
  }, []);

  const fetchAccountStats = async (address: string) => {
    try {
      const response = await axios.post(
        "https://web3.nodit.io/v1/base/mainnet/stats/getAccountStats",
        { address },
        {
          headers: {
            "X-API-KEY": "B7GgY9rcHogCnmT68P4VAdRzCvAP1lgK", // Replace with your actual API key in production
            accept: "application/json",
            "content-type": "application/json",
          },
        },
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching account stats:", error);
      return null;
    }
  };

  useEffect(() => {
    if (smartAccount) {
      const getAccountDetails = async () => {
        try {
          // Fetch account stats
          const stats = await fetchAccountStats(smartAccount.address);
          if (stats) {
            console.log("Account stats:", stats);
            // You can update state with the stats data here
            // For example, you might want to show token count in the UI
            if (stats.assets) {
              setAccountTokenCount(stats.assets.tokens || 0);
              setAccountNftCount(stats.assets.nfts || 0);
            }
          }

          // Your existing code to fetch balance, etc.
        } catch (error) {
          console.error("Error getting account details:", error);
        }
      };

      getAccountDetails();
    }
  }, [smartAccount]);

  const handleCreateAccountFromPrivateKey = async (storedPrivateKey: `0x${string}`) => {
    const account = await handleCreateSmartAccount(storedPrivateKey);
    setIsLoggedIn(true);

    // Add welcome message
    const welcomeMessage: Message = {
      id: Date.now().toString(),
      content: "Welcome back! I'm your 1inch AI assistant. How can I help you today?",
      sender: "ai",
      timestamp: new Date(),
    };

    setConversationHistory([
      {
        content: `The current connected user address is: ${account?.address || "Unknown"}`,
        sender: ChatMessageSender.AI,
      },
    ]);

    setMessages(prev => [...prev, welcomeMessage]);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    // Add user message to chat
    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");

    // Add to conversation history for the agent
    const newHistoryItem: ConversationHistory = {
      content: inputMessage,
      sender: ChatMessageSender.USER,
    };

    const updatedHistory = [...conversationHistory, newHistoryItem];
    setConversationHistory(updatedHistory);

    // Call the agent
    setLoading(true);
    try {
      console.log("TALKING TO AI");
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: inputMessage,
          conversationHistory: updatedHistory,
        }),
      });

      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      const data = await response.json();
      const result = data.result;

      // Check if there's transaction data to display
      if (result?.resultsForUser && result.resultsForUser.length > 0) {
        // Store transaction data for potential execution
        setTransactionData(result.resultsForUser);
      }

      // Add AI response to chat
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: result?.summarizedActions || "",
        sender: "ai",
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);

      // Add to conversation history
      const aiHistoryItem: ConversationHistory = {
        content: result?.summarizedActions || "",
        sender: ChatMessageSender.AI,
      };

      setConversationHistory([...updatedHistory, aiHistoryItem]);
    } catch (error) {
      console.error("Error sending message to AI:", error);

      // Add error message to chat
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Sorry, I encountered an error processing your request. Please try again.",
        sender: "ai",
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSmartAccount = async (existingPrivateKey?: `0x${string}`) => {
    const client = createPublicClient({
      chain: base,
      transport: http(),
    });

    const privateKey = existingPrivateKey || generatePrivateKey();
    const owner = privateKeyToAccount(privateKey);

    if (!existingPrivateKey) {
      // Store the new private key in localStorage
      localStorage.setItem("wallet_private_key", privateKey);
      setPrivateKey(privateKey);
    }

    const account = await toEcdsaKernelSmartAccount({
      client,
      owners: [owner],
      version: "0.3.1",
      entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
      },
    });

    console.log("smart account", account);
    setSmartAccount(account);
    setAccountBalance("0.5"); // Mock balance
    return account;
  };

  const handleCreateAccount = async () => {
    // Create a simple account with just an ID and random username
    const account = await handleCreateSmartAccount();
    setIsLoggedIn(true);
    // Add welcome message
    const welcomeMessage: Message = {
      id: Date.now().toString(),
      content: "Hello! I'm your 1inch AI assistant. How can I help you today?",
      sender: "ai",
      timestamp: new Date(),
    };
    setConversationHistory([
      {
        content: `The current connected user address is: ${account?.address || "Unknown"}`,
        sender: ChatMessageSender.AI,
      },
    ]);
    setMessages(prev => [...prev, welcomeMessage]);
  };

  const handleExecuteTransaction = async () => {
    if (!transactionData || !smartAccount) return;

    setLoading(true);
    try {
      // Here we would process the transaction data and execute it
      console.log("Executing transaction with data:", transactionData);

      const pimlicoUrl = `https://api.pimlico.io/v2/8453/rpc?apikey=pim_bX6KsbhcEy33vSXdhx3YsX`;

      const pimlicoClient = createPimlicoClient({
        transport: http(pimlicoUrl),
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
      });

      const smartAccountClient = createSmartAccountClient({
        account: smartAccount,
        chain: base,
        bundlerTransport: http(pimlicoUrl),
        paymaster: pimlicoClient,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast;
          },
        },
      });

      const successMessage: Message = {
        id: Date.now().toString(),
        content: "Transaction executed successfully!",
        sender: "ai",
        timestamp: new Date(),
      };
      const calls = transactionData[0].result?.calls;
      console.log("CALLS", calls);
      const txHash = await handlePermit(calls);
      //   const txHash = await smartAccountClient.sendTransaction({
      //     calls,
      //   });
      console.log("txHash", txHash);
      setTransactionHash(txHash);
      setTransactionStatus("success");
      setMessages(prev => [...prev, successMessage]);
      setTransactionData(null); // Clear transaction data after execution
    } catch (error) {
      console.error("Error executing transaction:", error);

      const errorMessage: Message = {
        id: Date.now().toString(),
        content: "Failed to execute transaction. Please try again.",
        sender: "ai",
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const getQuote = async () => {
    if (!sourceToken || !destinationToken || !amount) return;

    setSwapLoading(true);
    try {
      // Convert amount to wei based on source token decimals
      const sourceDecimals = tokens[sourceToken]?.decimals || 18;
      const amountInWei = BigInt(parseFloat(amount) * 10 ** sourceDecimals).toString();
      console.log("AMOUNT IN WEI", amountInWei);
      const response = await axios.get(`/api/proxy/8453/quote`, {
        params: {
          src: sourceToken,
          dst: destinationToken,
          amount: amountInWei,
          includeTokensInfo: true,
          includeGas: true,
        },
      });

      console.log("getQuote", response.data);
      setQuote(response.data);
    } catch (error) {
      console.error("Error getting quote:", error);
    } finally {
      setSwapLoading(false);
    }
  };

  // Format token amount for display
  const formatTokenAmount = (amount: string, decimals: number) => {
    try {
      // Convert from wei to token units
      const bigIntAmount = BigInt(amount);
      const divisor = BigInt(10 ** decimals);

      // Integer part
      const integerPart = (bigIntAmount / divisor).toString();

      // Fractional part (if any)
      const remainder = bigIntAmount % divisor;
      let fractionalPart = remainder.toString().padStart(decimals, "0");

      // Trim trailing zeros
      fractionalPart = fractionalPart.replace(/0+$/, "");

      if (fractionalPart.length > 0) {
        return `${integerPart}.${fractionalPart}`;
      } else {
        return integerPart;
      }
    } catch (error) {
      console.error("Error formatting token amount:", error);
      return "0";
    }
  };

  // Execute swap with batched approve and swap
  const executeSwap = async () => {
    if (!smartAccount || !sourceToken || !destinationToken || !amount) return;
    setSwapLoading(true);
    setTransactionStatus("loading");
    setTransactionHash(null);
    setTransactionError(null);
    try {
      // 1. Get approve transaction data
      const approveResponse = await axios.get(`/api/proxy/8453/approve/transaction`, {
        params: {
          tokenAddress: sourceToken,
          // Infinite approval
        },
      });

      console.log("approveResponse", approveResponse.data);
      const approveData = approveResponse.data;

      // 2. Get swap transaction data
      const sourceDecimals = tokens[sourceToken]?.decimals || 18;
      const amountInWei = BigInt(parseFloat(amount) * 10 ** sourceDecimals).toString();

      const swapResponse = await axios.get(`/api/proxy/8453/swap`, {
        params: {
          src: sourceToken,
          dst: destinationToken,
          amount: amountInWei,
          from: smartAccount?.address,
          origin: smartAccount?.address,
          slippage: 1, // 1% slippage
          disableEstimate: true, // Disable onchain simulation for smart accounts
        },
      });

      console.log("swapResponse", swapResponse.data);
      const swapData = swapResponse.data;

      const pimlicoUrl = `https://api.pimlico.io/v2/8453/rpc?apikey=pim_bX6KsbhcEy33vSXdhx3YsX`;

      const pimlicoClient = createPimlicoClient({
        transport: http(pimlicoUrl),
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
      });

      const smartAccountClient = createSmartAccountClient({
        account: smartAccount,
        chain: base,
        bundlerTransport: http(pimlicoUrl),
        paymaster: pimlicoClient,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast;
          },
        },
      });

      const calls = [
        {
          to: approveData.to as `0x${string}`,
          data: approveData.data as `0x${string}`,
          value: 0n,
        },
        {
          to: swapData.tx.to as `0x${string}`,
          data: swapData.tx.data as `0x${string}`,
          value: BigInt(swapData.tx.value || "0"),
        },
      ];

      const txHash = await handlePermit(calls);

      console.log("txHash", txHash);
      setTransactionHash(txHash);
      setTransactionStatus("success");

      // Add new transaction to history
      const newTransaction: Transaction = {
        id: "tx" + Date.now(),
        type: "Swap",
        amount: amount,
        token: `${tokens[sourceToken]?.symbol} → ${tokens[destinationToken]?.symbol}`,
        timestamp: new Date(),
        status: "completed",
      };

      setTransactions(prev => [newTransaction, ...prev]);
      setQuote(null);
      setAmount("");
    } catch (error) {
      console.error("Error executing swap:", error);
      setTransactionStatus("error");
      setTransactionError(error instanceof Error ? error.message : "Unknown error occurred");
    } finally {
      setSwapLoading(false);
    }
  };

  async function eip2612Permit({ token, chain, ownerAddress, spenderAddress, value }: any) {
    console.log(
      "token read",
      await token.read.name(),
      await token.read.version(),
      await token.read.nonces([ownerAddress]),
      token.address,
    );
    return {
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      domain: {
        name: await token.read.name(),
        version: await token.read.version(),
        chainId: chain.id,
        verifyingContract: token.address,
      },
      message: {
        owner: ownerAddress,
        spender: spenderAddress,
        value,
        nonce: await token.read.nonces([ownerAddress]),
        // The paymaster cannot access block.timestamp due to 4337 opcode
        // restrictions, so the deadline must be MAX_UINT256.
        deadline: maxUint256,
      },
    };
  }

  const handletransfer = async () => {
    function sendUSDC(to: string, amount: bigint) {
      return {
        to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        abi: erc20Abi,
        functionName: "transfer",
        args: [to, amount],
      };
    }

    const calls = [sendUSDC("0x0eA8743D967d33407Bb1F68FBa8C7bE5A1FbC8eD", 100n)]; // $0.01 USDC
    const txHash = await handlePermit(calls);
    console.log("txHash", txHash);
  };

  const handlePermit = async (calls: any) => {
    const usdcAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const basePaymasterContract = "0x6C973eBe80dCD8660841D4356bf15c32460271C9";
    const MAX_GAS_USDC = 10000000n; // $10 USDC with 6 decimals
    const pimlicoUrl = `https://base-mainnet.g.alchemy.com/v2/TVjz433F1ukidqd2N4XNCj_LXABQGnY7`;

    const client = createPublicClient({
      chain: base,
      transport: http(),
    });
    const eip2612Abi = [
      {
        inputs: [{ internalType: "address", name: "owner", type: "address" }],
        stateMutability: "view",
        type: "function",
        name: "nonces",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
      },
      {
        inputs: [],
        name: "version",
        outputs: [{ internalType: "string", name: "", type: "string" }],
        stateMutability: "view",
        type: "function",
      },
    ];
    const usdc = getContract({
      client,
      address: usdcAddress,
      abi: [...erc20Abi, ...eip2612Abi],
    });
    const usdcBalance = await usdc.read.balanceOf([smartAccount?.address]);
    const permitData = await eip2612Permit({
      token: usdc,
      chain: base,
      ownerAddress: smartAccount?.address,
      spenderAddress: basePaymasterContract,
      value: MAX_GAS_USDC,
    });

    const wrappedPermitSignature = await smartAccount?.signTypedData(permitData as any);
    const { signature: permitSignature } = parseErc6492Signature(wrappedPermitSignature as any);

    console.log("Permit signature:", permitSignature);

    const paymaster = basePaymasterContract;
    const paymasterData = encodePacked(
      ["uint8", "address", "uint256", "bytes"],
      [
        0, // Reserved for future use
        usdc.address, // Token address
        MAX_GAS_USDC, // Max spendable gas in USDC
        permitSignature, // EIP-2612 permit signature
      ],
    );
    const additionalGasCharge = hexToBigInt(
      (
        await client.call({
          to: paymaster,
          data: encodeFunctionData({
            abi: parseAbi(["function additionalGasCharge() returns (uint256)"]),
            functionName: "additionalGasCharge",
          }),
        })
      ).data!,
    );

    const bundlerClient = createBundlerClient({
      client,
      account: smartAccount as ToEcdsaKernelSmartAccountReturnType<"0.7">,
      transport: http(pimlicoUrl),
    });

    const pimlicoBundlerClient = createBundlerClient({
      client,
      account: smartAccount as ToEcdsaKernelSmartAccountReturnType<"0.7">,
      transport: http("https://api.pimlico.io/v2/8453/rpc?apikey=pim_bX6KsbhcEy33vSXdhx3YsX"),
    });

    const { standard: fees } = (await pimlicoBundlerClient.request({
      method: "pimlico_getUserOperationGasPrice" as any,
    })) as { standard: { maxFeePerGas: number; maxPriorityFeePerGas: number } };

    const maxFeePerGas = hexToBigInt(fees.maxFeePerGas as any);
    const maxPriorityFeePerGas = hexToBigInt(fees.maxPriorityFeePerGas as any);

    const {
      callGasLimit,
      preVerificationGas,
      verificationGasLimit,
      paymasterPostOpGasLimit,
      paymasterVerificationGasLimit,
    } = await bundlerClient.estimateUserOperationGas({
      account: smartAccount as ToEcdsaKernelSmartAccountReturnType<"0.7">,
      calls,
      paymaster,
      paymasterData,
      paymasterPostOpGasLimit: additionalGasCharge,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
    });

    const userOpHash = await bundlerClient.sendUserOperation({
      account: smartAccount as ToEcdsaKernelSmartAccountReturnType<"0.7">,
      calls,
      callGasLimit,
      preVerificationGas,
      verificationGasLimit,
      paymaster,
      paymasterData,
      paymasterVerificationGasLimit,
      paymasterPostOpGasLimit: BigInt(additionalGasCharge),
      maxFeePerGas: maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas,
    });

    const userOpReceipt = await bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    console.log("Done! Details:");
    console.log("  transaction hash:", userOpReceipt.receipt.transactionHash);
    return userOpReceipt.receipt.transactionHash;
  };

  useEffect(() => {
    if (isLoggedIn) {
      const fetchTokens = async () => {
        try {
          const response = await axios.get(`/api/proxy/8453/tokens`);
          setTokens(response.data.tokens);

          // Set default tokens (ETH and a popular token)
          setSourceToken("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"); // ETH
          setDestinationToken("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"); // USDC on Base
        } catch (error) {
          console.error("Error fetching tokens:", error);
          // Fallback to mock tokens if API fails
          setTokens({
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee": {
              address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
              symbol: "ETH",
              name: "Ethereum",
              decimals: 18,
              logoURI: "https://tokens.1inch.io/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png",
            },
            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": {
              address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              symbol: "USDC",
              name: "USD Coin",
              decimals: 6,
              logoURI: "https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png",
            },
            "0x4200000000000000000000000000000000000006": {
              address: "0x4200000000000000000000000000000000000006",
              symbol: "WETH",
              name: "Wrapped Ether",
              decimals: 18,
              logoURI: "https://tokens.1inch.io/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png",
            },
          });
        }
      };

      fetchTokens();
    }
  }, [isLoggedIn]);

  // If not logged in, show simple create account button
  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen bg-gray-100 justify-center items-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md text-center">
          <h1 className="text-2xl font-bold text-center text-blue-600 mb-6">1inch AI Assistant</h1>
          <p className="mb-6 text-gray-600">Chat with our AI assistant to help with 1inch operations</p>
          <button
            onClick={handleCreateAccount}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg"
          >
            Create Account
          </button>
        </div>
      </div>
    );
  }

  // Chat interface for logged in users
  return (
    <div className="flex flex-col h-screen bg-gray-100 text-black">
      <div className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center">
        <h1 className="text-xl font-bold">Q3x</h1>
      </div>

      {/* Account Details Section */}
      <div className="bg-white p-4 shadow-md mb-4">
        {/* <div className="p-20 bg-red-300" onClick={handletransfer}>
          TRANSFER
        </div> */}
        <div className="max-w-6xl mx-auto">
          <h2 className="text-lg font-semibold mb-2">Account Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm text-gray-500">Account Address</p>
              <p className="font-mono text-sm ">{smartAccount?.address || "Loading..."}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm text-gray-500">Network</p>
              <p className="font-semibold">Base</p>
            </div>{" "}
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm text-gray-500">USDC Balance</p>
              <p className="font-semibold">${usdcBalance}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm text-gray-500">Tokens Owned</p>
              <p className="font-semibold">{accountTokenCount}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm text-gray-500">NFTs Owned</p>
              <p className="font-semibold">{accountNftCount}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm text-gray-500">Current Block</p>
              <div className="flex items-center">
                <p className="font-semibold">{currentBlockNumber || "Loading..."}</p>
                {currentBlockNumber && (
                  <div
                    className="ml-2 w-2 h-2 bg-green-500 rounded-full animate-pulse"
                    title="Live block updates"
                  ></div>
                )}
              </div>
            </div>
            <div className="mt-3 bg-blue-50 border border-blue-200 p-3 rounded-lg flex items-center">
              <svg className="w-5 h-5 text-blue-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm text-blue-700">
                Gas fees are paid with USDC, powered by Circle. No ETH required for transactions.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto w-full px-4 mb-4">
        <div className="flex border-b border-gray-200">
          <button
            className={`py-2 px-4 font-medium ${
              activeTab === "chat" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"
            }`}
            onClick={() => setActiveTab("chat")}
          >
            AI Assistant
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              activeTab === "swap" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"
            }`}
            onClick={() => setActiveTab("swap")}
          >
            Swap
          </button>
        </div>
      </div>

      {activeTab === "chat" ? (
        // Chat Interface
        <div className="flex-1 overflow-hidden flex flex-col max-w-6xl mx-auto w-full px-4">
          <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow-md p-4 mb-4">
            {messages.map(message => (
              <div key={message.id} className={`mb-4 ${message.sender === "user" ? "text-right" : ""}`}>
                <div
                  className={`inline-block px-4 py-2 rounded-lg max-w-[80%] ${
                    message.sender === "user"
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-gray-200 text-gray-800 rounded-bl-none"
                  }`}
                >
                  {message.content}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
            {loading && (
              <div className="mb-4">
                <div className="inline-block px-4 py-2 rounded-lg max-w-[80%] bg-gray-200 text-gray-800 rounded-bl-none">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.4s" }}
                    ></div>
                  </div>
                </div>
              </div>
            )}

            {/* Transaction Action Button - Show when transaction data is available */}
            {transactionData && (
              <div className="mb-4 flex justify-center">
                <button
                  onClick={handleExecuteTransaction}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium flex items-center"
                  disabled={loading}
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                  Sign Transaction
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex mb-4">
            <input
              type="text"
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyPress={e => e.key === "Enter" && handleSendMessage()}
              placeholder="Type your message here..."
              className="flex-1 p-3 border border-gray-300 bg-white rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <button
              onClick={handleSendMessage}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-r-lg"
              disabled={loading || !inputMessage.trim()}
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        // Swap Interface
        <div className="flex-1 overflow-y-auto max-w-6xl mx-auto w-full px-4 pb-4">
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-bold mb-6">Swap Tokens</h2>

            {/* Token Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block mb-2 font-medium">From Token</label>
                <select
                  className="w-full p-2 border rounded bg-white"
                  value={sourceToken}
                  onChange={e => setSourceToken(e.target.value)}
                >
                  <option value="">Select Token</option>
                  {Object.entries(tokens).map(([address, token]) => (
                    <option key={address} value={address}>
                      {token.symbol} - {token.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-2 font-medium">To Token</label>
                <select
                  className="w-full p-2 border rounded bg-white"
                  value={destinationToken}
                  onChange={e => setDestinationToken(e.target.value)}
                >
                  <option value="">Select Token</option>
                  {Object.entries(tokens).map(([address, token]) => (
                    <option key={address} value={address}>
                      {token.symbol} - {token.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Amount Input */}
            <div className="mb-6">
              <label className="block mb-2 font-medium">Amount</label>
              <input
                type="text"
                className="w-full p-2 border rounded bg-white"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </div>

            {/* Get Quote Button */}
            <button
              className="bg-blue-500 hover:bg-blue-600 text-white p-2 rounded mb-6 w-full"
              onClick={getQuote}
              disabled={swapLoading || !sourceToken || !destinationToken || !amount}
            >
              {swapLoading ? "Loading..." : "Get Quote"}
            </button>

            {/* Quote Display */}
            {quote && (
              <div className="bg-gray-100 p-4 rounded mb-6">
                <h3 className="text-lg font-semibold mb-2">Quote</h3>
                <p className="text-lg">
                  {amount} {quote.srcToken.symbol} ≈ {formatTokenAmount(quote.dstAmount, quote.dstToken.decimals)}{" "}
                  {quote.dstToken.symbol}
                </p>
              </div>
            )}

            {/* Execute Swap Button */}
            <button
              className="bg-green-500 hover:bg-green-600 text-white p-3 rounded w-full font-bold"
              onClick={executeSwap}
              disabled={swapLoading || !quote}
            >
              {swapLoading ? "Processing..." : "Swap Tokens"}
            </button>

            {/* Transaction Status */}
            {transactionStatus !== "idle" && (
              <div
                className={`mt-6 p-4 rounded-lg ${
                  transactionStatus === "loading"
                    ? "bg-blue-50 border border-blue-200"
                    : transactionStatus === "success"
                      ? "bg-green-50 border border-green-200"
                      : "bg-red-50 border border-red-200"
                }`}
              >
                {transactionStatus === "loading" && (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mr-3"></div>
                    <p className="text-blue-700">Transaction in progress...</p>
                  </div>
                )}

                {transactionStatus === "success" && (
                  <div>
                    <div className="flex items-center mb-2">
                      <svg className="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <p className="text-green-700 font-medium">Transaction successful!</p>
                    </div>
                    {transactionHash && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-600 mb-1">Transaction Hash:</p>
                        <div className="flex items-center">
                          <code className="bg-gray-100 p-2 rounded text-xs font-mono overflow-x-auto max-w-full">
                            {transactionHash}
                          </code>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(transactionHash);
                              // You could add a toast notification here
                            }}
                            className="ml-2 text-gray-500 hover:text-gray-700"
                            title="Copy to clipboard"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                              />
                            </svg>
                          </button>
                          <a
                            href={`https://basescan.org/tx/${transactionHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-blue-500 hover:text-blue-700"
                            title="View on BaseScan"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                              />
                            </svg>
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {transactionStatus === "error" && (
                  <div>
                    <div className="flex items-center mb-2">
                      <svg className="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <p className="text-red-700 font-medium">Transaction failed</p>
                    </div>
                    {transactionError && (
                      <p className="text-sm text-red-600 mt-1 bg-red-50 p-2 rounded">{transactionError}</p>
                    )}
                    <button
                      onClick={() => setTransactionStatus("idle")}
                      className="mt-3 text-sm text-red-600 hover:text-red-800"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
