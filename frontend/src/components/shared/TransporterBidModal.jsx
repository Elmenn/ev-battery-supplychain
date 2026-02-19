import React, { useMemo, useState } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import { getEscrowContract } from "../../utils/escrowHelpers";
import { decodeContractError } from "../../utils/errorHandler";

export default function TransporterBidModal({
  isOpen,
  onClose,
  onSuccess,
  productAddress,
  provider,
  bondAmountWei,
}) {
  const [feeInput, setFeeInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedFee = useMemo(() => {
    if (!feeInput) return null;
    try {
      const parsed = ethers.parseEther(feeInput);
      if (parsed <= 0n) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [feeInput]);

  const bondEth = useMemo(
    () => ethers.formatEther(bondAmountWei ?? 0n),
    [bondAmountWei]
  );

  const totalImpactEth = useMemo(() => {
    const fee = parsedFee ?? 0n;
    const bond = BigInt(bondAmountWei ?? 0n);
    return ethers.formatEther(fee + bond);
  }, [parsedFee, bondAmountWei]);

  const handleSubmitBid = async () => {
    if (!parsedFee) {
      toast.error("Enter a valid fee amount.");
      return;
    }

    setIsSubmitting(true);
    try {
      const signer = await provider.getSigner();
      const contract = getEscrowContract(productAddress, signer);
      const tx = await contract.createTransporter(parsedFee, {
        value: BigInt(bondAmountWei ?? 0n),
      });
      await tx.wait();
      toast.success("Bid submitted!");
      onSuccess?.();
    } catch (err) {
      toast.error("Bid failed: " + (decodeContractError(err) || err.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">Submit Delivery Bid</h3>

        <label className="mb-2 block text-sm font-medium text-gray-700">
          Your delivery fee (ETH)
        </label>
        <input
          type="number"
          min="0"
          step="0.001"
          value={feeInput}
          onChange={(e) => setFeeInput(e.target.value)}
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          placeholder="0.01"
        />

        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">
            Bond required: {bondEth} ETH
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Your bond is refundable unless slashed by timeout conditions.
          </p>
        </div>

        <div className="mb-5 rounded-md border bg-gray-50 p-3 text-sm text-gray-700">
          <p>Fee quoted: {feeInput || "0"} ETH</p>
          <p>Bond staked: {bondEth} ETH</p>
          <p className="mt-1 font-medium">Total ETH impact: {totalImpactEth} ETH</p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmitBid}
            disabled={!parsedFee || isSubmitting}
            isLoading={isSubmitting}
          >
            Submit Bid & Stake Bond
          </Button>
        </div>
      </div>
    </div>
  );
}
