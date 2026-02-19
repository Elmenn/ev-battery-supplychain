import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import RailgunConnectionButton from "./RailgunConnectionButton";
import PrivateFundsDrawer from "./PrivateFundsDrawer";
import { getEscrowContract } from "../../utils/escrowHelpers";
import { decodeContractError, getExplorerUrl } from "../../utils/errorHandler";
import { NetworkName, NETWORK_CONFIG } from "@railgun-community/shared-models";
import {
  connectRailgun,
  refreshBalances,
  getAllBalances,
  privateTransfer,
  checkWalletState,
} from "../../lib/railgun-clean";

const SEPOLIA_WETH_ADDRESS =
  NETWORK_CONFIG[NetworkName.EthereumSepolia]?.baseToken?.wrappedAddress ||
  "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";

const STEPS = ["connect", "balance", "pay", "recording", "complete"];

function StepPill({ label, active, done }) {
  const cls = done
    ? "bg-green-600 text-white"
    : active
    ? "bg-blue-600 text-white"
    : "bg-gray-200 text-gray-600";
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function CopyLine({ label, value }) {
  const [copied, setCopied] = useState(false);
  const truncated = `${value.slice(0, 10)}...${value.slice(-8)}`;
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-gray-500">{label}:</span>
      <code className="truncate rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">
        {truncated}
      </code>
      <button
        className="text-xs text-blue-600 hover:text-blue-800"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

const PrivatePaymentModal = ({
  product,
  isOpen,
  onClose,
  onSuccess,
  currentUser,
}) => {
  const [step, setStep] = useState("connect");
  const [amount, setAmount] = useState("");
  const [privateBalance, setPrivateBalance] = useState(0n);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [txResult, setTxResult] = useState(null);
  const [showFundsDrawer, setShowFundsDrawer] = useState(false);
  const [actionError, setActionError] = useState("");
  const [sellerRailgunAddressInput, setSellerRailgunAddressInput] = useState("");
  const [pendingRecord, setPendingRecord] = useState(null);

  const parsedAmount = useMemo(() => {
    if (!amount) return null;
    try {
      const value = ethers.parseEther(amount);
      if (value <= 0n) return null;
      return value;
    } catch {
      return null;
    }
  }, [amount]);

  const pendingPaymentKey = useMemo(
    () =>
      product?.address
        ? `pending_private_payment_${product.address}`
        : "pending_private_payment_unknown",
    [product?.address]
  );

  const hasEnough = parsedAmount != null && privateBalance >= parsedAmount;
  const currentStepIndex = STEPS.indexOf(step);

  const findLocalStorageValueByAddress = useCallback((prefix, addr) => {
    if (!addr || typeof window === "undefined") return null;
    const lower = addr.toLowerCase();

    const direct = localStorage.getItem(`${prefix}${addr}`);
    if (direct) return direct;

    const directLower = localStorage.getItem(`${prefix}${lower}`);
    if (directLower) return directLower;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const suffix = key.slice(prefix.length);
      if (suffix.toLowerCase() === lower) {
        return localStorage.getItem(key);
      }
    }
    return null;
  }, []);

  const resolveSellerRailgunAddress = useCallback(async () => {
    if (!product?.address) return null;
    const existing = findLocalStorageValueByAddress(
      "sellerRailgunAddress_",
      product?.address
    );
    if (existing && existing.startsWith("0zk")) {
      return existing;
    }

    const rawMeta = findLocalStorageValueByAddress("productMeta_", product?.address);
    if (rawMeta) {
      try {
        const meta = JSON.parse(rawMeta);
        const resolved = String(meta?.sellerRailgunAddress || "").trim();
        if (resolved.startsWith("0zk")) {
          localStorage.setItem(`sellerRailgunAddress_${product.address}`, resolved);
          return resolved;
        }
      } catch {
        // ignore invalid metadata and fall through to manual input
      }
    }

    return null;
  }, [findLocalStorageValueByAddress, product?.address]);

  const syncBalance = useCallback(async () => {
    await refreshBalances();
    const balances = await getAllBalances();
    const weth = balances?.data?.railgun?.weth ?? 0n;
    setPrivateBalance(BigInt(weth));
    return BigInt(weth);
  }, []);

  const hydratePendingPayment = useCallback(() => {
    if (!product?.address) return null;
    try {
      const raw = localStorage.getItem(pendingPaymentKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.memoHash || !parsed?.railgunTxRef) return null;
      setPendingRecord(parsed);
      setTxResult((prev) => ({
        ...(prev || {}),
        memoHash: parsed.memoHash,
        railgunTxRef: parsed.railgunTxRef,
        railgunTxHash: parsed.railgunTxHash,
        recordTxHash: parsed.recordTxHash,
      }));
      if (!parsed.recordTxHash) {
        setStep("pay");
      }
      return parsed;
    } catch {
      return null;
    }
  }, [pendingPaymentKey, product?.address]);

  const persistPendingPayment = (payload) => {
    localStorage.setItem(pendingPaymentKey, JSON.stringify(payload));
    setPendingRecord(payload);
  };

  const clearPendingPayment = () => {
    localStorage.removeItem(pendingPaymentKey);
    setPendingRecord(null);
  };

  const preflightRecordPrivatePayment = async () => {
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    const signer = await browserProvider.getSigner();
    const me = (await signer.getAddress()).toLowerCase();
    const contract = getEscrowContract(product.address, signer);

    const [productId, buyer, owner, phase, purchased] = await Promise.all([
      contract.id(),
      contract.buyer(),
      contract.owner(),
      contract.phase(),
      contract.purchased(),
    ]);

    if (Number(phase) !== 0) {
      throw new Error("Product is no longer in Listed phase.");
    }
    if (purchased) {
      throw new Error("Product is already purchased.");
    }

    const buyerLc = buyer.toLowerCase();
    const ownerLc = owner.toLowerCase();
    const isDesignated =
      buyerLc !== ethers.ZeroAddress.toLowerCase() && buyerLc === me;
    const isOwner = ownerLc === me;

    if (buyerLc !== ethers.ZeroAddress.toLowerCase() && !isDesignated && !isOwner) {
      throw new Error(
        `This product is already reserved by another buyer (${buyer}).`
      );
    }

    return { contract, productId };
  };

  const recordPrivatePaymentOnChain = async ({ memoHash, railgunTxRef }) => {
    const { contract, productId } = await preflightRecordPrivatePayment();
    const recorder = await contract.runner.getAddress();
    const gasEstimate = await contract.recordPrivatePayment.estimateGas(
      productId,
      memoHash,
      railgunTxRef
    );
    const tx = await contract.recordPrivatePayment(productId, memoHash, railgunTxRef, {
      gasLimit: (gasEstimate * 120n) / 100n,
    });
    await tx.wait();

    // FCFS invariant: successful record should set buyer to recorder and phase to Purchased.
    const [buyerAfter, phaseAfter, purchasedAfter] = await Promise.all([
      contract.buyer(),
      contract.phase(),
      contract.purchased(),
    ]);
    if (buyerAfter.toLowerCase() !== recorder.toLowerCase()) {
      throw new Error(
        `Post-check failed: buyer mismatch after recording (${buyerAfter}).`
      );
    }
    if (Number(phaseAfter) !== 1 || !purchasedAfter) {
      throw new Error("Post-check failed: product did not move to Purchased phase.");
    }
    return tx.hash;
  };

  useEffect(() => {
    if (!isOpen) return;
    setStep("connect");
    setAmount("");
    setProgress("");
    setTxResult(null);
    setPendingRecord(null);
    setActionError("");
    setSellerRailgunAddressInput("");
    hydratePendingPayment();

    const checkState = async () => {
      try {
        const state = await checkWalletState(currentUser);
        if (state?.success && state?.data?.walletID) {
          const weth = await syncBalance();
          if (weth > 0n) {
            setStep("pay");
          } else {
            setStep("balance");
          }
        }
      } catch {
        // keep connect step
      }

      const cachedSeller =
        findLocalStorageValueByAddress("sellerRailgunAddress_", product?.address) ||
        (await resolveSellerRailgunAddress());
      if (cachedSeller) {
        setSellerRailgunAddressInput(cachedSeller);
      }
    };
    checkState();
  }, [
    currentUser,
    findLocalStorageValueByAddress,
    hydratePendingPayment,
    isOpen,
    product?.address,
    resolveSellerRailgunAddress,
    syncBalance,
  ]);

  useEffect(() => {
    if (!isOpen || !product?.address) return;
    if (sellerRailgunAddressInput) return;

    const hydrateSellerAddress = async () => {
      const resolved = await resolveSellerRailgunAddress();
      if (resolved) {
        setSellerRailgunAddressInput(resolved);
      }
    };
    hydrateSellerAddress();
  }, [isOpen, product?.address, resolveSellerRailgunAddress, sellerRailgunAddressInput]);

  useEffect(() => {
    if (!isOpen || !product?.address) return;
    if (amount) return;

    const priceWei = findLocalStorageValueByAddress("priceWei_", product.address);
    if (priceWei) {
      try {
        setAmount(ethers.formatEther(BigInt(priceWei)));
      } catch {
        // ignore malformed legacy value
      }
    }
  }, [amount, findLocalStorageValueByAddress, isOpen, product?.address]);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const result = await connectRailgun({ userAddress: currentUser });
      if (!result?.success) {
        throw new Error(result?.error || "Could not connect Railgun.");
      }
      const weth = await syncBalance();
      setStep(weth > 0n ? "pay" : "balance");
      toast.success("Railgun connected.");
    } catch (err) {
      toast.error(err.message || "Connection failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (!parsedAmount || !hasEnough) return;
    setStep("pay");
  };

  const handlePay = async () => {
    if (!parsedAmount) {
      toast.error("Enter a valid amount.");
      return;
    }
    setActionError("");
    setLoading(true);
    setProgress("Preparing transfer...");
    let transferSucceeded = false;
    let transferResult = null;
    try {
      await preflightRecordPrivatePayment();

      const sellerRailgunAddress = findLocalStorageValueByAddress(
        "sellerRailgunAddress_",
        product.address
      );
      let sellerRailgunAddressFinal =
        (sellerRailgunAddressInput || sellerRailgunAddress || "").trim();
      if (!sellerRailgunAddressFinal) {
        const resolved = await resolveSellerRailgunAddress();
        if (resolved) {
          sellerRailgunAddressFinal = resolved;
          setSellerRailgunAddressInput(resolved);
        }
      }
      if (!sellerRailgunAddressFinal) {
        throw new Error(
          "Seller Railgun address is missing for this product metadata."
        );
      }
      if (!sellerRailgunAddressFinal.startsWith("0zk")) {
        throw new Error("Seller Railgun address must start with 0zk.");
      }

      localStorage.setItem(
        `sellerRailgunAddress_${product.address}`,
        sellerRailgunAddressFinal
      );

      transferResult = await privateTransfer({
        toRailgunAddress: sellerRailgunAddressFinal,
        amountWei: parsedAmount,
        tokenAddress: SEPOLIA_WETH_ADDRESS,
        productId: String(product.id ?? 0),
        onProgress: (state) =>
          setProgress(state?.message || "Processing transfer..."),
      });
      if (!transferResult?.success) {
        throw new Error(transferResult?.error || "Private transfer failed.");
      }
      transferSucceeded = true;

      const pendingPayload = {
        memoHash: transferResult.memoHash,
        railgunTxRef: transferResult.railgunTxRef,
        railgunTxHash: transferResult.txHash,
        amount,
        timestamp: Date.now(),
      };
      persistPendingPayment(pendingPayload);

      setTxResult({
        memoHash: transferResult.memoHash,
        railgunTxRef: transferResult.railgunTxRef,
        railgunTxHash: transferResult.txHash,
      });

      setStep("recording");
      setProgress("Recording payment on-chain...");
      const recordTxHash = await recordPrivatePaymentOnChain({
        memoHash: transferResult.memoHash,
        railgunTxRef: transferResult.railgunTxRef,
      });

      setTxResult((prev) => ({
        ...(prev || {}),
        recordTxHash,
      }));
      clearPendingPayment();
      setStep("complete");
      setProgress("Payment complete.");
      toast.success("Private payment recorded on-chain.");
    } catch (err) {
      const decoded = decodeContractError(err) || err.message;
      const message =
        transferSucceeded && transferResult?.memoHash && transferResult?.railgunTxRef
          ? `Private transfer succeeded, but on-chain recording failed: ${decoded}. Use Retry Recording.`
          : decoded;
      toast.error("Payment failed: " + message);
      setActionError(message);
      setStep("pay");
      setProgress("");
    } finally {
      setLoading(false);
    }
  };

  const handleRetryRecord = async () => {
    const payment = pendingRecord || txResult;
    if (!payment?.memoHash || !payment?.railgunTxRef) {
      toast.error("No pending payment found to record.");
      return;
    }
    setLoading(true);
    setStep("recording");
    setProgress("Retrying on-chain payment record...");
    setActionError("");
    try {
      const recordTxHash = await recordPrivatePaymentOnChain({
        memoHash: payment.memoHash,
        railgunTxRef: payment.railgunTxRef,
      });
      clearPendingPayment();
      setTxResult((prev) => ({
        ...(prev || {}),
        memoHash: payment.memoHash,
        railgunTxRef: payment.railgunTxRef,
        railgunTxHash: payment.railgunTxHash,
        recordTxHash,
      }));
      setStep("complete");
      setProgress("Payment complete.");
      toast.success("Pending payment recorded on-chain.");
    } catch (err) {
      const decoded = decodeContractError(err) || err.message;
      setActionError(decoded);
      setStep("pay");
      setProgress("");
      toast.error("Retry failed: " + decoded);
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
            <h2 className="text-lg font-bold">Buy with Railgun</h2>
            <button
              onClick={onClose}
              className="text-xl text-gray-500 hover:text-gray-700"
            >
              x
            </button>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            <StepPill label="Connect" active={currentStepIndex === 0} done={currentStepIndex > 0} />
            <StepPill label="Balance" active={currentStepIndex === 1} done={currentStepIndex > 1} />
            <StepPill label="Pay" active={currentStepIndex === 2 || currentStepIndex === 3} done={currentStepIndex > 3} />
            <StepPill label="Done" active={currentStepIndex === 4} done={currentStepIndex === 4} />
          </div>

          {step === "connect" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Connect your Railgun wallet to make a private payment.
              </p>
              <RailgunConnectionButton currentUser={currentUser} />
              <div className="flex gap-2">
                <Button onClick={handleConnect} disabled={loading} isLoading={loading}>
                  Connect & Continue
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {(step === "balance" || step === "pay") && (
            <div className="space-y-4">
              <div className="rounded border bg-gray-50 p-3 text-sm">
                <p>
                  Private WETH Balance:{" "}
                  <span className="font-semibold">
                    {ethers.formatEther(privateBalance)} WETH
                  </span>
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Payment amount (ETH)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="Enter agreed amount"
                />
              </div>

              {parsedAmount != null && (
                <p
                  className={`text-sm font-medium ${
                    hasEnough ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {hasEnough ? "Sufficient balance" : "Insufficient balance"}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={step === "balance" ? handleContinue : handlePay}
                  disabled={!parsedAmount || !hasEnough || loading}
                  isLoading={loading}
                >
                  {step === "balance" ? "Continue to Pay" : "Send Private Payment"}
                </Button>
                <Button variant="ghost" onClick={syncBalance}>
                  Refresh Balance
                </Button>
                <Button variant="ghost" onClick={() => setShowFundsDrawer(true)}>
                  Open Private Funds
                </Button>
                {((pendingRecord && !pendingRecord.recordTxHash) ||
                  (txResult?.memoHash && txResult?.railgunTxRef && !txResult?.recordTxHash)) && (
                  <Button variant="ghost" onClick={handleRetryRecord} disabled={loading}>
                    Retry Recording
                  </Button>
                )}
              </div>

              {(pendingRecord || txResult?.memoHash) &&
                !(txResult?.recordTxHash || pendingRecord?.recordTxHash) && (
                  <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    Pending on-chain recording detected. Use <strong>Retry Recording</strong> to
                    finalize without sending funds again.
                  </div>
                )}

              {!findLocalStorageValueByAddress(
                "sellerRailgunAddress_",
                product?.address
              ) && (
                <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-3">
                  <label className="block text-sm font-medium text-amber-800">
                    Seller Railgun Address (0zk...)
                  </label>
                  <input
                    type="text"
                    value={sellerRailgunAddressInput}
                    onChange={(e) => setSellerRailgunAddressInput(e.target.value)}
                    placeholder="0zk1..."
                    className="w-full rounded border border-amber-300 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-amber-500"
                  />
                  <p className="text-xs text-amber-700">
                    This product is missing cached seller Railgun metadata. Paste
                    seller address once; it will be saved locally for next time.
                  </p>
                </div>
              )}

              {actionError && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {actionError}
                </div>
              )}
            </div>
          )}

          {step === "recording" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">{progress || "Recording..."}</p>
              <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
                <div className="h-full w-2/3 animate-pulse bg-blue-600" />
              </div>
            </div>
          )}

          {step === "complete" && txResult && (
            <div className="space-y-4">
              <div className="rounded border border-green-200 bg-green-50 p-3 text-green-800">
                Payment recorded on-chain.
              </div>
              {txResult.memoHash && <CopyLine label="Memo" value={txResult.memoHash} />}
              {txResult.railgunTxRef && (
                <CopyLine label="Tx Ref" value={txResult.railgunTxRef} />
              )}
              {txResult.recordTxHash && (
                <a
                  href={getExplorerUrl(txResult.recordTxHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-xs text-blue-700 underline"
                >
                  View recording tx
                </a>
              )}
              <div className="flex gap-2">
                <Button onClick={() => onSuccess?.()}>Close</Button>
                <Button variant="ghost" onClick={onClose}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <PrivateFundsDrawer
        open={showFundsDrawer}
        onClose={() => setShowFundsDrawer(false)}
      />
    </>
  );
};

export default PrivatePaymentModal;
