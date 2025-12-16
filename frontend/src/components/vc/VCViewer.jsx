import React from "react";

function truncate(text, length = 12) {
  if (!text || text.length <= length) return text;
  const start = text.slice(0, 6);
  const end = text.slice(-4);
  return `${start}…${end}`;
}

function Copyable({ value }) {
  return (
    <span
      className="copyable"
      title={value}
      onClick={() => navigator.clipboard.writeText(value)}
    >
      {truncate(value)}
    </span>
  );
}

const VCViewer = ({ vc }) => {
  if (!vc) return null;

  const issuer = vc.issuer?.id || "-";
  const issuerName = vc.issuer?.name || "";
  const holder = vc.holder?.id || "-";
  const holderName = vc.holder?.name || "";
  const subject = vc.credentialSubject || {};
  const proofs = vc.proofs || {};
  
  // Safely extract ZKP proof from price object
  let zkp = null;
  if (subject.price) {
    try {
      const priceObj = typeof subject.price === 'string' ? JSON.parse(subject.price) : subject.price;
      zkp = priceObj?.zkpProof || null;
    } catch (e) {
      // If parsing fails, zkp remains null
      zkp = null;
    }
  }
  
  const issuanceDate = vc.issuanceDate || "-";
  const productContract = subject.subjectDetails?.productContract;
  const previousCredential = subject.previousCredential;
  const componentCredentials = Array.isArray(subject.componentCredentials) ? subject.componentCredentials : [];
  const cert = subject.certificateCredential || {};
  const transporter = subject.subjectDetails?.transporter;
  const onChainCommitment = subject.subjectDetails?.onChainCommitment;
  const deliveryStatus = subject.deliveryStatus;
  const txHashCommitment = subject.txHashCommitment;

  return (
    <div className="vc-result-box">
      <div className="vc-result-header">Verifiable Credential</div>

      <div className="vc-section">
        <strong>Issuer:</strong> <Copyable value={issuer} /> {issuerName && `(${issuerName})`}
      </div>
      <div className="vc-section">
        <strong>Holder:</strong> <Copyable value={holder} /> {holderName && `(${holderName})`}
      </div>
      <div className="vc-section">
        <strong>Issuance Date:</strong> {issuanceDate}
      </div>

      <div className="vc-section">
        <strong>Product:</strong> {subject.productName || "-"} <br />
        <strong>Batch:</strong> {subject.batch || "-"} <br />
        <strong>Quantity:</strong> {subject.quantity || "-"} <br />
        {productContract && (
          <>
            <strong>Contract:</strong> <Copyable value={productContract} /> <br />
          </>
        )}
        {transporter && (
          <>
            <strong>Transporter:</strong> <Copyable value={transporter} /> <br />
          </>
        )}
        {previousCredential && (
          <>
            <strong>Previous VC:</strong> <Copyable value={previousCredential} /> <br />
          </>
        )}
        {componentCredentials.length > 0 && (
          <>
            <strong>Component VCs ({componentCredentials.length}):</strong> <br />
            {componentCredentials.map((cid, idx) => (
              <span key={idx} style={{ display: "block", marginLeft: "1rem", fontSize: "0.9em" }}>
                • <Copyable value={cid} />
              </span>
            ))}
            <br />
          </>
        )}
        {cert?.cid && (
          <>
            <strong>Certificate CID:</strong> <Copyable value={cert.cid} /> <br />
          </>
        )}
        {onChainCommitment && onChainCommitment !== "0x" + "0".repeat(64) && (
          <>
            <strong>On-Chain Commitment:</strong> <Copyable value={onChainCommitment} /> <br />
          </>
        )}
        {txHashCommitment && (
          <>
            <strong>TX Hash Commitment:</strong> <Copyable value={txHashCommitment.commitment?.substring(0, 20) + '...'} /> <br />
            <strong>Protocol:</strong> {txHashCommitment.protocol || 'bulletproofs-pedersen'} <br />
          </>
        )}
        {deliveryStatus !== undefined && (
          <>
            <strong>Delivery Status:</strong> {deliveryStatus ? "✅ Delivered" : "⏳ Pending"} <br />
          </>
        )}
      </div>

      <div className="vc-section">
        <strong>VC Hash:</strong> <Copyable value={subject.vcHash || vc.vcHash || "-"} />
      </div>

      {proofs.issuerProof?.jws && (
        <div className="vc-section">
          <strong>Issuer Proof:</strong> <Copyable value={proofs.issuerProof.jws} /> <br />
          <strong>Payload Hash:</strong> <Copyable value={proofs.issuerProof.payloadHash} /> <br />
          <strong>Created:</strong> {proofs.issuerProof.created}
        </div>
      )}
      {proofs.holderProof?.jws && (
        <div className="vc-section">
          <strong>Holder Proof:</strong> <Copyable value={proofs.holderProof.jws} /> <br />
          <strong>Payload Hash:</strong> <Copyable value={proofs.holderProof.payloadHash} /> <br />
          <strong>Created:</strong> {proofs.holderProof.created}
        </div>
      )}

      {zkp?.commitment && (
        <div className="vc-section">
          <strong>Commitment:</strong> <Copyable value={zkp.commitment} />
        </div>
      )}
      {zkp?.proof && (
        <div className="vc-section">
          <strong>ZKP Proof:</strong> <Copyable value={zkp.proof} />
        </div>
      )}
      {zkp?.protocol && (
        <div className="vc-section">
          <strong>ZKP Protocol:</strong> {zkp.protocol} v{zkp.version || "1.0"}
        </div>
      )}
    </div>
  );
};

export default VCViewer;
