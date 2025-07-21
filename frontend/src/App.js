import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ethers } from "ethers";
import "./App.css";
import MarketplaceView from "./views/MarketplaceView";
import ProductDetail from "./components/marketplace/ProductDetail";
import { getCurrentCid } from "./utils/web3Utils";
import { uploadJson } from "./utils/ipfs";
import { signVcWithMetamask } from "./utils/signVcWithMetamask";
import { buildStage3VC } from "./utils/vcBuilder";
import ProductEscrowABI from "./abis/ProductEscrow.json";

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

        // ✅ Listen to wallet/account/network changes
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

  // ✅ Confirm delivery handler (Option B)
  const handleDelivery = async (product) => {
    try {
      console.log("🚚 Starting delivery for:", product.name);

      const signer = await provider.getSigner();
      const stage2Cid = await getCurrentCid(product.address);
      const stage2 = await (await fetch(`https://ipfs.io/ipfs/${stage2Cid}`)).json();

      const buyerProof = await signVcWithMetamask(stage2, signer);

      const provisionalVC = {
        ...stage2,
        proofs: {
          ...stage2.proofs,
          holderProof: buyerProof,
        },
        credentialSubject: {
          ...stage2.credentialSubject,
          vcHash: buyerProof.payloadHash,
        },
      };
      const provisionalCid = await uploadJson(provisionalVC);

      const contract = new ethers.Contract(product.address, ProductEscrowABI.abi, signer);
      const tx = await contract.confirmDelivery(provisionalCid);

      const zkpRes = await fetch("http://localhost:5010/zkp/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tx_hash: tx.hash }),
      });

      const { commitment, proof, verified } = await zkpRes.json();
      if (!verified) {
        alert("❌ ZKP verification failed");
        return;
      }

      const finalVC = buildStage3VC({
        stage2,
        buyerProof,
        zkpProof: {
          protocol: "bulletproofs-pedersen",
          version: "1.0",
          commitment,
          proof,
          encoding: "hex",
        },
      });

      // 1) upload the FINAL VC (with ZKP) to Pinata
      const finalCid = await uploadJson(finalVC);

      alert("📡 Storing final VC CID on-chain…");

      // 2) wait for updateVcCid() CONFIRMATION before moving on
      const txUpdate = await contract.updateVcCid(finalCid);
      await txUpdate.wait();                    // ⏳ ← critical!

      alert.success("✅ Delivery confirmed & VC updated!");

      // 3) hard-reload the ProductDetail page so it picks up the new CID
      if (window.location.pathname.startsWith("/product/")) {
        window.location.reload();
      }
      } catch (err) {
        console.error("❌ Delivery confirmation failed", err);
        alert.error("❌ Delivery failed");
      }

        };

  if (!provider || !myAddress) return <div>⏳ Connecting wallet…</div>;

  return (
    <BrowserRouter>
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
                onConfirmDelivery={handleDelivery}
              />
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
