import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import RailgunConnectionButton from "./RailgunConnectionButton";
import PrivateFundsDrawer from "./PrivateFundsDrawer";
import { getEscrowContract } from "../../utils/escrowHelpers";
import { decodeContractError, getExplorerUrl } from "../../utils/errorHandler";
import { NetworkName, NETWORK_CONFIG } from "@railgun-community/shared-models";
import { connectRailgun, refreshBalances, getAllBalances, privateTransfer, checkWalletState } from "../../lib/railgun-clean";
import { getProductMeta } from "../../utils/productMetaApi";
import { generateX25519Keypair } from "../../utils/ecies";
import { getOrderAttestation } from "../../utils/buyerSecretApi";
import { getLatestOrderForProductBuyer, saveOrderRecoveryBundle, updateOrderStatus } from "../../utils/orderApi";
import { assertScalarValue, computeOrderContextHash, generateOrderId, generateRandomBlinding, multiplyIntegerStrings, normalizeBytes32Hex, normalizeIntegerString } from "../../utils/commitmentUtils";
import { generateQuantityTotalProof, generateTotalPaymentEqualityProof } from "../../utils/equalityProofClient";
import { generateScalarCommitmentWithBlinding } from "../../utils/zkp/zkpClient";

const MSG = "EV Supply Chain Buyer Privacy Key v1";
const SEPOLIA_WETH_ADDRESS = NETWORK_CONFIG[NetworkName.EthereumSepolia]?.baseToken?.wrappedAddress || "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const STEPS = ["connect", "pay", "recording", "complete"];

function StepPill({ label, active, done }) {
  const cls = done ? "bg-green-600 text-white" : active ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600";
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${cls}`}>{label}</span>;
}

function CopyLine({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-gray-500">{label}:</span>
      <code className="truncate rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">{value.slice(0, 10)}...{value.slice(-8)}</code>
      <button className="text-xs text-blue-600 hover:text-blue-800" onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}>{copied ? "Copied!" : "Copy"}</button>
    </div>
  );
}

async function encryptBlob(plaintext, signature, aad) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(signature), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(aad) },
    key,
    encoder.encode(JSON.stringify(plaintext))
  );
  return { ciphertext: Array.from(new Uint8Array(cipher)), iv: Array.from(iv), salt: Array.from(salt), aad, version: "2.0" };
}

const PrivatePaymentModal = ({ product, isOpen, onClose, onSuccess, currentUser }) => {
  const [step, setStep] = useState("connect");
  const [quantity, setQuantity] = useState("");
  const [privateBalance, setPrivateBalance] = useState(0n);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [showFundsDrawer, setShowFundsDrawer] = useState(false);
  const [sellerRailgunAddress, setSellerRailgunAddress] = useState("");
  const [unitPriceWei, setUnitPriceWei] = useState("");
  const [unitPriceHash, setUnitPriceHash] = useState("");
  const [pendingOrder, setPendingOrder] = useState(null);

  const currentStepIndex = STEPS.indexOf(step);
  const quantityValue = useMemo(() => {
    try {
      return quantity ? normalizeIntegerString(quantity, "quantity") : null;
    } catch {
      return null;
    }
  }, [quantity]);
  const totalWei = useMemo(() => {
    if (!unitPriceWei || !quantityValue) return null;
    try {
      return multiplyIntegerStrings(unitPriceWei, quantityValue, "orderTotal");
    } catch {
      return null;
    }
  }, [quantityValue, unitPriceWei]);
  const hasEnough = totalWei != null && privateBalance >= BigInt(totalWei);

  const syncBalance = useCallback(async () => {
    await refreshBalances();
    const balances = await getAllBalances();
    const weth = balances?.data?.railgun?.weth ?? 0n;
    setPrivateBalance(BigInt(weth));
    return BigInt(weth);
  }, []);

  const hydrateListingData = useCallback(async () => {
    if (!product?.address) return;
    const dbData = await getProductMeta(product.address);
    setUnitPriceWei(String(dbData?.unitPriceWei || ""));
    setUnitPriceHash(String(dbData?.unitPriceHash || product?.unitPriceHash || ""));
    setSellerRailgunAddress(String(dbData?.sellerRailgunAddress || ""));

    if (currentUser) {
      const latestOrder = await getLatestOrderForProductBuyer(product.address, currentUser);
      if (latestOrder?.status === "payment_pending_recording") {
        const latestAttestation = await getOrderAttestation(latestOrder.orderId);
        const recoveredPending = {
          ...latestOrder,
          disclosurePubkey: latestAttestation?.disclosurePubkey || null,
          encryptedBlob: latestAttestation?.encryptedBlob || null,
          encryptedQuantityOpening: latestAttestation?.encryptedQuantityOpening || null,
          encryptedTotalOpening: latestAttestation?.encryptedTotalOpening || null,
          quantityTotalProof: latestAttestation?.quantityTotalProof || null,
          paymentEqualityProof: latestAttestation?.paymentEqualityProof || null,
        };
        setPendingOrder(recoveredPending);
        setResult(recoveredPending);
      }
    }
  }, [currentUser, product?.address, product?.unitPriceHash]);

  const preflight = useCallback(async () => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = getEscrowContract(product.address, signer);
    const [phase, purchased, activeOrderId, productId] = await Promise.all([
      contract.phase(),
      contract.purchased(),
      contract.activeOrderId(),
      contract.id(),
    ]);
    if (Number(phase) !== 0 || purchased) throw new Error("Product is no longer available.");
    if (activeOrderId !== ethers.ZeroHash) throw new Error("An active order already exists for this product.");
    return { signer, contract, productId: String(productId) };
  }, [product.address]);

  const normalizeOrderPayload = useCallback((payload) => ({
    ...payload,
    orderId: normalizeBytes32Hex(payload.orderId, "orderId"),
    memoHash: normalizeBytes32Hex(payload.memoHash, "memoHash"),
    railgunTxRef: normalizeBytes32Hex(payload.railgunTxRef, "railgunTxRef"),
    unitPriceHash: normalizeBytes32Hex(payload.unitPriceHash, "unitPriceHash"),
    quantityCommitment: normalizeBytes32Hex(payload.quantityCommitment, "quantityCommitment"),
    totalCommitment: normalizeBytes32Hex(payload.totalCommitment, "totalCommitment"),
    paymentCommitment: normalizeBytes32Hex(payload.paymentCommitment, "paymentCommitment"),
    contextHash: normalizeBytes32Hex(payload.contextHash, "contextHash"),
  }), []);

  const saveRecoveryBundle = useCallback(async (payload, status = "payment_pending_recording") => {
    const normalized = normalizeOrderPayload(payload);
    return saveOrderRecoveryBundle({
      order: {
        orderId: normalized.orderId,
        productAddress: product.address,
        productId: normalized.productId,
        escrowAddress: product.address,
        chainId: normalized.chainId,
        sellerAddress: product.owner,
        buyerAddress: normalized.buyerAddress,
        status,
        memoHash: normalized.memoHash,
        railgunTxRef: normalized.railgunTxRef,
        unitPriceWei: normalized.unitPriceWei,
        unitPriceHash: normalized.unitPriceHash,
        quantityCommitment: normalized.quantityCommitment,
        quantityProof: {
          proof: normalized.quantityCommitmentProof ?? null,
          proofType: normalized.quantityCommitmentProofType || "pedersen-scalar-v2",
        },
        totalCommitment: normalized.totalCommitment,
        totalProof: {
          proof: normalized.totalCommitmentProof ?? null,
          proofType: normalized.totalCommitmentProofType || "pedersen-scalar-v2",
        },
        paymentCommitment: normalized.paymentCommitment,
        paymentProof: {
          proof: normalized.paymentCommitmentProof ?? null,
          proofType: normalized.paymentCommitmentProofType || "pedersen-scalar-v2",
        },
        contextHash: normalized.contextHash,
      },
      attestation: {
        orderId: normalized.orderId,
        productAddress: product.address,
        buyerAddress: normalized.buyerAddress,
        encryptedBlob: normalized.encryptedBlob,
        disclosurePubkey: normalized.disclosurePubkey,
        encryptedQuantityOpening: normalized.encryptedQuantityOpening,
        encryptedTotalOpening: normalized.encryptedTotalOpening,
        quantityTotalProof: normalized.quantityTotalProof,
        paymentEqualityProof: normalized.paymentEqualityProof,
        proofBundle: {
          quantityTotalProof: normalized.quantityTotalProof,
          paymentEqualityProof: normalized.paymentEqualityProof,
        },
      },
    });
  }, [normalizeOrderPayload, product.address, product.owner]);

  useEffect(() => {
    if (!isOpen) return;
    setStep("connect");
    setError("");
    setProgress("");
    setResult(null);
    setPendingOrder(null);
    hydrateListingData();
    (async () => {
      try {
        const state = await checkWalletState(currentUser);
        if (state?.success && state?.data?.walletID) {
          await syncBalance();
          setStep("pay");
        }
      } catch {
        // keep connect step
      }
    })();
  }, [currentUser, hydrateListingData, isOpen, syncBalance]);

  const recordOnChain = useCallback(async (payload) => {
    const { contract } = await preflight();
    const normalized = normalizeOrderPayload(payload);
    const gasEstimate = await contract.recordPrivateOrderPayment.estimateGas(
      normalized.orderId, normalized.memoHash, normalized.railgunTxRef, normalized.quantityCommitment, normalized.totalCommitment, normalized.paymentCommitment, normalized.contextHash
    );
    const tx = await contract.recordPrivateOrderPayment(
      normalized.orderId, normalized.memoHash, normalized.railgunTxRef, normalized.quantityCommitment, normalized.totalCommitment, normalized.paymentCommitment, normalized.contextHash,
      { gasLimit: (gasEstimate * 120n) / 100n }
    );
    await tx.wait();
    return tx.hash;
  }, [normalizeOrderPayload, preflight]);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const res = await connectRailgun({ userAddress: currentUser });
      if (!res?.success) throw new Error(res?.error || "Could not connect Railgun.");
      await syncBalance();
      setStep("pay");
      toast.success("Railgun connected.");
    } catch (err) {
      toast.error(err.message || "Connection failed.");
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (!quantityValue || !totalWei || !unitPriceWei || !unitPriceHash) {
      toast.error("Quantity or listing price data is missing.");
      return;
    }
    setLoading(true);
    setError("");
    let transferResult = null;
    try {
      const { signer, productId } = await preflight();
      const buyerAddress = await signer.getAddress();
      const network = await signer.provider.getNetwork();
      const chainId = String(network?.chainId || product?.chainId || "1337");
      assertScalarValue(unitPriceWei, "unitPriceWei");
      assertScalarValue(quantityValue, "quantity");
      assertScalarValue(totalWei, "totalWei");

      const sellerAddress = sellerRailgunAddress.trim();
      if (!sellerAddress.startsWith("0zk")) throw new Error("Seller Railgun address is missing or invalid.");

      setProgress("Processing private transfer...");
      transferResult = await privateTransfer({
        toRailgunAddress: sellerAddress,
        amountWei: BigInt(totalWei),
        tokenAddress: SEPOLIA_WETH_ADDRESS,
        productId: String(product.id ?? 0),
        onProgress: (state) => setProgress(state?.message || "Processing private transfer..."),
      });
      if (!transferResult?.success) throw new Error(transferResult?.error || "Private transfer failed.");

      const orderId = generateOrderId();
      const contextHash = computeOrderContextHash({
        orderId,
        memoHash: transferResult.memoHash,
        railgunTxRef: transferResult.railgunTxRef,
        productId,
        chainId,
        escrowAddr: product.address,
        unitPriceHash,
      });

      const { privKeyHex, pubKeyHex } = generateX25519Keypair();
      const rQuantity = generateRandomBlinding();
      const rTotal = generateRandomBlinding();
      const rPay = generateRandomBlinding();

      const [qCommit, tCommit, pCommit] = await Promise.all([
        generateScalarCommitmentWithBlinding({ value: quantityValue, blindingHex: `0x${rQuantity}` }),
        generateScalarCommitmentWithBlinding({ value: totalWei, blindingHex: `0x${rTotal}` }),
        generateScalarCommitmentWithBlinding({ value: totalWei, blindingHex: `0x${rPay}` }),
      ]);

      const [quantityTotalProof, paymentEqualityProof] = await Promise.all([
        generateQuantityTotalProof({
          cQuantityHex: qCommit.commitment,
          cTotalHex: tCommit.commitment,
          unitPriceWei,
          rQuantityHex: `0x${rQuantity}`,
          rTotalHex: `0x${rTotal}`,
          contextHashHex: contextHash,
        }),
        generateTotalPaymentEqualityProof({
          cTotalHex: tCommit.commitment,
          cPayHex: pCommit.commitment,
          rTotalHex: `0x${rTotal}`,
          rPayHex: `0x${rPay}`,
          contextHashHex: contextHash,
        }),
      ]);

      const signature = await signer.signMessage(MSG);
      const aad = `${chainId}/${product.address.toLowerCase()}/${buyerAddress.toLowerCase()}/${orderId.toLowerCase()}`;
      const encryptedBlob = await encryptBlob({
        x25519_priv: privKeyHex,
        orderId,
        quantity: quantityValue,
        unitPriceWei,
        totalWei,
        r_quantity: rQuantity,
        r_total: rTotal,
        r_pay: rPay,
        meta: { chainId, productId, contextHash, productAddress: product.address, timestamp: Date.now() },
      }, signature, aad);
      encryptedBlob.pubkey = pubKeyHex;

      const [encryptedQuantityOpening, encryptedTotalOpening] = await Promise.all([
        encryptBlob({ value: quantityValue, blinding: rQuantity }, signature, `${aad}/quantity`),
        encryptBlob({ value: totalWei, blinding: rTotal }, signature, `${aad}/total`),
      ]);

      const payload = normalizeOrderPayload({
        orderId,
        productId,
        chainId,
        buyerAddress,
        quantity: quantityValue,
        unitPriceWei,
        unitPriceHash,
        totalWei,
        memoHash: transferResult.memoHash,
        railgunTxRef: transferResult.railgunTxRef,
        railgunTxHash: transferResult.txHash,
        quantityCommitment: qCommit.commitment,
        totalCommitment: tCommit.commitment,
        paymentCommitment: pCommit.commitment,
        quantityCommitmentProof: qCommit.proof,
        quantityCommitmentProofType: qCommit.proof_type,
        totalCommitmentProof: tCommit.proof,
        totalCommitmentProofType: tCommit.proof_type,
        paymentCommitmentProof: pCommit.proof,
        paymentCommitmentProofType: pCommit.proof_type,
        contextHash,
        disclosurePubkey: pubKeyHex,
        encryptedBlob,
        encryptedQuantityOpening,
        encryptedTotalOpening,
        quantityTotalProof,
        paymentEqualityProof,
      });
      setPendingOrder(payload);
      setResult(payload);

      await saveRecoveryBundle(payload, "payment_pending_recording");

      setStep("recording");
      setProgress("Recording order payment on-chain...");
      const recordTxHash = await recordOnChain(payload);
      await updateOrderStatus(payload.orderId, "payment_recorded");
      setPendingOrder(null);
      setResult({ ...payload, recordTxHash });
      setStep("complete");
      toast.success("Private order payment recorded on-chain.");
    } catch (err) {
      const msg = decodeContractError(err) || err.message;
      setError(
        transferResult?.memoHash
          ? `Private transfer succeeded, but on-chain recording failed: ${msg}. Use Retry Recording.`
          : msg
      );
      setStep("pay");
      toast.error(`Payment failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    if (!pendingOrder?.orderId) {
      toast.error("No pending order found.");
      return;
    }
    setLoading(true);
    setError("");
    setStep("recording");
    setProgress("Retrying on-chain record...");
    try {
      await saveRecoveryBundle(pendingOrder, "payment_pending_recording");
      const recordTxHash = await recordOnChain(pendingOrder);
      await updateOrderStatus(pendingOrder.orderId, "payment_recorded");
      setPendingOrder(null);
      setResult({ ...pendingOrder, recordTxHash });
      setStep("complete");
      toast.success("Pending order recorded on-chain.");
    } catch (err) {
      const msg = decodeContractError(err) || err.message;
      setError(msg);
      setStep("pay");
      toast.error(`Retry failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-end bg-black bg-opacity-50">
        <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Create Private Order</h2>
            <button onClick={onClose} className="text-xl text-gray-500 hover:text-gray-700">x</button>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            <StepPill label="Connect" active={currentStepIndex === 0} done={currentStepIndex > 0} />
            <StepPill label="Order" active={currentStepIndex === 1 || currentStepIndex === 2} done={currentStepIndex > 2} />
            <StepPill label="Done" active={currentStepIndex === 3} done={currentStepIndex === 3} />
          </div>

          {step === "connect" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">Connect your Railgun wallet to create a private quantity-based order.</p>
              <RailgunConnectionButton currentUser={currentUser} />
              <div className="flex gap-2">
                <Button onClick={handleConnect} disabled={loading} isLoading={loading}>Connect & Continue</Button>
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
              </div>
            </div>
          )}

          {(step === "pay" || step === "recording") && (
            <div className="space-y-4">
              <div className="rounded border bg-gray-50 p-3 text-sm">
                <p>Public unit price: <span className="font-semibold">{unitPriceWei ? `${ethers.formatEther(unitPriceWei)} WETH` : "Unavailable"}</span></p>
                <p className="mt-1">Private WETH balance: <span className="font-semibold">{ethers.formatEther(privateBalance)} WETH</span></p>
              </div>

              {step === "pay" && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Private order quantity</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      placeholder="Enter quantity"
                    />
                  </div>
                  {totalWei && <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Private total: {ethers.formatEther(totalWei)} WETH</div>}
                  {quantityValue && totalWei && <p className={`text-sm font-medium ${hasEnough ? "text-green-700" : "text-red-700"}`}>{hasEnough ? "Sufficient balance" : "Insufficient balance"}</p>}
                  {!sellerRailgunAddress && (
                    <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-3">
                      <label className="block text-sm font-medium text-amber-800">Seller Railgun Address (0zk...)</label>
                      <input
                        type="text"
                        value={sellerRailgunAddress}
                        onChange={(event) => setSellerRailgunAddress(event.target.value)}
                        className="w-full rounded border border-amber-300 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-amber-500"
                        placeholder="0zk1..."
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handlePay} disabled={!quantityValue || !totalWei || !hasEnough || loading} isLoading={loading}>Send Private Payment</Button>
                    <Button variant="ghost" onClick={syncBalance}>Refresh Balance</Button>
                    <Button variant="ghost" onClick={() => setShowFundsDrawer(true)}>Open Private Funds</Button>
                    {pendingOrder?.orderId && <Button variant="ghost" onClick={handleRetry} disabled={loading}>Retry Recording</Button>}
                  </div>
                </>
              )}
              {step === "recording" && (
                <>
                  <p className="text-sm text-gray-700">{progress || "Recording..."}</p>
                  <div className="h-2 w-full overflow-hidden rounded bg-gray-200"><div className="h-full w-2/3 animate-pulse bg-blue-600" /></div>
                </>
              )}
              {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            </div>
          )}

          {step === "complete" && result && (
            <div className="space-y-4">
              <div className="rounded border border-green-200 bg-green-50 p-3 text-green-800">Private order payment recorded on-chain.</div>
              <CopyLine label="Order ID" value={result.orderId} />
              <CopyLine label="Memo" value={result.memoHash} />
              <CopyLine label="Tx Ref" value={result.railgunTxRef} />
              <div className="text-sm text-gray-700">Private total paid: <span className="font-semibold">{ethers.formatEther(result.totalWei)} WETH</span></div>
              {result.recordTxHash && getExplorerUrl(result.recordTxHash) && (
                <a href={getExplorerUrl(result.recordTxHash)} target="_blank" rel="noreferrer" className="inline-block text-xs text-blue-700 underline">View recording tx</a>
              )}
              <div className="flex gap-2">
                <Button onClick={() => onSuccess?.()}>Close</Button>
                <Button variant="ghost" onClick={onClose}>Dismiss</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <PrivateFundsDrawer open={showFundsDrawer} onClose={() => setShowFundsDrawer(false)} />
    </>
  );
};

export default PrivatePaymentModal;
