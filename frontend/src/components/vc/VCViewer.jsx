import React, { useMemo, useState } from "react";

function truncate(text, length = 18) {
  if (!text || text.length <= length) return text;
  const start = text.slice(0, 8);
  const end = text.slice(-6);
  return `${start}...${end}`;
}

function Copyable({ value, mono = true }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span>-</span>;
  return (
    <button
      className={`${mono ? "font-mono" : ""} text-left text-blue-700 hover:text-blue-900`}
      title={String(value)}
      onClick={() => {
        navigator.clipboard.writeText(String(value));
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? "Copied" : truncate(String(value))}
    </button>
  );
}

function Section({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="font-medium text-gray-900">{title}</span>
        <span className="text-xs text-gray-500">{open ? "Hide" : "Show"}</span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

function Field({ label, value, mono = false, source }) {
  if (value == null || value === "") return null;
  return (
    <div className="text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-gray-700">{label}</span>
        <div className="flex items-center gap-2">
          {source && <span className="rounded-full border border-gray-300 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">{source}</span>}
          <Copyable value={value} mono={mono} />
        </div>
      </div>
      <div className={`${mono ? "font-mono" : ""} text-xs text-gray-600 break-all mt-1`}>{String(value)}</div>
    </div>
  );
}

const VCViewer = ({ vc, report }) => {
  const [showRaw, setShowRaw] = useState(false);
  const safeVc = vc || {};
  const subject = safeVc.credentialSubject || {};
  const listing = subject.listing || {};
  const order = subject.order || {};
  const commitments = subject.commitments || {};
  const zkProofs = subject.zkProofs || {};
  const attestation = subject.attestation || {};
  const credentialSchema = safeVc.credentialSchema || {};
  const credentialStatus = safeVc.credentialStatus || {};
  const proofs = Array.isArray(safeVc.proof) ? safeVc.proof : [];

  const summary = useMemo(() => ({
    issuer: safeVc.issuer?.id || "-",
    holder: safeVc.holder?.id || "-",
    productName: subject.productName || "-",
    productId: subject.productId || order.productId || "-",
    contractAddress: subject.productContract || order.escrowAddr || "-",
    orderId: order.orderId || "-",
    contextHash: attestation.contextHash || "-",
  }), [attestation.contextHash, order.escrowAddr, order.orderId, order.productId, safeVc.holder?.id, safeVc.issuer?.id, subject.productContract, subject.productId, subject.productName]);

  if (!vc) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="text-sm font-semibold text-blue-900 mb-3">VC Summary</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Issuer" value={summary.issuer} mono source="vc" />
          <Field label="Holder" value={summary.holder} mono source="vc" />
          <Field label="Product" value={summary.productName} source="vc" />
          <Field label="Product ID" value={summary.productId} source="vc" />
          <Field label="Contract" value={summary.contractAddress} mono source="vc" />
          <Field label="Order ID" value={summary.orderId} mono source="vc" />
          <Field label="Context Hash" value={summary.contextHash} mono source="vc" />
          <Field label="Valid From" value={safeVc.validFrom || safeVc.issuanceDate} source="vc" />
          <Field label="Audit All Passed" value={report?.summary?.allPassed} source="report" />
        </div>
      </div>

      <Section title="VC Envelope">
        <Field label="Schema Version" value={safeVc.schemaVersion} source="vc" />
        {Array.isArray(safeVc["@context"]) && safeVc["@context"].map((entry, index) => (
          <Field key={`context-${index}`} label={`Context ${index + 1}`} value={entry} mono source="vc" />
        ))}
        <Field label="Credential Schema ID" value={credentialSchema.id} mono source="vc" />
        <Field label="Credential Schema Type" value={credentialSchema.type} source="vc" />
        <Field label="Credential Status ID" value={credentialStatus.id} mono source="vc" />
        <Field label="Credential Status Type" value={credentialStatus.type} source="vc" />
        <Field label="Credential Status Purpose" value={credentialStatus.statusPurpose} source="vc" />
      </Section>

      <Section title="Listing">
        <Field label="Unit Price Wei" value={listing.unitPriceWei} source="vc" />
        <Field label="Unit Price Hash" value={listing.unitPriceHash} mono source="vc" />
        <Field label="Listing Snapshot CID" value={listing.listingSnapshotCid} mono source="vc" />
        <Field label="Seller Railgun Address" value={listing.sellerRailgunAddress} mono source="vc" />
        <Field label="Certificate CID" value={listing.certificateCredential?.cid} mono source="vc" />
        {Array.isArray(listing.componentCredentials) && listing.componentCredentials.length > 0 && (
          <div className="space-y-2">
            <div className="font-medium text-gray-700 text-sm">Component Credentials</div>
            {listing.componentCredentials.map((entry, index) => (
              <Field key={`${entry}-${index}`} label={`Component ${index + 1}`} value={entry} mono source="vc" />
            ))}
          </div>
        )}
      </Section>

      <Section title="Order">
        <Field label="Buyer DID" value={order.buyerAddress} mono source="vc" />
        <Field label="Memo Hash" value={order.memoHash} mono source="vc" />
        <Field label="Railgun Tx Ref" value={order.railgunTxRef} mono source="vc" />
        <Field label="Escrow Address" value={order.escrowAddr} mono source="vc" />
        <Field label="Chain ID" value={order.chainId} source="vc" />
      </Section>

      <Section title="Commitments">
        <Field label="Quantity Commitment" value={commitments.quantityCommitment} mono source="vc" />
        <Field label="Total Commitment" value={commitments.totalCommitment} mono source="vc" />
        <Field label="Payment Commitment" value={commitments.paymentCommitment} mono source="vc" />
      </Section>

      <Section title="Attestation">
        <Field label="Context Hash" value={attestation.contextHash} mono source="vc" />
        <Field label="Disclosure Public Key" value={attestation.disclosurePubKey || attestation.disclosurePubkey} mono source="vc" />
      </Section>

      <Section title="Embedded ZK Proofs">
        <Field label="Proof Schema Version" value={zkProofs.schemaVersion} source="vc" />
        <Field label="Quantity Proof Type" value={zkProofs.quantityTotalProof?.proofType} source="vc" />
        <Field label="Quantity Proof R" value={zkProofs.quantityTotalProof?.proofRHex || zkProofs.quantityTotalProof?.proof_r_hex} mono source="vc" />
        <Field label="Quantity Proof S" value={zkProofs.quantityTotalProof?.proofSHex || zkProofs.quantityTotalProof?.proof_s_hex} mono source="vc" />
        <Field label="Quantity Proof Context" value={zkProofs.quantityTotalProof?.contextHash || zkProofs.quantityTotalProof?.context_hash_hex} mono source="vc" />
        <Field label="Payment Proof Type" value={zkProofs.totalPaymentEqualityProof?.proofType} source="vc" />
        <Field label="Payment Proof R" value={zkProofs.totalPaymentEqualityProof?.proofRHex || zkProofs.totalPaymentEqualityProof?.proof_r_hex} mono source="vc" />
        <Field label="Payment Proof S" value={zkProofs.totalPaymentEqualityProof?.proofSHex || zkProofs.totalPaymentEqualityProof?.proof_s_hex} mono source="vc" />
        <Field label="Payment Proof Context" value={zkProofs.totalPaymentEqualityProof?.contextHash || zkProofs.totalPaymentEqualityProof?.context_hash_hex} mono source="vc" />
      </Section>

      <Section title="Proof Entries">
        <Field label="VC Proof Count" value={proofs.length} source="vc" />
        {proofs.map((proof, index) => (
          <div key={`${proof.verificationMethod || "proof"}-${index}`} className="rounded border border-gray-200 p-3 space-y-2">
            <Field label="Role" value={proof.role} source="vc" />
            <Field label="Verification Method" value={proof.verificationMethod} mono source="vc" />
            <Field label="Payload Hash" value={proof.payloadHash} mono source="vc" />
            <Field label="Created" value={proof.created} source="vc" />
          </div>
        ))}
      </Section>

      <Section title="Raw JSON" defaultOpen={false}>
        <button
          className="mb-3 text-sm text-blue-700 hover:text-blue-900"
          onClick={() => setShowRaw((value) => !value)}
        >
          {showRaw ? "Hide Raw JSON" : "Show Raw JSON"}
        </button>
        {showRaw && (
          <pre className="rounded bg-gray-900 text-gray-100 p-4 text-xs overflow-auto">
            {JSON.stringify(vc, null, 2)}
          </pre>
        )}
      </Section>
    </div>
  );
};

export default VCViewer;
