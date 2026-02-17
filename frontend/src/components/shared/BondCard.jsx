import React from "react";
import { Shield } from "lucide-react";
import { formatEther } from "ethers";

/**
 * Read-only bond amount display card.
 *
 * @param {{
 *   bondAmountWei: bigint | string,
 *   label?: string,
 *   explanation?: string
 * }} props
 */
export default function BondCard({
  bondAmountWei,
  label = "Protocol Collateral",
  explanation = "Refundable bond held in escrow until successful delivery",
}) {
  const ethValue = bondAmountWei ? formatEther(bondAmountWei) : "0";

  return (
    <div className="border rounded p-3 bg-amber-50 border-amber-200">
      <div className="flex items-center space-x-2 mb-1">
        <Shield className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-800">{label}</span>
      </div>
      <div className="text-lg font-semibold text-amber-900">{ethValue} ETH</div>
      <p className="text-xs text-gray-600 mt-1">{explanation}</p>
    </div>
  );
}
