import React, { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import { getEscrowContract } from "../../utils/escrowHelpers";
import { decodeContractError } from "../../utils/errorHandler";

export default function DeliveryConfirmModal({
  isOpen,
  onClose,
  onSuccess,
  productAddress,
  provider,
  vcHash,
}) {
  const [manualEntry, setManualEntry] = useState(false);
  const [manualHash, setManualHash] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hashToShow = useMemo(
    () => (manualEntry ? manualHash : vcHash || ""),
    [manualEntry, manualHash, vcHash]
  );

  const handleConfirmDelivery = async () => {
    const hashToSubmit = (manualEntry ? manualHash : vcHash || "").trim();
    if (!hashToSubmit) {
      toast.error("Missing delivery hash.");
      return;
    }

    setIsSubmitting(true);
    try {
      const signer = await provider.getSigner();
      const contract = getEscrowContract(productAddress, signer);
      const tx = await contract.confirmDelivery(hashToSubmit);
      const receipt = await tx.wait();
      toast.success("Delivery confirmed. Funds released.");
      onSuccess?.(receipt?.hash || null);
    } catch (err) {
      toast.error(
        "Delivery confirmation failed: " +
          (decodeContractError(err) || err.message)
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">Confirm Delivery</h3>

        <label className="mb-2 block text-sm font-medium text-gray-700">
          Delivery hash
        </label>
        <input
          value={hashToShow}
          readOnly={!manualEntry}
          onChange={(e) => setManualHash(e.target.value)}
          className="mb-3 w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs outline-none focus:border-blue-500"
        />

        <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={manualEntry}
            onChange={(e) => setManualEntry(e.target.checked)}
          />
          Enter hash manually
        </label>

        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          By confirming delivery, you attest delivery is complete. Your bond and
          delivery fee will be released on-chain.
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelivery}
            disabled={isSubmitting}
            isLoading={isSubmitting}
          >
            Confirm Delivery
          </Button>
        </div>
      </div>
    </div>
  );
}
