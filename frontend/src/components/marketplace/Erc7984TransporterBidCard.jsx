import React, { useEffect, useMemo, useState } from "react";
import { Contract } from "ethers";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/button";
import { formatTokenAmount, formatTokenInputValue, parseTokenAmountInput } from "../../utils/tokenDisplay";

const ACTION_ESCROW_ABI = [
  "function createTransporter(uint256 quotedFee)",
  "function isTransporter(address account) view returns (bool)",
  "function transporters(address account) view returns (uint256)",
];

function normalizeAddress(value) {
  const normalized = value ? String(value).trim().toLowerCase() : "";
  return normalized === "0x0000000000000000000000000000000000000000" ? "" : normalized;
}

export default function Erc7984TransporterBidCard({
  address,
  product,
  provider,
  currentUser,
  role,
  onBidComplete,
}) {
  const navigate = useNavigate();
  const [quotedFeeInput, setQuotedFeeInput] = useState("0.001");
  const [pendingAction, setPendingAction] = useState("");
  const [existingBidFee, setExistingBidFee] = useState("");

  const phase = Number(product?.phase);
  const transporterAddress = normalizeAddress(product?.transporterAddress);
  const currentAddress = normalizeAddress(currentUser);
  const hasExistingBid = existingBidFee !== "";
  const canBidFromProductPage =
    (role === "visitor" || role === "transporter") &&
    phase === 2 &&
    !transporterAddress &&
    !hasExistingBid;
  const canContinueTransporterFlow =
    (role === "transporter" || role === "visitor") &&
    currentAddress &&
    (currentAddress === transporterAddress || hasExistingBid) &&
    (phase === 2 || phase === 3);
  const transporterJobHref = useMemo(
    () => `/transporter/jobs/${encodeURIComponent(address)}`,
    [address]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadBidState() {
      if (!provider || !currentAddress || phase !== 2) {
        if (!cancelled) {
          setExistingBidFee("");
        }
        return;
      }

      try {
        const contract = new Contract(address, ACTION_ESCROW_ABI, provider);
        const [registered, quotedFee] = await Promise.all([
          contract.isTransporter(currentAddress),
          contract.transporters(currentAddress),
        ]);

        if (!cancelled) {
          setExistingBidFee(registered ? quotedFee.toString() : "");
        }
      } catch (error) {
        if (!cancelled) {
          setExistingBidFee("");
        }
      }
    }

    loadBidState();
    return () => {
      cancelled = true;
    };
  }, [address, currentAddress, phase, provider]);

  async function handleCreateBid() {
    if (!provider) return;
    setPendingAction("create-bid");
    try {
      const fee = parseTokenAmountInput(quotedFeeInput || "", { label: "Quoted fee" });

      const signer = await provider.getSigner();
      const contract = new Contract(address, ACTION_ESCROW_ABI, signer);
      const tx = await contract.createTransporter(fee);
      await tx.wait();
      toast.success("Transporter bid created.");
      setExistingBidFee(fee.toString());
      setQuotedFeeInput(formatTokenInputValue(fee));
      await onBidComplete?.();
    } catch (error) {
      toast.error(error.message || "Failed to create transporter bid.");
    } finally {
      setPendingAction("");
    }
  }

  if (!canBidFromProductPage && !canContinueTransporterFlow) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-cyan-950">
        {canBidFromProductPage ? "Transport Bid" : "Transporter Actions"}
      </h2>
      <p className="mt-2 text-sm text-cyan-900">
        {canBidFromProductPage
          ? "Place your delivery bid directly from the product page. If the seller selects you, continue the rest of the flow from the transporter job page."
          : hasExistingBid
            ? "You already placed a delivery bid for this order. Continue from the transporter job page or wait for the seller to choose a transporter."
            : "You are already part of this transport flow. Continue from the transporter job page."}
      </p>

      {canBidFromProductPage ? (
        <div className="mt-4 space-y-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-cyan-800">
              Quoted Fee
            </div>
            <input
              value={quotedFeeInput}
              onChange={(event) => setQuotedFeeInput(event.target.value)}
              className="mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
              placeholder="0.001"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleCreateBid}
              disabled={pendingAction !== ""}
              isLoading={pendingAction === "create-bid"}
            >
              Submit Bid
            </Button>
            <Button variant="ghost" onClick={() => navigate(transporterJobHref)}>
              Open Transport Jobs
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {hasExistingBid && (
            <div className="text-sm text-cyan-900">
              <strong>Your quoted fee:</strong> {formatTokenAmount(existingBidFee, { symbol: "WETH" })}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => navigate(transporterJobHref)}>
              Open Transport Job
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
