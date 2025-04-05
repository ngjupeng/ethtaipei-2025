"use client";

import { useCallback, useEffect, useState } from "react";
import { AAWrapProvider, SendTransactionMode, SmartAccount, Transaction } from "@particle-network/aa";
import { useAuthCore, useConnect, useEthereum } from "@particle-network/auth-core-modal";
import { BaseSepolia } from "@particle-network/chains";
import axios from "axios";
import { ethers } from "ethers";
import type { NextPage } from "next";
import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import {
  Account,
  LocalAccount,
  SignableMessage,
  createPublicClient,
  encodeFunctionData,
  encodePacked,
  erc20Abi,
  getContract,
  hexToBigInt,
  maxUint256,
  parseAbi,
  parseErc6492Signature,
} from "viem";
import { createWalletClient } from "viem";
import {
  createBundlerClient,
  createWebAuthnCredential,
  entryPoint07Abi,
  entryPoint07Address,
  toCoinbaseSmartAccount,
  toSmartAccount,
  toWebAuthnAccount,
} from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { parseAccount } from "viem/utils";
import { http, useAccount, usePublicClient, useSignTypedData, useWalletClient } from "wagmi";
import { useSendCalls, useWriteContracts } from "wagmi/experimental";

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
  const account = useAccount();
  const connectedAddress = account.address;
  const { data: walletClient } = useWalletClient();

  const abi = [
    {
      stateMutability: "nonpayable",
      type: "function",
      inputs: [{ name: "to", type: "address" }],
      name: "safeMint",
      outputs: [],
    },
  ] as const;

  const publicClient = usePublicClient();
  const { writeContracts } = useWriteContracts();
  const { sendCalls } = useSendCalls();
  // State for DEX UI
  const [tokens, setTokens] = useState<Record<string, Token>>({});
  const [sourceToken, setSourceToken] = useState<string>("");
  const [destinationToken, setDestinationToken] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // 1inch API key
  const API_KEY = "pIEkOQOA0KzMSEKjD7LtdNxKgVDa0BJH";
  const CHAIN_ID = "8453"; // Base chain ID

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

  const handleSendTransaction = async () => {
    writeContracts({
      contracts: [
        {
          address: "0x119Ea671030FBf79AB93b436D2E20af6ea469a19",
          abi,
          functionName: "safeMint",
          args: [account.address],
        },
        {
          address: "0x119Ea671030FBf79AB93b436D2E20af6ea469a19",
          abi,
          functionName: "safeMint",
          args: [account.address],
        },
      ],
    });
  };

  const handleSendCalls = async () => {
    const recipientAddress = "0x35340673E33eF796B9a2d00dB8B6A549205aabe4";

    const amount = 1n;

    // Encode the transfer function call
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipientAddress, amount],
    });
    sendCalls({
      calls: [
        {
          to: "0x5dEaC602762362FE5f135FA5904351916053cF70",
          value: 0n,
          data: data,
        },
      ],
    });
  };

  const handleTemp = async () => {
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

    const pimlicoUrl = `https://api.pimlico.io/v2/84532/rpc?apikey=pim_bX6KsbhcEy33vSXdhx3YsX`;

    const pimlicoClient = createPimlicoClient({
      transport: http(pimlicoUrl),
      entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
      },
    });

    const smartAccountClient = createSmartAccountClient({
      account,
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
          to: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
          value: 0n,
          data: "0x1234",
        },
        {
          to: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
          value: 0n,
          data: "0x1234",
        },
      ],
    });

    console.log(`User operation included: https://sepolia.basescan.org/tx/${txHash}`);
  };

  const handleTemp2 = async () => {
    console.log("connectedAddress", connectedAddress);
    const customSigner = parseAccount(connectedAddress!);
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });
    const simpleSmartAccountClient = await toSimpleSmartAccount({
      client: client,
      owner: customSigner,
      entryPoint: {
        // optional, defaults to 0.7
        address: entryPoint07Address,
        version: "0.7",
      },
    });

    const pimlicoUrl = `https://api.pimlico.io/v2/84532/rpc?apikey=pim_bX6KsbhcEy33vSXdhx3YsX`;

    const pimlicoClient = createPimlicoClient({
      transport: http(pimlicoUrl),
      entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
      },
    });

    const smartAccountClient = createSmartAccountClient({
      account: simpleSmartAccountClient,
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
          to: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
          value: 0n,
          data: "0x1234",
        },
        {
          to: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
          value: 0n,
          data: "0x1234",
        },
      ],
    });

    console.log(`User operation included: https://sepolia.basescan.org/tx/${txHash}`);
  };

  const signEip7702 = async () => {
    const customSigner = parseAccount(connectedAddress!);

    const walletClient = createWalletClient({
      account: customSigner,
      chain: baseSepolia,
      transport: http(),
    });

    const SAFE_SINGLETON_ADDRESS = "0x41675C099F32341bf84BFc5382aF534df5C7461a";

    const authorization = await walletClient.signAuthorization({
      contractAddress: SAFE_SINGLETON_ADDRESS,
    });
  };

  const { provider, address, signTypedData } = useEthereum();
  // Used for initiating social login and disconnecting users (post-login)
  const { connect, disconnect } = useConnect();
  // Automatically loaded with relevant user information after logging in
  const { userInfo } = useAuthCore();

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

    const permitData = await eip2612Permit({
      token: usdc,
      chain: baseSepolia,
      ownerAddress: await smartAccount.getAddress(),
      spenderAddress: baseSepoliaPaymaster,
      value: MAX_GAS_USDC,
    });
    console.log(permitData);

    const serializedPermitData = {
      types: permitData.types,
      primaryType: permitData.primaryType,
      domain: {
        ...permitData.domain,
        chainId: permitData.domain.chainId.toString(),
      },
      message: {
        ...permitData.message,
        value: permitData.message.value.toString(),
        nonce: permitData.message.nonce.toString(),
        deadline: permitData.message.deadline.toString(),
      },
    };

    // Format the data for Particle Network's signTypedData
    const formattedPermitData = {
      data: serializedPermitData,
      version: "V4",
    };

    const wrappedPermitSignature = await signTypedData(formattedPermitData);
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

    const bundlerClient = createPimlicoClient({
      transport: http(pimlicoUrl),
      entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
      },
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
      account: await smartAccount.getAccount(),
      calls,
      paymaster,
      paymasterData,
      // Make sure to pass in the `additionalGasCharge` from the paymaster
      paymasterPostOpGasLimit: additionalGasCharge,
      // Use very low gas fees for estimation to ensure successful permit/transfer,
      // since the bundler will simulate the user op with very high gas limits
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
    });
  };

  // useEffect(() => {
  //   if (data) {
  //     (async () => {
  //       try {
  //         const { signature: permitSignature } = parseErc6492Signature(data);
  //         console.log("Permit signature:", permitSignature);
  //         // Now you can use the permitSignature for further processing
  //         function sendUSDC(to: string, amount: bigint) {
  //           return encodeFunctionData({
  //             abi: erc20Abi,
  //             functionName: "transfer",
  //             args: [to, amount],
  //           });
  //         }

  //         const recipient = privateKeyToAccount(generatePrivateKey()).address;
  //         const calls = [sendUSDC(recipient, 10000n)]; // $0.01 USDC
  //         const client = createPublicClient({
  //           chain: baseSepolia,
  //           transport: http(),
  //         });
  //         const usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  //         const eip2612Abi = [
  //           {
  //             inputs: [{ internalType: "address", name: "owner", type: "address" }],
  //             stateMutability: "view",
  //             type: "function",
  //             name: "nonces",
  //             outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
  //           },
  //           {
  //             inputs: [],
  //             name: "version",
  //             outputs: [{ internalType: "string", name: "", type: "string" }],
  //             stateMutability: "view",
  //             type: "function",
  //           },
  //         ];
  //         const usdc = getContract({
  //           client,
  //           address: usdcAddress,
  //           abi: [...erc20Abi, ...eip2612Abi],
  //         });
  //         const paymaster = baseSepoliaPaymaster;
  //         const paymasterData = encodePacked(
  //           ["uint8", "address", "uint256", "bytes"],
  //           [
  //             0, // Reserved for future use
  //             usdc.address, // Token address
  //             MAX_GAS_USDC, // Max spendable gas in USDC
  //             permitSignature, // EIP-2612 permit signature
  //           ],
  //         );

  //         const additionalGasCharge = hexToBigInt(
  //           (
  //             await client.call({
  //               to: paymaster,
  //               data: encodeFunctionData({
  //                 abi: parseAbi(["function additionalGasCharge() returns (uint256)"]),
  //                 functionName: "additionalGasCharge",
  //               }),
  //             })
  //           ).data as `0x${string}`,
  //         );

  //         console.log("Additional gas charge (paymasterPostOpGasLimit):", additionalGasCharge);

  // const pimlicoUrl = `https://api.pimlico.io/v2/84532/rpc?apikey=pim_bX6KsbhcEy33vSXdhx3YsX`;

  // const bundlerClient = createPimlicoClient({
  //   transport: http(pimlicoUrl),
  //   entryPoint: {
  //     address: entryPoint07Address,
  //     version: "0.7",
  //   },
  // });

  //         const { standard: fees } = await bundlerClient.request({
  //           method: "pimlico_getUserOperationGasPrice",
  //           params: [],
  //         });

  //         const maxFeePerGas = hexToBigInt(fees.maxFeePerGas);
  //         const maxPriorityFeePerGas = hexToBigInt(fees.maxPriorityFeePerGas);

  //         console.log("Max fee per gas:", maxFeePerGas);
  //         console.log("Max priority fee per gas:", maxPriorityFeePerGas);
  //         console.log("Estimating user op gas limits...");
  //         // const smartAccount = await toSimpleSmartAccount({
  //         //   client,
  //         //   owner: {
  //         //     address: connectedAddress! as `0x${string}`,
  //         //     signMessage: async ({ message }: { message: SignableMessage }) => {
  //         //       if (!walletClient) throw new Error("Wallet client not available");
  //         //       return walletClient.signMessage({ message });
  //         //     },
  //         //     signTypedData: async (typedData: any) => {
  //         //       if (!walletClient) throw new Error("Wallet client not available");
  //         //       return walletClient.signTypedData(typedData);
  //         //     },
  //         //     signTransaction: async () => {
  //         //       throw new Error("signTransaction not implemented");
  //         //     },
  //         //     source: "custom",
  //         //     type: "local" as const,
  //         //     publicKey: "0x" as `0x${string}`,
  //         //   },
  //         //   entryPoint: {
  //         //     address: entryPoint07Address,
  //         //     version: "0.7",
  //         //   },
  //         // });
  //         // console.log("smartAccount", smartAccount);

  //         const smartAccount = {
  //           address: connectedAddress as `0x${string}`,
  //           client,
  //           entryPoint: {
  //             address: entryPoint07Address,
  //             version: "0.7" as const,
  //           },
  //           async encodeCalls(calls: any) {
  //             return encodeFunctionData({
  //               abi: [
  //                 {
  //                   inputs: [
  //                     { internalType: "address[]", name: "dest", type: "address[]" },
  //                     { internalType: "bytes[]", name: "func", type: "bytes[]" },
  //                   ],
  //                   name: "executeBatch",
  //                   outputs: [],
  //                   stateMutability: "nonpayable",
  //                   type: "function",
  //                 },
  //               ],
  //               functionName: "executeBatch",
  //               args: [calls.map((call: any) => call.to), calls.map((call: any) => call.data)],
  //             });
  //           },
  //           async signUserOperation() {
  //             return walletClient?.signTransaction({
  //               userOperation: {
  //                 calls: calls.map((call: any) => ({
  //                   to: call.to,
  //                   data: call.data,
  //                 })),
  //               },
  //             });
  //           },
  //           async getNonce() {
  //             // Try to get the actual nonce from the entrypoint contract
  //             try {
  //               const nonce = await client.readContract({
  //                 address: entryPoint07Address,
  //                 abi: [
  //                   {
  //                     inputs: [
  //                       { name: "sender", type: "address" },
  //                       { name: "key", type: "uint192" },
  //                     ],
  //                     name: "getNonce",
  //                     outputs: [{ name: "nonce", type: "uint256" }],
  //                     stateMutability: "view",
  //                     type: "function",
  //                   },
  //                 ],
  //                 functionName: "getNonce",
  //                 args: [connectedAddress as `0x${string}`, 0n],
  //               });
  //               return nonce;
  //             } catch (e) {
  //               console.error("Error getting nonce:", e);
  //               return 0n;
  //             }
  //           },
  //           async getStubSignature() {
  //             return "0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c";
  //           },
  //           async isDeployed() {
  //             return true;
  //           },
  //           async getFactoryArgs() {
  //             return {};
  //           },
  //           type: "smart" as const,
  //         };

  //         const {
  //           callGasLimit,
  //           preVerificationGas,
  //           verificationGasLimit,
  //           paymasterPostOpGasLimit,
  //           paymasterVerificationGasLimit,
  //         } = await bundlerClient.estimateUserOperationGas({
  //           account: smartAccount,

  //           calls: calls.map(data => ({
  //             to: usdcAddress as `0x${string}`,
  //             data,
  //             value: 0n,
  //           })),
  //           paymaster,
  //           paymasterData,
  //           // Make sure to pass in the `additionalGasCharge` from the paymaster
  //           paymasterPostOpGasLimit: additionalGasCharge,
  //           // Use very low gas fees for estimation to ensure successful permit/transfer,
  //           // since the bundler will simulate the user op with very high gas limits
  //           maxFeePerGas: 1n,
  //           maxPriorityFeePerGas: 1n,
  //         });

  //         console.log("Call gas limit:", callGasLimit);
  //         console.log("Pre-verification gas:", preVerificationGas);
  //         console.log("Verification gas limit:", verificationGasLimit);
  //         console.log("Paymaster post op gas limit:", paymasterPostOpGasLimit);
  //         console.log("Paymaster verification gas limit:", paymasterVerificationGasLimit);
  //       } catch (error) {
  //         console.error("Error parsing signature:", error);
  //       }
  //     })();
  //   }
  // }, [data]);

  // ----------------------------------------------------------------
  // ---------------- PARTiCLE NETWORK ------------------------------
  // ----------------------------------------------------------------

  // Standard, EOA-based 1193 provider

  const smartAccount = new SmartAccount(provider, {
    projectId: "9ae6af3e-1582-4f35-891e-b00395c935f0",
    clientKey: "c2pE7GIHe5A8qkWV2BwaFKxve0XxKHSzvvctmmth",
    appId: "f1348e30-dbcb-4532-9a18-ae60a27588ed",
    aaOptions: {
      accountContracts: {
        SIMPLE: [{ chainIds: [BaseSepolia.id], version: "1.0.0" }],
        // BICONOMY: [{ chainIds: [BaseSepolia.id], version: '1.0.0' }]
        // BICONOMY: [{ chainIds: [BaseSepolia.id], version: '2.0.0' }]
        // LIGHT: [{ chainIds: [BaseSepolia.id], version: '1.0.0' }]
        // CYBERCONNECT: [{ chainIds: [BaseSepolia.id], version: '1.0.0' }]
      },
    },
  });

  const customProvider = new ethers.providers.Web3Provider(
    new AAWrapProvider(smartAccount, SendTransactionMode.Gasless),
    "any",
  );

  const handleLogin = async (authType: any) => {
    if (!userInfo) {
      await connect({
        socialType: authType,
        chain: BaseSepolia,
      });
    }
  };

  const executeUserOp = async () => {
    const tx: Transaction = {
      to: "0x000000000000000000000000000000000000dEaD",
      value: ethers.utils.parseEther("0.00001").toString(),
    };
    const txs = [tx, tx];
    const feeQuotesResult = await smartAccount.getFeeQuotes(txs);

    const userOpBundle = await smartAccount.buildUserOperation({ tx: txs });
    const txHash = await smartAccount.sendUserOperation({
      userOp: userOpBundle.userOp,
      userOpHash: userOpBundle.userOpHash,
    });
    console.log("txHash", txHash);
    // const signer = customProvider.getSigner();

    // const txResponse = await signer.sendTransaction(tx);
    // const txReceipt = await txResponse.wait();

    // return txReceipt.transactionHash;
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

      console.log("approveResponse", approveResponse.data, address);

      const approveData: ApproveResponse = approveResponse.data;

      // 2. Get swap transaction data
      const sourceDecimals = tokens[sourceToken]?.decimals || 18;
      const amountInWei = BigInt(parseFloat(amount) * 10 ** sourceDecimals).toString();

      const swapResponse = await axios.get(`/api/proxy/8453/swap`, {
        params: {
          src: sourceToken,
          dst: destinationToken,
          amount: amountInWei,
          from: await smartAccount.getAddress(),
          origin: await smartAccount.getAddress(),
          slippage: 1, // 1% slippage
          disableEstimate: true, // Disable onchain simulation for smart accounts
        },
      });

      console.log("swapResponse", swapResponse.data);

      const swapData: SwapResponse = swapResponse.data;

      // 3. Batch the transactions using your smart account
      // sendCalls({
      //   calls: [
      //     {
      //       to: approveData.to as `0x${string}`,
      //       data: approveData.data as `0x${string}`,
      //       value: 0n,
      //     },
      //     {
      //       to: swapData.tx.to as `0x${string}`,
      //       data: swapData.tx.data as `0x${string}`,
      //       value: BigInt(swapData.tx.value || "0"),
      //     },
      //   ],
      // });
      const userOpBundle = await smartAccount.buildUserOperation({
        tx: [
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
        ],
      });
      const txHash = await smartAccount.sendUserOperation({
        userOp: userOpBundle.userOp,
        userOpHash: userOpBundle.userOpHash,
      });
      console.log("txHash", txHash);

      console.log("Swap transaction submitted!");
    } catch (error) {
      console.error("Error executing swap:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{ marginTop: 60, maxWidth: "800px", margin: "0 auto", padding: "20px" }}>
        <div onClick={() => handleLogin("google")} className="p-10 bg-red-300">
          Particle Logic
        </div>
        <div className="App">
          <div className="logo-section">
            <img src="https://i.imgur.com/EerK7MS.png" alt="Logo 1" className="logo logo-big" />
            <img src="https://i.imgur.com/1RV3pMV.png" alt="Logo 2" className="logo" />
          </div>
          {!userInfo ? (
            <div className="login-section">
              <button className="sign-button" onClick={() => handleLogin("google")}>
                Sign in with Google
              </button>
              <button className="sign-button" onClick={() => handleLogin("twitter")}>
                Sign in with Twitter
              </button>
            </div>
          ) : (
            <div className="profile-card">
              <h2>{userInfo.name}</h2>
              <div className="button-section">
                <button className="sign-message-button" onClick={executeUserOp}>
                  Execute User Operation
                </button>
                <button className="disconnect-button" onClick={() => disconnect()}>
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
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
            <button className="p-4 bg-red-300" onClick={handleTemp} type="button">
              Create Account
            </button>
            <button className="p-4 bg-red-300" onClick={handlePermit} type="button">
              Sign Permit
            </button>
            <button className="p-4 bg-red-300" onClick={handleTemp2} type="button">
              Tmp2
            </button>
            <button className="p-4 bg-red-300" onClick={signEip7702} type="button">
              Sign Eip7702
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
