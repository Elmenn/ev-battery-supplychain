import React from "react";

function truncate(text, length = 12) {
  if (!text || text.length <= length) return text;
  const start = text.slice(0, 6);
  const end = text.slice(-4);
  return `${start}...${end}`;
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
  const issuanceDate = vc.issuanceDate || "-";

  const productContract = subject.productContract;
  const previousVersion = vc.previousVersion;
  const componentCredentials = Array.isArray(subject.listing?.componentCredentials)
    ? subject.listing.componentCredentials
    : [];
  const certificateCid = subject.listing?.certificateCredential?.cid;
  const sellerRailgunAddress = subject.listing?.sellerRailgunAddress;

  const priceCommitment = subject.priceCommitment || null;
  const proofs = Array.isArray(vc.proof) ? vc.proof : [];

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
        {subject.productId && (
          <>
            <strong>Product ID:</strong> {subject.productId} <br />
          </>
        )}
        {productContract && (
          <>
            <strong>Contract:</strong> <Copyable value={productContract} /> <br />
          </>
        )}
        {sellerRailgunAddress && (
          <>
            <strong>Seller Railgun:</strong> <Copyable value={sellerRailgunAddress} /> <br />
          </>
        )}
        {previousVersion && (
          <>
            <strong>Previous VC CID:</strong> <Copyable value={previousVersion} /> <br />
          </>
        )}
        {componentCredentials.length > 0 && (
          <>
            <strong>Component VCs ({componentCredentials.length}):</strong> <br />
            {componentCredentials.map((cid, idx) => (
              <span key={idx} style={{ display: "block", marginLeft: "1rem", fontSize: "0.9em" }}>
                - <Copyable value={cid} />
              </span>
            ))}
            <br />
          </>
        )}
        {certificateCid && (
          <>
            <strong>Certificate CID:</strong> <Copyable value={certificateCid} /> <br />
          </>
        )}
      </div>

      {priceCommitment?.commitment && (
        <div className="vc-section">
          <strong>Price Commitment:</strong> <Copyable value={priceCommitment.commitment} />
        </div>
      )}

      {priceCommitment?.proof && (
        <div className="vc-section">
          <strong>ZKP Proof:</strong> <Copyable value={priceCommitment.proof} />
        </div>
      )}

      {proofs.length > 0 && (
        <div className="vc-section">
          <strong>Proof Entries:</strong> {proofs.length}
        </div>
      )}
    </div>
  );
};

export default VCViewer;
