// Enhanced VerifyVCTab.js UI rendering logic for results

const VerificationBox = ({ title, result, did }) => {
  const statusIcon = (ok) => (ok ? "✅" : "❌");

  return (
    <div style={{
      background: "#f5f5f5",
      padding: "1em",
      borderRadius: "8px",
      marginBottom: "1em",
      border: "1px solid #ccc",
    }}>
      <h4 style={{ marginBottom: "0.5em" }}>{title}</h4>
      <div><strong>Matching Content:</strong> {statusIcon(result.matching_vc)}</div>
      <div><strong>Matching Signer:</strong> {statusIcon(result.matching_signer)}</div>
      <div><strong>Signature Verified:</strong> {statusIcon(result.signature_verified)}</div>
      <div><strong>DID:</strong> {did}</div>
    </div>
  );
};

export default VerificationBox;