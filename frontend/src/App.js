import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ethers } from "ethers";

import "./App.css";
import MarketplaceView from "./views/MarketplaceView";
import ProductDetail from "./components/marketplace/ProductDetail";
import RailgunInitializationTest from "./components/railgun/RailgunInitializationTest";

function App() {
  const [provider, setProvider] = useState(null);
  const [myAddress, setMyAddress] = useState(null);

  useEffect(() => {
    const init = async () => {
      if (window.ethereum) {
        const p = new ethers.BrowserProvider(window.ethereum);
        const signer = await p.getSigner();
        const address = await signer.getAddress();
        setProvider(p);
        setMyAddress(address.toLowerCase());

        window.ethereum.on("accountsChanged", (accounts) => {
          if (accounts.length > 0) {
            setMyAddress(accounts[0].toLowerCase());
          } else {
            setMyAddress(null);
          }
        });

        window.ethereum.on("chainChanged", () => {
          window.location.reload();
        });
      } else {
        console.warn("MetaMask not found");
      }
    };

    init();
  }, []);

  const backendUrl = "http://localhost:5000";

  if (!provider || !myAddress) return <div>Connecting wallet...</div>;

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="App">
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
