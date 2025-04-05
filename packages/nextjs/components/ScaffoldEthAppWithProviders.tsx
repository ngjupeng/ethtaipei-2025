"use client";

import { useEffect, useState } from "react";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { DynamicContextProvider, DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { DynamicWagmiConnector } from "@dynamic-labs/wagmi-connector";
import { AuthType } from "@particle-network/auth-core";
import { AuthCoreContextProvider } from "@particle-network/auth-core-modal";
import { BaseSepolia } from "@particle-network/chains";
import { PermissionlessProvider } from "@permissionless/wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { useTheme } from "next-themes";
import { Toaster } from "react-hot-toast";
import { baseSepolia } from "viem/chains";
import { WagmiProvider } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { useInitializeNativeCurrencyPrice } from "~~/hooks/scaffold-eth";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  useInitializeNativeCurrencyPrice();

  return (
    <>
      <div className={`flex flex-col min-h-screen `}>
        <Header />
        <main className="relative flex flex-col flex-1">{children}</main>
        <Footer />
      </div>
      <Toaster />
    </>
  );
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export const ScaffoldEthAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const pimlicoApiKey = "pim_bX6KsbhcEy33vSXdhx3YsX";

  const capabilities = {
    paymasterService: {
      [baseSepolia.id]: {
        url: `https://api.pimlico.io/v2/${baseSepolia.id}/rpc?apikey=${pimlicoApiKey}`,
      },
    },
  };

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ProgressBar height="3px" color="#2299dd" />
        <RainbowKitProvider
          avatar={BlockieAvatar}
          theme={mounted ? (isDarkMode ? darkTheme() : lightTheme()) : lightTheme()}
        >
          <PermissionlessProvider capabilities={capabilities}>
            <DynamicContextProvider
              settings={{
                // Find your environment id at https://app.dynamic.xyz/dashboard/developer/api
                environmentId: "c97b352f-a576-4b63-bfe3-ed793c1e2ef2",
                walletConnectors: [EthereumWalletConnectors],
              }}
            >
              <DynamicWagmiConnector>
                <AuthCoreContextProvider
                  options={{
                    projectId: "9ae6af3e-1582-4f35-891e-b00395c935f0",
                    clientKey: "c2pE7GIHe5A8qkWV2BwaFKxve0XxKHSzvvctmmth",
                    appId: "f1348e30-dbcb-4532-9a18-ae60a27588ed",
                    erc4337: {
                      // The name of the smart account you'd like to use
                      // SIMPLE, BICONOMY, LIGHT, or CYBERCONNECT
                      name: "SIMPLE",
                      // The version of the smart account you're using
                      // 1.0.0 for everything except Biconomy, which can be either 1.0.0 or 2.0.0
                      version: "1.0.0",
                    },
                    wallet: {
                      // Set to false to remove the embedded wallet modal
                      visible: true,
                      customStyle: {
                        // Locks the chain selector to Base Sepolia
                        supportChains: [BaseSepolia],
                      },
                    },
                  }}
                >
                  {" "}
                  <DynamicWidget />
                  <ScaffoldEthApp>{children}</ScaffoldEthApp>
                </AuthCoreContextProvider>
              </DynamicWagmiConnector>
            </DynamicContextProvider>
          </PermissionlessProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
