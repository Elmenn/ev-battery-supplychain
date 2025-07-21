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
  const zkp = vc.credentialSubject?.zkpProof || {};
  const issuanceDate = vc.issuanceDate || "-";
  const productContract = subject.subjectDetails?.productContract;
  const previousCredential = subject.previousCredential;
  const cert = subject.certificateCredential || {};

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
        {previousCredential && (
          <>
            <strong>Previous VC:</strong> <Copyable value={previousCredential} /> <br />
          </>
        )}
        {cert?.cid && (
          <>
            <strong>Certificate CID:</strong> <Copyable value={cert.cid} /> <br />
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

      {zkp.commitment && (
        <div className="vc-section">
          <strong>Commitment:</strong> <Copyable value={zkp.commitment} />
        </div>
      )}
      {zkp.proof && (
        <div className="vc-section">
          <strong>ZKP Proof:</strong> <Copyable value={zkp.proof} />
        </div>
      )}
      {zkp.protocol && (
        <div className="vc-section">
          <strong>ZKP Protocol:</strong> {zkp.protocol} v{zkp.version || "1.0"}
        </div>
      )}
    </div>
  );
};

export default VCViewer;
