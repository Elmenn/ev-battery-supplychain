// Enhanced VerifyVCTab.js UI rendering logic for results

const VerificationBox = ({ title, result, did }) => {
  const statusIcon = (ok) => (ok ? "✅" : "❌");
  const role = title.includes("Issuer") ? "seller" : "buyer";
  const allPassed = result.matching_vc && result.matching_signer && result.signature_verified;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
      <h4 className="font-semibold text-gray-900 mb-3">{title}</h4>
      
      {/* Status Summary */}
      <div className={`mb-3 p-2 rounded ${allPassed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        <div className="text-sm font-medium">
          {allPassed ? "✅ Signature Verification: PASSED" : "❌ Signature Verification: FAILED"}
        </div>
        <div className="text-xs text-gray-600 mt-1">
          {allPassed 
            ? `The ${role}'s signature is valid and matches the expected signer.`
            : `The ${role}'s signature verification failed. See details below.`
          }
        </div>
      </div>

      {/* Detailed Checks */}
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <strong>Matching Content:</strong>
            <span className="text-xs text-gray-500 ml-2">VC structure matches expected format</span>
          </div>
          <span className="text-lg">{statusIcon(result.matching_vc)}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <strong>Matching Signer:</strong>
            <span className="text-xs text-gray-500 ml-2">Signature was created by the expected {role}</span>
          </div>
          <span className="text-lg">{statusIcon(result.matching_signer)}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <strong>Signature Verified:</strong>
            <span className="text-xs text-gray-500 ml-2">EIP-712 signature is cryptographically valid</span>
          </div>
          <span className="text-lg">{statusIcon(result.signature_verified)}</span>
        </div>
      </div>

      {/* DID Information */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <div className="text-xs text-gray-500 mb-1">DID (Decentralized Identifier):</div>
        <div className="text-sm font-mono break-all text-gray-700">{did}</div>
        {result.recovered_address && (
          <div className="mt-1 text-xs text-gray-500">
            Recovered Address: <span className="font-mono">{result.recovered_address}</span>
          </div>
        )}
      </div>

      {/* Error Message */}
      {result.error && (
        <div className="mt-3 pt-3 border-t border-red-200">
          <div className="text-xs text-red-600 font-medium">Error:</div>
          <div className="text-xs text-red-500 mt-1">{result.error}</div>
        </div>
      )}
    </div>
  );
};

export default VerificationBox;