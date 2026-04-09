import React, { useEffect, useState } from "react";
import { BrowserRouter, NavLink, Routes, Route } from "react-router-dom";
import { ethers } from "ethers";

import "./App.css";
import Erc7984ActionWorkbench from "./components/erc7984/Erc7984ActionWorkbench";
import Erc7984Home from "./components/erc7984/Erc7984Home";
import Erc7984VrcWorkbench from "./components/erc7984/Erc7984VrcWorkbench";
import Erc7984AuditorVerifier from "./components/marketplace/Erc7984AuditorVerifier";
import Erc7984SellerOrderDetail from "./components/marketplace/Erc7984SellerOrderDetail";
import Erc7984TransporterJobDetail from "./components/marketplace/Erc7984TransporterJobDetail";
import ProductDetail from "./components/marketplace/ProductDetail";
import MarketplaceView from "./views/MarketplaceView";
import SellerOrdersView from "./views/SellerOrdersView";
import TransporterJobsView from "./views/TransporterJobsView";

function App() {
  const [provider, setProvider] = useState(null);
  const [myAddress, setMyAddress] = useState(null);
  const backendUrl = process.env.REACT_APP_VC_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

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

  if (!provider || !myAddress) return <div>Connecting wallet...</div>;

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="App">
        <div className="border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Marketplace + Debug</div>
              <div className="text-lg font-semibold text-slate-900">EV Battery Supply Chain</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <NavLink
                to="/"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 ${isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`
                }
              >
                Marketplace
              </NavLink>
              <NavLink
                to="/seller/orders"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 ${isActive ? "bg-amber-700 text-white" : "text-slate-600 hover:bg-slate-100"}`
                }
              >
                Seller Orders
              </NavLink>
              <NavLink
                to="/transporter/jobs"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 ${isActive ? "bg-cyan-700 text-white" : "text-slate-600 hover:bg-slate-100"}`
                }
              >
                Transport Jobs
              </NavLink>
              <NavLink
                to="/erc7984"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 ${isActive ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`
                }
              >
                ERC-7984 Home
              </NavLink>
              <NavLink
                to="/erc7984/actions"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 ${isActive ? "bg-cyan-900 text-white" : "text-slate-600 hover:bg-slate-100"}`
                }
              >
                ERC-7984 Actions
              </NavLink>
              <NavLink
                to="/erc7984/vrc"
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 ${isActive ? "bg-cyan-700 text-white" : "text-slate-600 hover:bg-slate-100"}`
                }
              >
                ERC-7984 VRC
              </NavLink>
            </div>
          </div>
        </div>
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
            path="/marketplace"
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
            path="/product/:address/verify"
            element={
              <Erc7984AuditorVerifier
                provider={provider}
              />
            }
          />
          <Route
            path="/seller/orders"
            element={
              <SellerOrdersView
                provider={provider}
                currentUser={myAddress}
              />
            }
          />
          <Route
            path="/seller/orders/:address"
            element={
              <Erc7984SellerOrderDetail
                provider={provider}
                currentUser={myAddress}
              />
            }
          />
          <Route
            path="/transporter/jobs"
            element={
              <TransporterJobsView
                provider={provider}
                currentUser={myAddress}
              />
            }
          />
          <Route
            path="/transporter/jobs/:address"
            element={
              <Erc7984TransporterJobDetail
                provider={provider}
                currentUser={myAddress}
              />
            }
          />
          <Route
            path="/erc7984"
            element={
              <Erc7984Home
                currentUser={myAddress}
              />
            }
          />
          <Route
            path="/erc7984/actions"
            element={
              <Erc7984ActionWorkbench
                provider={provider}
                currentUser={myAddress}
              />
            }
          />
          <Route
            path="/erc7984/vrc"
            element={
              <Erc7984VrcWorkbench
                provider={provider}
                currentUser={myAddress}
              />
            }
          />
          <Route
            path="*"
            element={
              <MarketplaceView
                myAddress={myAddress}
                provider={provider}
                backendUrl={backendUrl}
              />
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
