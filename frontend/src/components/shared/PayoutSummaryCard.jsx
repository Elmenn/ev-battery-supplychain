import React from "react";
import { ethers } from "ethers";
import { CheckCircle } from "lucide-react";
import { getExplorerUrl } from "../../utils/errorHandler";

export default function PayoutSummaryCard({ bondReturned, feePaid, txHash }) {
  const bond = BigInt(bondReturned ?? 0n);
  const fee = BigInt(feePaid ?? 0n);
  const total = bond + fee;
  const explorerUrl = txHash ? getExplorerUrl(txHash) : null;

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
      <div className="mb-3 flex items-center gap-2 text-green-800">
        <CheckCircle className="h-5 w-5" />
        <h3 className="text-sm font-semibold">Delivery Payout Summary</h3>
      </div>
      <div className="space-y-1 text-sm text-green-900">
        <p>Bond returned: {ethers.formatEther(bond)} ETH</p>
        <p>Delivery fee: {ethers.formatEther(fee)} ETH</p>
        <p className="font-semibold">Total received: {ethers.formatEther(total)} ETH</p>
      </div>
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-xs text-blue-700 underline"
        >
          View transaction
        </a>
      )}
    </div>
  );
}
