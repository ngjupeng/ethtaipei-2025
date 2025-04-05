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
  createBundlerClient,
  createWebAuthnCredential,
  entryPoint07Address,
  toCoinbaseSmartAccount,
  toWebAuthnAccount,
} from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { http, useAccount } from "wagmi";

// Define token interface
interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string;
}

// Define quote response interface
interface QuoteResponse {
  srcToken: Token;
  dstToken: Token;
  dstAmount: string;
  protocols: any[];
}

// Define swap response interface
interface SwapResponse {
  srcToken: Token;
  dstToken: Token;
  dstAmount: string;
  tx: {
    from: string;
    to: string;
    data: string;
    value: string;
    gasPrice: string;
    gas: number;
  };
}

// Define approve response interface
interface ApproveResponse {
  data: string;
  gasPrice: string;
  to: string;
  value: string;
}

const Home: NextPage = () => {
  // State for DEX UI
  const [tokens, setTokens] = useState<Record<string, Token>>({});
  const [sourceToken, setSourceToken] = useState<string>("");
  const [destinationToken, setDestinationToken] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [smartAccount, setSmartAccount] = useState<SmartAccount | null>(null);

  // Fetch tokens on component mount
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const response = await axios.get(`/api/proxy/8453/tokens`);
        setTokens(response.data.tokens);

        // Set default tokens (ETH and a popular token)
        setSourceToken("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"); // ETH
        setDestinationToken("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"); // USDC on Base
      } catch (error) {
        console.error("Error fetching tokens:", error);
      }
    };

    fetchTokens();
  }, []);

  // Get quote for the swap
  const getQuote = async () => {
    if (!sourceToken || !destinationToken || !amount) return;

    setLoading(true);
    try {
      // Convert amount to wei based on source token decimals
      const sourceDecimals = tokens[sourceToken]?.decimals || 18;
      const amountInWei = BigInt(parseFloat(amount) * 10 ** sourceDecimals).toString();

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
      setLoading(false);
    }
  };

  // Format token amount for display
  const formatTokenAmount = (amount: string, decimals: number) => {
    return (BigInt(amount) / BigInt(10 ** decimals)).toString();
  };

  const handleCreateSmartAccount = async () => {
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    // Register a credential (ie. passkey).
    const credential = await createWebAuthnCredential({ name: "Wallet" });

    // Create a WebAuthn owner account from the credential.
    const owner = toWebAuthnAccount({ credential });

    const account = await toCoinbaseSmartAccount({
      client,
      owners: [owner],
    });

    console.log("smart account", account);
    setSmartAccount(account);

    // const smartAccountClient = createSmartAccountClient({
    //   account,
    //   chain: baseSepolia,
    //   bundlerTransport: http(pimlicoUrl),
    //   paymaster: pimlicoClient,
    //   userOperation: {
    //     estimateFeesPerGas: async () => {
    //       return (await pimlicoClient.getUserOperationGasPrice()).fast;
    //     },
    //   },
    // });

    // const txHash = await smartAccountClient.sendTransaction({
    //   calls: [
    //     {
    //       to: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
    //       value: 0n,
    //       data: "0x1234",
    //     },
    //     {
    //       to: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
    //       value: 0n,
    //       data: "0x1234",
    //     },
    //   ],
    // });

    // console.log(`User operation included: https://sepolia.basescan.org/tx/${txHash}`);
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
  const baseSepoliaPaymaster = "0x31BE08D380A21fc740883c0BC434FcFc88740b58";
  const MAX_GAS_USDC = 1000000n; // 1 USDC

  const handlePermit = async () => {
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });
    const usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
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
      chain: baseSepolia,
      ownerAddress: smartAccount?.address,
      spenderAddress: baseSepoliaPaymaster,
      value: MAX_GAS_USDC,
    });

    const wrappedPermitSignature = await smartAccount?.signTypedData(permitData);
    const { signature: permitSignature } = parseErc6492Signature(wrappedPermitSignature);

    console.log("Permit signature:", permitSignature);

    function sendUSDC(to: string, amount: bigint) {
      return {
        to: usdc.address,
        abi: usdc.abi,
        functionName: "transfer",
        args: [to, amount],
      };
    }

    const recipient = privateKeyToAccount(generatePrivateKey()).address;
    const calls = [sendUSDC(recipient, 10000n)]; // $0.01 USDC

    const paymaster = baseSepoliaPaymaster;
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
    const pimlicoUrl = `https://api.pimlico.io/v2/84532/rpc?apikey=pim_bX6KsbhcEy33vSXdhx3YsX`;

    // const bundlerClient = createPimlicoClient({
    //   transport: http(pimlicoUrl),
    //   entryPoint: {
    //     address: entryPoint07Address,
    //     version: "0.7",
    //   },
    // });
    const PROXY_RPC_URL = "/api/rpc";

    const bundlerClient = createBundlerClient({
      client,
      account: smartAccount as ToCoinbaseSmartAccountReturnType,
      transport: http(PROXY_RPC_URL),
    });

    const { standard: fees } = await bundlerClient.request({
      method: "pimlico_getUserOperationGasPrice",
    });

    const maxFeePerGas = hexToBigInt(fees.maxFeePerGas);
    const maxPriorityFeePerGas = hexToBigInt(fees.maxPriorityFeePerGas);

    console.log("Max fee per gas:", maxFeePerGas);
    console.log("Max priority fee per gas:", maxPriorityFeePerGas);
    console.log("Estimating user op gas limits...");

    const {
      callGasLimit,
      preVerificationGas,
      verificationGasLimit,
      paymasterPostOpGasLimit,
      paymasterVerificationGasLimit,
    } = await bundlerClient.estimateUserOperationGas({
      account: smartAccount as ToCoinbaseSmartAccountReturnType,
      calls,
      paymaster,
      paymasterData,
      paymasterPostOpGasLimit: additionalGasCharge,
      // Use very low gas fees for estimation to ensure successful permit/transfer,
      // since the bundler will simulate the user op with very high gas limits
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      entryPointAddress: entryPoint07Address,
    });
    console.log("Call gas limit:", callGasLimit);
    console.log("Pre-verification gas:", preVerificationGas);
    console.log("Verification gas limit:", verificationGasLimit);

    console.log("Sending user op...");

    const userOpHash = await bundlerClient.sendUserOperation({
      account: smartAccount as ToCoinbaseSmartAccountReturnType,
      calls,
      callGasLimit,
      preVerificationGas,
      verificationGasLimit,
      paymaster,
      paymasterData,
      paymasterVerificationGasLimit: additionalGasCharge,
      // Make sure that `paymasterPostOpGasLimit` is always at least
      // `additionalGasCharge`, regardless of what the bundler estimated.
      paymasterPostOpGasLimit: Math.max(Number(paymasterPostOpGasLimit), Number(additionalGasCharge)),
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    console.log("Submitted user op:", userOpHash);
    console.log("Waiting for execution...");

    // const userOpReceipt = await bundlerClient.waitForUserOperationReceipt({
    //   hash: userOpHash,
    // });

    // console.log("Done! Details:");
    // console.log("  success:", userOpReceipt.success);
    // console.log("  actualGasUsed:", userOpReceipt.actualGasUsed);
    // console.log("  actualGasCost:", formatUnits(userOpReceipt.actualGasCost, 18), "ETH");
    // console.log("  transaction hash:", userOpReceipt.receipt.transactionHash);
    // console.log("  transaction gasUsed:", userOpReceipt.receipt.gasUsed);

    // const usdcBalanceAfter = await usdc.read.balanceOf([smartAccount?.address]);
    // const usdcConsumed = Number(usdcBalance) - Number(usdcBalanceAfter) - 10000; // Exclude what we sent

    // console.log("  USDC paid:", formatUnits(BigInt(usdcConsumed), 6));
  };

  // Execute swap with batched approve and swap
  const executeSwap = async () => {
    // if (!connectedAddress || !sourceToken || !destinationToken || !amount) return;

    setLoading(true);
    try {
      // 1. Get approve transaction data
      const approveResponse = await axios.get(`/api/proxy/8453/approve/transaction`, {
        params: {
          tokenAddress: sourceToken,
          // Infinite approval
        },
      });

      console.log("approveResponse", approveResponse.data);

      const approveData: ApproveResponse = approveResponse.data;

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

      const swapData: SwapResponse = swapResponse.data;

      const pimlicoUrl = `https://api.pimlico.io/v2/84532/rpc?apikey=pim_bX6KsbhcEy33vSXdhx3YsX`;

      const pimlicoClient = createPimlicoClient({
        transport: http(pimlicoUrl),
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
      });

      const smartAccountClient = createSmartAccountClient({
        account: smartAccount as ToCoinbaseSmartAccountReturnType,
        chain: baseSepolia,
        bundlerTransport: http(pimlicoUrl),
        paymaster: pimlicoClient,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast;
          },
        },
      });

      const txHash = await smartAccountClient.sendTransaction({
        calls: [
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
        ],
      });

      console.log("txHash", txHash);
    } catch (error) {
      console.error("Error executing swap:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{ marginTop: 60, maxWidth: "800px", margin: "0 auto", padding: "20px" }}>
        <h1 className="text-2xl font-bold mb-6">Account Management</h1>

        <button className="p-4 bg-red-300" onClick={handleCreateSmartAccount} type="button">
          Create Account
        </button>

        {smartAccount && (
          <div>
            <h2 className="text-xl font-bold mb-2">Smart Account</h2>
            <p>{smartAccount.address}</p>
          </div>
        )}

        <h1 className="text-2xl font-bold mb-6">1inch DEX</h1>

        {/* Token Selection */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block mb-2">From Token</label>
            <select
              className="w-full p-2 border rounded"
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
            <label className="block mb-2">To Token</label>
            <select
              className="w-full p-2 border rounded"
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
          className="bg-blue-500 text-white p-2 rounded mb-6 w-full"
          onClick={getQuote}
          disabled={loading || !sourceToken || !destinationToken || !amount}
        >
          {loading ? "Loading..." : "Get Quote"}
        </button>

        {/* Quote Display */}
        {quote && (
          <div className="bg-gray-100 text-black p-4 rounded mb-6">
            <h2 className="text-xl font-bold mb-2">Quote</h2>
            <p>
              {amount} {quote.srcToken.symbol} ≈ {formatTokenAmount(quote.dstAmount, quote.dstToken.decimals)}{" "}
              {quote.dstToken.symbol}
            </p>
          </div>
        )}

        {/* Execute Swap Button */}
        <button
          className="bg-green-500 text-white p-2 rounded w-full"
          onClick={executeSwap}
          disabled={loading || !quote}
        >
          {loading ? "Processing..." : "Swap (Approve + Swap in one transaction)"}
        </button>

        {/* Existing Buttons */}
        <div className="mt-10">
          <h2 className="text-xl font-bold mb-4">Other Actions</h2>
          <div className="grid grid-cols-3 gap-4">
            <button className="p-4 bg-red-300" onClick={handlePermit} type="button">
              Sign Permit
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
