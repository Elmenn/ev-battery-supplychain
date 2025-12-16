import React from "react";
// import { AlertBadge } from "../ui/AlertBadge"; // Not currently used

const ZKPVerificationBox = ({ proof }) => {
  if (!proof) return null;

  // proof.verified is boolean in your backend response
  const ok = proof.verified === true;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
      <h4 className="font-semibold text-gray-900 mb-3">🔐 Zero-Knowledge Proof Verification</h4>
      
      {/* Status Summary */}
      <div className={`mb-3 p-3 rounded ${ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        {ok ? (
          <div>
            <div className="text-green-700 font-semibold mb-1">✅ ZKP Proof: VALID</div>
            <div className="text-sm text-green-600">
              The commitment proves the hidden price is within the allowed range (0 &lt; price &lt; 2^64) without revealing the actual price.
            </div>
          </div>
        ) : (
          <div>
            <div className="text-red-700 font-semibold mb-1">❌ ZKP Proof: INVALID</div>
            <div className="text-sm text-red-600">
              {proof.error || "The proof does not validate. The commitment may be invalid or the proof may have been tampered with."}
            </div>
          </div>
        )}
      </div>

      {/* What This Proves */}
      <div className="text-xs text-gray-600 space-y-1">
        <div><strong>What this verification proves:</strong></div>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>The price is valid (not negative, not too large)</li>
          <li>The commitment is cryptographically sound</li>
          <li>The proof cannot be forged or replayed</li>
          <li>The price remains hidden (zero-knowledge)</li>
        </ul>
      </div>
    </div>
  );
};

export default ZKPVerificationBox;
