import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ethers } from "ethers";

import "./App.css";
import MarketplaceView from "./views/MarketplaceView";
import ProductDetail from "./components/marketplace/ProductDetail";
import RailgunInitializationTest from "./components/railgun/RailgunInitializationTest";
import FlowTimingPanel from "./components/shared/FlowTimingPanel";

function App() {
  const [provider, setProvider] = useState(null);
  const [myAddress, setMyAddress] = useState(null);

  useEffect(() => {
    if (!window.ethereum) {
      console.warn("MetaMask not found");
      return undefined;
    }

    let cancelled = false;

    const syncWalletState = async (accounts = null) => {
      const nextProvider = new ethers.BrowserProvider(window.ethereum);
      const nextAddress =
        Array.isArray(accounts) && accounts.length > 0
          ? accounts[0]
          : await nextProvider.send("eth_accounts", []);

      if (cancelled) return;

      setProvider(nextProvider);
      setMyAddress(
        Array.isArray(nextAddress)
          ? (nextAddress[0] ? nextAddress[0].toLowerCase() : null)
          : (nextAddress ? nextAddress.toLowerCase() : null)
      );
    };

    const init = async () => {
      await syncWalletState();
    };

    init();

    const handleAccountsChanged = (accounts) => {
      syncWalletState(accounts).catch((error) => {
        console.error("Failed to sync wallet after account change:", error);
        setMyAddress(null);
      });
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      cancelled = true;
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  const backendUrl = "http://localhost:5000";

  if (!provider || !myAddress) return <div>Connecting wallet...</div>;

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="App">
        <FlowTimingPanel />
        <Routes>
          <Route
            path="/"
            element={
              <MarketplaceView
                myAddress={myAddress}
                provider={provider}
                backendUrl={backendUrl}
              />
            }
          />
          <Route
            path="/product/:address"
            element={
              <ProductDetail
                provider={provider}
                currentUser={myAddress}
              />
            }
          />
          <Route
            path="/railgun-test"
            element={<RailgunInitializationTest />}
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
