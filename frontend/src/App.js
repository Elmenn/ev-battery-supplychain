import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ethers } from "ethers";

import "./App.css";
import MarketplaceView from "./views/MarketplaceView";
import ProductDetail from "./components/marketplace/ProductDetail";
import RailgunInitializationTest from "./components/railgun/RailgunInitializationTest";
import { getCurrentCid } from "./utils/web3Utils";
import { uploadJson } from "./utils/ipfs";
import { signVcWithMetamask } from "./utils/signVcWithMetamask";
import { buildStage3VC } from "./utils/vcBuilder.mjs";
import { generateTxHashCommitmentBindingTag } from "./utils/commitmentUtils";
import ProductEscrowABI from "./abis/ProductEscrow_Initializer.json";


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
      await tx.wait(); // Wait for confirmation

      // Generate TX hash commitment for privacy (Step 4) with binding tag (Feature 2)
      console.log('[Flow][Buyer] Step 4 → Generating delivery TX hash commitment with binding tag...');
      
      // Retrieve binding tag from localStorage (stored during purchase)
      let bindingTag = null;
      try {
        const bindingTagKey = `tx_hash_binding_tag_${product.address}`;
        const storedBindingTag = localStorage.getItem(bindingTagKey);
        if (storedBindingTag) {
          bindingTag = storedBindingTag;
          console.log('[Flow][Buyer] Step 4 → Retrieved binding tag from localStorage');
        } else {
          // Generate binding tag if not found (fallback)
          const buyerAddr = await signer.getAddress();
          const chainId = await provider.getNetwork().then(n => n.chainId);
          let productId;
          try {
            productId = await contract.id();
          } catch (error) {
            console.warn("⚠️ Could not fetch product ID for binding tag:", error);
            productId = null;
          }
          
          if (productId !== null) {
            try {
              bindingTag = `0x${generateTxHashCommitmentBindingTag({
                chainId: chainId.toString(),
                escrowAddr: product.address,
                productId: productId.toString(),
                buyerAddress: buyerAddr,
              })}`;
              console.log('[Flow][Buyer] Step 4 → Generated binding tag for delivery TX hash commitment');
            } catch (err) {
              console.warn("⚠️ Failed to generate binding tag:", err);
              // Continue without binding tag (backward compatible)
            }
          }
        }
      } catch (err) {
        console.warn("⚠️ Failed to retrieve/generate binding tag:", err);
        // Continue without binding tag (backward compatible)
      }

      const zkpBackendUrl = process.env.REACT_APP_ZKP_BACKEND_URL || 'http://localhost:5010';
      const requestBody = {
        tx_hash: tx.hash,
        ...(bindingTag ? { binding_tag_hex: bindingTag } : {}),
      };

      const zkpRes = await fetch(`${zkpBackendUrl}/zkp/commit-tx-hash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const { commitment: txCommitment, proof: txProof, verified: txVerified } = await zkpRes.json();
      if (!txVerified) {
        alert("❌ TX hash commitment verification failed");
        return;
      }

      // Extract price ZKP proof from stage2 (if it exists)
      let priceZkpProof = null;
      try {
        const stage2Price = typeof stage2.credentialSubject?.price === 'string' 
          ? JSON.parse(stage2.credentialSubject.price) 
          : stage2.credentialSubject?.price;
        if (stage2Price?.zkpProof) {
          priceZkpProof = stage2Price.zkpProof;
        }
      } catch (e) {
        console.warn("Could not extract price ZKP proof from stage2:", e);
      }

      const finalVC = buildStage3VC({
        stage2,
        stage2Cid, // ✅ Stage 2 VC CID for linear chain S0→S1→S2
        buyerProof,
        txHashCommitment: { // Store TX hash commitment (separate from price ZKP)
          commitment: txCommitment,
          proof: txProof,
          protocol: "bulletproofs-pedersen",
          version: "1.0",
          encoding: "hex",
          ...(bindingTag ? { bindingTag: bindingTag } : {}), // Feature 2: Include binding tag
        },
        zkpProof: priceZkpProof, // Use price ZKP proof from stage2 (if available)
      });

      // 1) upload the FINAL VC (with ZKP) to Pinata
      const finalCid = await uploadJson(finalVC);
      console.log('[Flow][Buyer] Step 4 → Final VC uploaded to IPFS:', finalCid);

      alert("📡 Storing final VC CID on-chain with TX hash commitment…");

      // 2) Use updateVcCidAfterDelivery with TX hash commitment (Feature 1: Transaction Verification)
      // Convert commitment hex string to bytes32
      // The commitment from ZKP backend should be a hex string (with or without 0x prefix)
      let txCommitmentHex = txCommitment.startsWith('0x') ? txCommitment : `0x${txCommitment}`;
      // Ensure it's exactly 32 bytes (64 hex chars + 0x = 66 chars total)
      const commitmentBytes = ethers.getBytes(txCommitmentHex);
      if (commitmentBytes.length !== 32) {
        // Pad or truncate to 32 bytes
        const padded = new Uint8Array(32);
        padded.set(commitmentBytes.slice(0, 32), 0);
        txCommitmentHex = ethers.hexlify(padded);
      }
      const txUpdate = await contract.updateVcCidAfterDelivery(finalCid, txCommitmentHex);
      await txUpdate.wait();                    // ⏳ ← critical!
      console.log('[Flow][Buyer] Step 4 → Final VC CID and TX hash commitment stored on-chain');

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
                onConfirmDelivery={handleDelivery}
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
