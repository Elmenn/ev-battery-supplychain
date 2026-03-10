const VerificationBox = ({ title, result, did }) => {
  const statusIcon = (ok) => (ok ? "OK" : "FAIL");
  const role = title.toLowerCase().includes("seller") || title.toLowerCase().includes("issuer")
    ? "seller"
    : "buyer";
  const isPending = Boolean(result?.skipped) && !result?.error;
  const allPassed = Boolean(result?.matching_vc && result?.matching_signer && result?.signature_verified);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
      <h4 className="font-semibold text-gray-900 mb-3">{title}</h4>

      <div className={`mb-3 p-2 rounded ${
        isPending
          ? "bg-gray-50 border border-gray-200"
          : allPassed
          ? "bg-green-50 border border-green-200"
          : "bg-red-50 border border-red-200"
      }`}>
        <div className="text-sm font-medium">
          {isPending ? "Signature Verification: PENDING" : allPassed ? "Signature Verification: PASSED" : "Signature Verification: FAILED"}
        </div>
        <div className="text-xs text-gray-600 mt-1">
          {isPending
            ? "This signature check has not been run yet."
            : allPassed
            ? `The ${role}'s signature is valid and matches the expected signer.`
            : `The ${role}'s signature verification failed. See details below.`}
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <strong>Matching Content:</strong>
            <span className="text-xs text-gray-500 ml-2">VC structure matches expected format</span>
          </div>
          <span className="text-xs font-medium">{statusIcon(Boolean(result?.matching_vc))}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <strong>Matching Signer:</strong>
            <span className="text-xs text-gray-500 ml-2">Signature was created by the expected {role}</span>
          </div>
          <span className="text-xs font-medium">{statusIcon(Boolean(result?.matching_signer))}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <strong>Signature Verified:</strong>
            <span className="text-xs text-gray-500 ml-2">EIP-712 signature is cryptographically valid</span>
          </div>
          <span className="text-xs font-medium">{statusIcon(Boolean(result?.signature_verified))}</span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-200">
        <div className="text-xs text-gray-500 mb-1">DID</div>
        <div className="text-sm font-mono break-all text-gray-700">{did || "-"}</div>
        {result?.recovered_address && (
          <div className="mt-1 text-xs text-gray-500">
            Recovered Address: <span className="font-mono">{result.recovered_address}</span>
          </div>
        )}
      </div>

      {result?.error && (
        <div className="mt-3 pt-3 border-t border-red-200">
          <div className="text-xs text-red-600 font-medium">Error</div>
          <div className="text-xs text-red-500 mt-1">{result.error}</div>
        </div>
      )}
    </div>
  );
};

export default VerificationBox;
