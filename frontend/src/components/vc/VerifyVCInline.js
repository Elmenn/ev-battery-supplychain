import React, { useMemo, useState } from "react";
import { ethers } from "ethers";
import {
  fetchVCStatusFromServer,
  fetchVCWithSource,
  verifyVCChainPreferLocal,
  verifyVCPreferLocal,
} from "../../utils/verifyVc";
import {
  verifyPrivatePriceQuantityTotalBulletproof,
  verifyQuantityTotalProofPreferWasm,
  verifyTotalPaymentEqualityBulletproof,
  verifyTotalPaymentEqualityProofPreferWasm,
} from "../../utils/equalityProofClient";
import { PHASE_LABELS } from "../../utils/escrowHelpers";
import VCViewer from "./VCViewer";
import VerificationBox from "./VerifyVCTab-Enhanced";
import ProductEscrowABI from "../../abis/ProductEscrow_Initializer.json";
import { Button } from "../ui/button";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";

const normalizeHex = (value) => String(value || "").toLowerCase().replace(/^0x/, "");

const getStatusMeta = (state) => {
  if (state === true) return { label: "Pass", badge: "bg-green-100 border-green-300 text-green-700" };
  if (state === false) return { label: "Fail", badge: "bg-red-100 border-red-300 text-red-700" };
  return { label: "Pending", badge: "bg-gray-100 border-gray-300 text-gray-600" };
};

const formatDisplayTimestamp = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(date);
};

const downloadJsonFile = (filename, data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const CopyValueButton = ({ value }) => {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      className="ml-2 text-[11px] text-blue-600 hover:text-blue-800"
      onClick={() => {
        navigator.clipboard.writeText(String(value));
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
};

const CheckDetailBox = ({
  title,
  verified,
  loading = false,
  passText,
  failText,
  pendingText,
  explains = [],
  evidence = [],
  error,
  onRun,
  runLabel = "Run Check",
}) => {
  const meta = getStatusMeta(verified);
  const toneClass =
    verified === true
      ? "bg-green-50 border-green-200"
      : verified === false
      ? "bg-red-50 border-red-200"
      : "bg-gray-50 border-gray-200";

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h4 className="font-semibold text-gray-900">{title}</h4>
        {onRun && (
          <Button variant="outline" size="sm" onClick={onRun} disabled={loading}>
            {loading ? "Running..." : runLabel}
          </Button>
        )}
      </div>

      <div className={`mb-3 p-3 rounded border ${toneClass}`}>
        <div className="text-sm font-medium flex items-center justify-between">
          <span>{loading ? "Verification In Progress" : `Status: ${meta.label}`}</span>
          <span className={`text-[11px] px-2 py-0.5 rounded border ${meta.badge}`}>{meta.label}</span>
        </div>
        <div className="text-xs text-gray-600 mt-1">
          {verified === true ? passText : verified === false ? failText : pendingText}
        </div>
      </div>

      {explains.length > 0 && (
        <div className="space-y-1 text-sm mb-3">
          <div className="font-medium text-gray-800">What this verifies</div>
          {explains.map((line) => (
            <div key={line} className="text-xs text-gray-600">{line}</div>
          ))}
        </div>
      )}

      {evidence.length > 0 && (
        <div className="pt-3 border-t border-gray-200 space-y-2">
          <div className="text-xs font-medium text-gray-700">Evidence used</div>
          {evidence.map(({ label, value, mono = false, source }) => (
            value != null && value !== "" ? (
              <div key={`${title}-${label}`} className="text-xs text-gray-600">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-700">{label}</span>
                  <div className="flex items-center gap-2">
                    {source && <span className="rounded-full border border-gray-300 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">{source}</span>}
                    <CopyValueButton value={value} />
                  </div>
                </div>
                <div className={mono ? "font-mono break-all mt-1" : "mt-1"}>{String(value)}</div>
              </div>
            ) : null
          ))}
        </div>
      )}

      {error && (
        <div className="mt-3 pt-3 border-t border-red-200">
          <div className="text-xs text-red-600 font-medium">Error</div>
          <div className="text-xs text-red-500 mt-1">{error}</div>
        </div>
      )}
    </div>
  );
};

const SummaryField = ({ label, value, mono = false, source }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {source ? (
        <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
          {source}
        </span>
      ) : null}
    </div>
    <div className={mono ? "mt-1 break-all font-mono text-sm text-slate-900" : "mt-1 text-sm font-medium text-slate-900"}>
      {value == null || value === "" ? "Not available" : String(value)}
    </div>
  </div>
);

async function resolveAnchorMatch({ startCid, startVc, onChainVcHash, maxDepth = 20 }) {
  const onChainNorm = normalizeHex(onChainVcHash);
  let currentCid = String(startCid || "").trim();
  let currentVc = startVc || null;
  let depth = 0;
  const visited = new Set();

  while (currentCid && depth <= maxDepth) {
    if (visited.has(currentCid)) break;
    visited.add(currentCid);
    const localHash = ethers.keccak256(ethers.toUtf8Bytes(currentCid));
    if (normalizeHex(localHash) === onChainNorm) {
      return { matched: true, matchedCid: currentCid, matchedDepth: depth };
    }
    const prevCid = typeof currentVc?.previousVersion === "string" ? currentVc.previousVersion.trim() : "";
    if (!prevCid) break;
    try {
      const fetched = await fetchVCWithSource(prevCid);
      currentVc = fetched.vc;
      currentCid = prevCid;
      depth += 1;
    } catch {
      break;
    }
  }

  return { matched: false, matchedCid: null, matchedDepth: null };
}

const VerifyVCInline = ({ vc, cid, provider, contractAddress, artifactSource = null }) => {
  const [verified, setVerified] = useState(null);
  const [result, setResult] = useState({});
  const [commitmentMatch, setCommitmentMatch] = useState(null);
  const [chainResult, setChainResult] = useState(null);
  const [chainAnchorResult, setChainAnchorResult] = useState(null);
  const [proofResults, setProofResults] = useState({
    quantityTotal: null,
    totalPayment: null,
    quantityTotalSource: null,
    totalPaymentSource: null,
    error: null,
  });
  const [statusResult, setStatusResult] = useState(null);
  const [showVC, setShowVC] = useState(false);
  const [loading, setLoading] = useState({ signatures: false, anchor: false, chain: false, chainAnchors: false, proofs: false, vcStatus: false });

  const order = vc?.credentialSubject?.order || {};
  const commitments = vc?.credentialSubject?.commitments || {};
  const privacyProofs = vc?.credentialSubject?.privacyProofs || {};
  const attestation = vc?.credentialSubject?.attestation || {};
  const listing = vc?.credentialSubject?.listing || {};
  const paymentBridge = vc?.credentialSubject?.paymentBridge || {};
  const priceVisibility =
    String(listing?.priceVisibility || "").trim() ||
    (commitments?.priceCommitment ? "private" : "public");
  const isV2Order = Boolean(order.orderId && commitments.quantityCommitment && commitments.totalCommitment && commitments.paymentCommitment);

  const handleVerify = async () => {
    setLoading((prev) => ({ ...prev, signatures: true }));
    try {
      const res = await verifyVCPreferLocal(vc, contractAddress);
      setVerified(res.success);
      setResult(res);
    } catch (err) {
      setVerified(false);
      setResult({ error: err.message || "Verification failed" });
    } finally {
      setLoading((prev) => ({ ...prev, signatures: false }));
    }
  };

  const handleVerifyCommitmentMatch = async () => {
    if (!provider || !contractAddress || !cid) return;
    setLoading((prev) => ({ ...prev, anchor: true }));
    try {
      const contract = new ethers.Contract(contractAddress, ProductEscrowABI.abi, provider);
      const onChainVcHash = await contract.getVcHash();
      const resolution = await resolveAnchorMatch({ startCid: cid, startVc: vc, onChainVcHash });
      setCommitmentMatch({
        verified: resolution.matched,
        matchedCid: resolution.matchedCid,
        matchedDepth: resolution.matchedDepth,
        onChainVcHash: normalizeHex(onChainVcHash),
      });
    } catch (err) {
      setCommitmentMatch({ verified: false, error: err.message || "Anchor verification failed" });
    } finally {
      setLoading((prev) => ({ ...prev, anchor: false }));
    }
  };

  const handleVerifyChain = async () => {
    if (!cid) return;
    setLoading((prev) => ({ ...prev, chain: true }));
    try {
      setChainResult(await verifyVCChainPreferLocal(cid, 50));
    } catch (err) {
      setChainResult({
        continuity: { verified: false, reason: err.message || "Chain verification failed" },
        governance: { verified: false, reason: err.message || "Chain verification failed", violations: [] },
        nodes: [],
        source: null,
      });
    } finally {
      setLoading((prev) => ({ ...prev, chain: false }));
    }
  };

  const handleVerifyStatus = async () => {
    if (!cid) return;
    setLoading((prev) => ({ ...prev, vcStatus: true }));
    try {
      setStatusResult(await fetchVCStatusFromServer(cid));
    } catch (err) {
      setStatusResult({
        registered: false,
        status: "unknown",
        verified: null,
        error: err.message || "Credential status verification failed",
      });
    } finally {
      setLoading((prev) => ({ ...prev, vcStatus: false }));
    }
  };

  const handleVerifyChainAnchors = async () => {
    if (!provider || !cid) return;
    setLoading((prev) => ({ ...prev, chainAnchors: true }));
    try {
      const chain = chainResult || await verifyVCChainPreferLocal(cid, 50);
      const failed = [];
      let checked = 0;
      for (const node of chain.nodes || []) {
        const stepContract = node.productContract || contractAddress;
        if (!stepContract) continue;
        try {
          const contract = new ethers.Contract(stepContract, ProductEscrowABI.abi, provider);
          const onChainVcHash = await contract.getVcHash();
          const fetched = await fetchVCWithSource(node.cid);
          const nodeVc = fetched.vc;
          const resolution = await resolveAnchorMatch({ startCid: node.cid, startVc: nodeVc, onChainVcHash });
          checked += 1;
          if (!resolution.matched) {
            failed.push({ cid: node.cid, reason: "Hash mismatch" });
          }
        } catch (err) {
          failed.push({ cid: node.cid, reason: err.message || "On-chain check failed" });
        }
      }
      setChainAnchorResult({ verified: failed.length === 0 && checked > 0, checked, total: chain.nodes?.length || 0, failed });
    } catch (err) {
      setChainAnchorResult({ verified: false, error: err.message || "Chain anchor verification failed" });
    } finally {
      setLoading((prev) => ({ ...prev, chainAnchors: false }));
    }
  };

  const handleVerifyOrderProofs = async () => {
    if (!isV2Order) return;
    setLoading((prev) => ({ ...prev, proofs: true }));
    try {
      const contextHash = paymentBridge?.contextHash || attestation.contextHash;
      const quantityProofType = String(privacyProofs.quantityTotal?.proofType || "").toLowerCase();
      const totalPaymentProofType = String(
        privacyProofs.totalPaymentEquality?.proofType || ""
      ).toLowerCase();

      const quantityTotalVerified =
        priceVisibility === "private" || quantityProofType.includes("bulletproof")
          ? await verifyPrivatePriceQuantityTotalBulletproof({
              cPriceHex: commitments.priceCommitment,
              cQuantityHex: commitments.quantityCommitment,
              cTotalHex: commitments.totalCommitment,
              proofHex: privacyProofs.quantityTotal?.proofHex,
              contextHashHex: contextHash,
            })
          : await verifyQuantityTotalProofPreferWasm({
              cQuantityHex: commitments.quantityCommitment,
              cTotalHex: commitments.totalCommitment,
              unitPriceWei: listing.unitPriceWei,
              proofRHex: privacyProofs.quantityTotal?.proofRHex,
              proofSHex: privacyProofs.quantityTotal?.proofSHex,
              contextHashHex: contextHash,
            });

      const totalPaymentVerified =
        totalPaymentProofType.includes("bulletproof")
          ? await verifyTotalPaymentEqualityBulletproof({
              cTotalHex: commitments.totalCommitment,
              cPayHex: commitments.paymentCommitment,
              proofHex: privacyProofs.totalPaymentEquality?.proofHex,
              contextHashHex: contextHash,
            })
          : await verifyTotalPaymentEqualityProofPreferWasm({
              cTotalHex: commitments.totalCommitment,
              cPayHex: commitments.paymentCommitment,
              proofRHex: privacyProofs.totalPaymentEquality?.proofRHex,
              proofSHex: privacyProofs.totalPaymentEquality?.proofSHex,
              contextHashHex: contextHash,
            });
      setProofResults({
        quantityTotal: Boolean(quantityTotalVerified?.verified),
        totalPayment: Boolean(totalPaymentVerified?.verified),
        quantityTotalSource: quantityTotalVerified?.source || null,
        totalPaymentSource: totalPaymentVerified?.source || null,
        error: null,
      });
    } catch (err) {
      setProofResults({
        quantityTotal: false,
        totalPayment: false,
        quantityTotalSource: null,
        totalPaymentSource: null,
        error: err.message || "Order proof verification failed",
      });
    } finally {
      setLoading((prev) => ({ ...prev, proofs: false }));
    }
  };

  const handleRunAll = async () => {
    await handleVerify();
    await handleVerifyStatus();
    await handleVerifyCommitmentMatch();
    await handleVerifyChain();
    await handleVerifyChainAnchors();
    if (isV2Order) {
      await handleVerifyOrderProofs();
    }
  };

  const chainLength = chainResult?.nodes?.length || 0;
  const artifactFetchLabel = artifactSource || (cid ? "Provided" : null);
  const signatureSourceLabel = result?.source || (verified != null ? "Local" : null);
  const provenanceSourceLabel = chainResult?.source || null;
  const generatedAtLabel = formatDisplayTimestamp(vc?.validFrom || statusResult?.createdAt || null);
  const currentPhaseLabel = useMemo(() => {
    if (!provider || !contractAddress) return "Not checked";
    if (!chainAnchorResult && !commitmentMatch) return "Pending chain check";
    const phaseFromVc = Number(order?.phase);
    if (Number.isFinite(phaseFromVc) && PHASE_LABELS[phaseFromVc]) return PHASE_LABELS[phaseFromVc];
    return isV2Order ? "Bound commitment order" : "Not available";
  }, [commitmentMatch, contractAddress, isV2Order, order?.phase, provider, chainAnchorResult]);
  const primaryChecks = [
    ["Artifact Retrieval", Boolean(cid && artifactFetchLabel)],
    ["VC Signatures", verified],
    ["VC Hash Anchor", commitmentMatch?.verified],
  ];
  const backendAssistedChecks = [
    ["Marketplace Status", statusResult?.verified],
    ["Provenance", chainResult?.continuity?.verified],
    ["Governance", chainResult?.governance?.verified],
    ["Chain Anchors", chainAnchorResult?.verified],
  ];
  const proofChecks = [
    ["Qty x Price = Total", proofResults.quantityTotal],
    ["Total = Payment", proofResults.totalPayment],
  ];
  const readinessItems = useMemo(() => {
    const items = [];
    if (!cid) items.push("No VC CID loaded for audit.");
    if (!provider) items.push("Wallet/provider not connected, so on-chain anchor checks are unavailable.");
    if (cid && statusResult?.registered === false) items.push("Marketplace operational status is missing, so backend-assisted status cannot be confirmed yet.");
    if (
      isV2Order &&
      (
        (!privacyProofs.quantityTotal?.proofHex &&
          (!privacyProofs.quantityTotal?.proofRHex || !privacyProofs.quantityTotal?.proofSHex)) ||
        (!privacyProofs.totalPaymentEquality?.proofHex &&
          (!privacyProofs.totalPaymentEquality?.proofRHex || !privacyProofs.totalPaymentEquality?.proofSHex))
      )
    ) {
      items.push("VC is missing embedded privacy proofs, so order proof checks cannot run from the VRC alone.");
    }
    if (isV2Order && !(paymentBridge?.contextHash || attestation.contextHash)) items.push("VC is missing the order contextHash, so order-bound proof checks will fail.");
    if (priceVisibility === "private" && !commitments.priceCommitment) items.push("Private-price VRC is missing priceCommitment, so Bulletproof quantity-total verification cannot run.");
    return items;
  }, [
    attestation.contextHash,
    cid,
    commitments.priceCommitment,
    isV2Order,
    paymentBridge?.contextHash,
    priceVisibility,
    privacyProofs.quantityTotal?.proofHex,
    privacyProofs.quantityTotal?.proofRHex,
    privacyProofs.quantityTotal?.proofSHex,
    privacyProofs.totalPaymentEquality?.proofHex,
    privacyProofs.totalPaymentEquality?.proofRHex,
    privacyProofs.totalPaymentEquality?.proofSHex,
    provider,
    statusResult?.registered,
  ]);

  const allPassed =
    Boolean(cid && artifactFetchLabel) &&
    verified === true &&
    (!provider || !contractAddress || commitmentMatch?.verified === true) &&
    (!isV2Order || (proofResults.quantityTotal === true && proofResults.totalPayment === true));
  const overallMeta = getStatusMeta(allPassed);

  const buildAuditReport = () => ({
    generatedAt: new Date().toISOString(),
    target: {
      vcCid: cid || null,
      contractAddress: contractAddress || null,
      orderId: order.orderId || null,
      contextHash: attestation.contextHash || null,
    },
    readiness: readinessItems,
      summary: {
        artifactFetch: Boolean(cid && artifactFetchLabel),
        artifactSource: artifactFetchLabel || null,
        signatures: verified,
        signatureSource: signatureSourceLabel || null,
        credentialStatus: statusResult?.verified ?? null,
        vcHashAnchor: commitmentMatch?.verified ?? null,
        provenanceContinuity: chainResult?.continuity?.verified ?? null,
        provenanceSource: provenanceSourceLabel || null,
        governanceConsistency: chainResult?.governance?.verified ?? null,
      chainWideAnchors: chainAnchorResult?.verified ?? null,
      quantityTotal: isV2Order ? proofResults.quantityTotal : null,
      totalPaymentEquality: isV2Order ? proofResults.totalPayment : null,
      quantityTotalSource: isV2Order ? proofResults.quantityTotalSource : null,
      totalPaymentSource: isV2Order ? proofResults.totalPaymentSource : null,
      primaryChecksPassed: allPassed,
      allPassed,
    },
      evidence: {
        artifactFetch: {
          cid: cid || null,
          source: artifactFetchLabel || null,
        },
        signature: result,
        credentialStatus: statusResult,
        anchor: commitmentMatch,
        chain: chainResult,
        chainAnchors: chainAnchorResult,
      order: isV2Order
        ? {
            listing,
            order,
            commitments,
            privacyProofs,
            attestation,
            proofResults,
          }
        : null,
    },
  });

  const handleExportAuditReport = () => {
    const safeId = (order.orderId || cid || "audit").slice(0, 18).replace(/[^a-zA-Z0-9_-]/g, "");
    downloadJsonFile(`audit-report-${safeId}.json`, buildAuditReport());
  };

  const handleExportBundle = () => {
    const safeId = (order.orderId || cid || "audit-bundle").slice(0, 18).replace(/[^a-zA-Z0-9_-]/g, "");
    downloadJsonFile(`audit-bundle-${safeId}.json`, {
      report: buildAuditReport(),
      vc,
    });
  };

  return (
    <div className="space-y-4 border rounded-xl p-4 bg-white shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" /> Auditor Verification
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleRunAll}>Run All Verifications</Button>
          <Button variant="outline" onClick={handleExportAuditReport}>Export Audit Report</Button>
          <Button variant="outline" onClick={handleExportBundle}>Export VC + Report Bundle</Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Trust Summary</div>
            <div className="mt-2 flex items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${overallMeta.badge}`}>
                {allPassed ? "Verified" : overallMeta.label}
              </span>
              {cid ? <CopyValueButton value={cid} /> : null}
            </div>
            <div className="mt-2 text-sm text-slate-600">
              This highlights the primary trust checks first, then leaves backend-assisted operational checks in the detailed report below.
            </div>
          </div>
          <div className="grid w-full gap-3 md:max-w-4xl md:grid-cols-2 xl:grid-cols-4">
            <SummaryField label="VRC CID" value={cid} mono source="vc" />
            <SummaryField label="Artifact Source" value={artifactFetchLabel} source="verifier" />
            <SummaryField label="Signature Source" value={signatureSourceLabel} source="verifier" />
            <SummaryField label="Provenance Source" value={provenanceSourceLabel} source="verifier" />
            <SummaryField label="Generated" value={generatedAtLabel} source="vc" />
            <SummaryField label="Order Phase" value={currentPhaseLabel} source="derived" />
            <SummaryField
              label="CID Anchor Match"
              value={commitmentMatch?.verified === true ? "Anchored on-chain" : commitmentMatch?.verified === false ? "Anchor mismatch" : "Pending check"}
              source="chain"
            />
            <SummaryField label="Bound VC Hash" value={commitmentMatch?.onChainVcHash || null} mono source="chain" />
            <SummaryField label="Order ID" value={order.orderId || null} mono source="vc" />
          </div>
        </div>
      </div>

      {readinessItems.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-900 mb-2">Audit Readiness</div>
          <div className="space-y-1">
            {readinessItems.map((item) => (
              <div key={item} className="text-xs text-amber-800">{item}</div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <div className="font-semibold">Extended checks</div>
        <div className="mt-1 text-xs text-sky-800">
          These checks add more context after the primary trust checks. Marketplace status is still backend-assisted, while provenance now prefers a local verification path and falls back only when needed.
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Primary Checks</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {primaryChecks.map(([label, state]) => {
              const meta = getStatusMeta(state);
              return (
                <div key={label} className="rounded border bg-gray-50 p-3">
                  <div className="mb-1 flex items-center justify-between text-sm font-medium">
                    <span>{label}</span>
                    <span className={`rounded border px-2 py-0.5 text-[11px] ${meta.badge}`}>{meta.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Extended Checks</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {backendAssistedChecks.map(([label, state]) => {
              const meta = getStatusMeta(state);
              return (
                <div key={label} className="rounded border bg-gray-50 p-3">
                  <div className="mb-1 flex items-center justify-between text-sm font-medium">
                    <span>{label}</span>
                    <span className={`rounded border px-2 py-0.5 text-[11px] ${meta.badge}`}>{meta.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {isV2Order && (
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Privacy Proof Checks</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {proofChecks.map(([label, state]) => {
                const meta = getStatusMeta(state);
                return (
                  <div key={label} className="rounded border bg-gray-50 p-3">
                    <div className="mb-1 flex items-center justify-between text-sm font-medium">
                      <span>{label}</span>
                      <span className={`rounded border px-2 py-0.5 text-[11px] ${meta.badge}`}>{meta.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {isV2Order && (
        <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-blue-700">Order Context</div>
          <div className="flex items-center justify-between gap-2">
            <span>Order ID</span>
            <div><span className="font-mono break-all">{order.orderId}</span><CopyValueButton value={order.orderId} /></div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Context Hash</span>
            <div><span className="font-mono break-all">{paymentBridge?.contextHash || attestation.contextHash}</span><CopyValueButton value={paymentBridge?.contextHash || attestation.contextHash} /></div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Proof Source</span>
            <span className="font-medium">
              {(privacyProofs.quantityTotal?.proofHex || privacyProofs.quantityTotal?.proofRHex) &&
              (privacyProofs.totalPaymentEquality?.proofHex || privacyProofs.totalPaymentEquality?.proofRHex)
                ? "Proofs embedded in VRC"
                : "Proofs missing from VRC"}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Detailed Verification Report</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            ...primaryChecks,
            ...backendAssistedChecks,
            ...(isV2Order ? proofChecks : []),
          ].map(([label, state]) => {
          const meta = getStatusMeta(state);
          return (
            <div key={label} className="p-3 rounded border bg-gray-50">
              <div className="text-sm font-medium mb-1 flex items-center justify-between">
                <span>{label}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded border ${meta.badge}`}>{meta.label}</span>
              </div>
            </div>
          );
        })}
        </div>

        <div className="text-xs text-slate-500">
          Signature verification source: <span className="font-medium text-slate-700">{signatureSourceLabel || "Not run yet"}</span>
          {result?.fallbackReason ? <span className="ml-2 text-slate-400">Fallback reason: {result.fallbackReason}</span> : null}
        </div>

        <VerificationBox
          title="Seller Signature Verification"
          result={result?.issuer || {
            matching_vc: false,
            matching_signer: false,
            signature_verified: false,
            skipped: verified === null,
            error: result?.error || null,
          }}
          did={vc?.issuer?.id}
        />

        {result?.holder && !result?.holder?.skipped && (
          <VerificationBox title="Holder Signature Verification" result={result.holder} did={vc?.holder?.id} />
        )}

        <CheckDetailBox
          title="Marketplace Status Verification"
          verified={statusResult?.verified ?? null}
          loading={loading.vcStatus}
          onRun={handleVerifyStatus}
          passText="The credential is registered as active in the marketplace backend status registry and has not been revoked or suspended there."
          failText="The credential is marked revoked or suspended in the marketplace backend registry."
          pendingText="This check has not been run yet."
          explains={[
            "It checks the marketplace backend credential-status registry keyed by the VC CID.",
            "This is a backend-assisted operational status layer, not the primary artifact integrity root.",
          ]}
          evidence={[
            { label: "VC CID", value: cid, mono: true, source: "vc" },
            { label: "Registered", value: statusResult?.registered, source: "backend" },
            { label: "Status", value: statusResult?.status, source: "backend" },
            { label: "Reason", value: statusResult?.reason, source: "backend" },
            { label: "Revoked At", value: statusResult?.revokedAt, source: "backend" },
            { label: "Order ID", value: statusResult?.orderId, mono: true, source: "backend" },
          ]}
          error={statusResult?.error}
        />

        <CheckDetailBox
          title="VC Hash Anchor Verification"
          verified={commitmentMatch?.verified ?? null}
          loading={loading.anchor}
          onRun={handleVerifyCommitmentMatch}
          passText="The CID being audited, or one of its previousVersion ancestors, matches the escrow's on-chain vcHash anchor."
          failText="The escrow's vcHash does not resolve to the audited VC lineage. This usually means the wrong CID or wrong contract is being checked."
          pendingText="This check has not been run yet."
          explains={[
            "It compares hash(CID) values against the escrow's stored vcHash.",
            "It also walks previousVersion links so anchored older VC versions still verify.",
          ]}
          evidence={[
            { label: "Audited CID", value: cid, mono: true, source: "vc" },
            { label: "Matched CID", value: commitmentMatch?.matchedCid, mono: true, source: "anchor" },
            { label: "Matched Depth", value: commitmentMatch?.matchedDepth, source: "derived" },
            { label: "On-chain vcHash", value: commitmentMatch?.onChainVcHash, mono: true, source: "chain" },
          ]}
          error={commitmentMatch?.error}
        />

        <CheckDetailBox
          title="Provenance Continuity Verification"
          verified={chainResult?.continuity?.verified ?? null}
          loading={loading.chain}
          onRun={handleVerifyChain}
          passText="Every provenance reference needed for the chain can be followed without a continuity break."
          failText="At least one provenance step is missing, unreachable, or disconnected from the expected chain."
          pendingText="This check has not been run yet."
          explains={[
            "It verifies that referenced component credentials can be traversed as a coherent provenance chain.",
            "This now prefers a local provenance traversal and only falls back to the backend if local verification cannot complete.",
          ]}
          evidence={[
            { label: "Continuity Reason", value: chainResult?.continuity?.reason, source: "verifier" },
            { label: "Chain Length", value: chainLength, source: "derived" },
            { label: "Verification Source", value: provenanceSourceLabel, source: "verifier" },
          ]}
          error={chainResult?.continuity?.verified === false ? chainResult?.continuity?.reason : null}
        />

        <CheckDetailBox
          title="Governance Consistency Verification"
          verified={chainResult?.governance?.verified ?? null}
          loading={loading.chain}
          onRun={handleVerifyChain}
          passText="Issuer/holder relationships across the provenance chain are consistent with the governance rules enforced by the verifier."
          failText="One or more provenance transitions violate the expected issuer-to-holder transfer rule."
          pendingText="This check has not been run yet."
          explains={[
            "It checks whether each next step in the chain was issued by the party that held the previous step.",
            "This uses the same local-first provenance graph, with backend fallback only when the local read path cannot complete.",
          ]}
          evidence={[
            { label: "Governance Reason", value: chainResult?.governance?.reason, source: "verifier" },
            { label: "Violations", value: chainResult?.governance?.violations?.length ?? 0, source: "derived" },
            { label: "Verification Source", value: provenanceSourceLabel, source: "verifier" },
          ]}
          error={chainResult?.governance?.verified === false ? chainResult?.governance?.reason : null}
        />

        <CheckDetailBox
          title="Chain-Wide Anchor Verification"
          verified={chainAnchorResult?.verified ?? null}
          loading={loading.chainAnchors}
          onRun={handleVerifyChainAnchors}
          passText="Each provenance step with a product contract anchor matches the on-chain vcHash stored for that step."
          failText="At least one provenance step does not match its on-chain anchor, or could not be checked."
          pendingText="This check has not been run yet."
          explains={[
            "It re-checks vcHash anchors across every product contract referenced in the provenance chain.",
            "It uses the locally verified provenance graph when available, and only falls back if the provenance walk could not be completed locally.",
          ]}
          evidence={[
            { label: "Checked Steps", value: chainAnchorResult?.checked, source: "derived" },
            { label: "Total Steps", value: chainAnchorResult?.total, source: "derived" },
            { label: "Failed Steps", value: chainAnchorResult?.failed?.length ?? 0, source: "derived" },
          ]}
          error={chainAnchorResult?.error}
        />

        {isV2Order && (
          <CheckDetailBox
            title="Quantity-Total Proof Verification"
            verified={proofResults.quantityTotal}
            loading={loading.proofs}
            onRun={handleVerifyOrderProofs}
            runLabel="Run Order Proof Checks"
            passText="The proof shows that the hidden total commitment is the public unit price multiplied by the hidden quantity, bound to this order context."
            failText="The quantity-to-total relationship did not verify for this order context."
            pendingText="This order proof has not been run yet."
            explains={[
              "It checks total = unitPrice x quantity without revealing quantity or total.",
              "It is bound to the order context hash, so the proof cannot be reused for another order.",
            ]}
            evidence={[
              { label: "Order ID", value: order.orderId, mono: true, source: "vc" },
              { label: "Price Visibility", value: priceVisibility, source: "vc" },
              ...(priceVisibility === "private"
                ? [{ label: "Price Commitment", value: commitments.priceCommitment, mono: true, source: "vc" }]
                : [{ label: "Unit Price Wei", value: listing.unitPriceWei, source: "vc" }]),
              { label: "Quantity Commitment", value: commitments.quantityCommitment, mono: true, source: "vc" },
              { label: "Total Commitment", value: commitments.totalCommitment, mono: true, source: "vc" },
              { label: "Context Hash", value: paymentBridge?.contextHash || attestation.contextHash, mono: true, source: "vc" },
              { label: "Verification Source", value: proofResults.quantityTotalSource, source: "verifier" },
            ]}
            error={proofResults.error}
          />
        )}

        {isV2Order && (
          <CheckDetailBox
            title="Total-Payment Equality Verification"
            verified={proofResults.totalPayment}
            loading={loading.proofs}
            onRun={handleVerifyOrderProofs}
            runLabel="Run Order Proof Checks"
            passText="The proof shows that the hidden payment commitment opens to the same amount as the hidden total commitment for this order."
            failText="The total-payment equality proof did not verify for this order context."
            pendingText="This order proof has not been run yet."
            explains={[
              "It checks that the committed payment amount equals the committed order total.",
              "It does not reveal the total or the payment amount, only that they are equal.",
            ]}
            evidence={[
              { label: "Order ID", value: order.orderId, mono: true, source: "vc" },
              { label: "Total Commitment", value: commitments.totalCommitment, mono: true, source: "vc" },
              { label: "Payment Commitment", value: commitments.paymentCommitment, mono: true, source: "vc" },
              { label: "Context Hash", value: paymentBridge?.contextHash || attestation.contextHash, mono: true, source: "vc" },
              { label: "Verification Source", value: proofResults.totalPaymentSource, source: "verifier" },
            ]}
            error={proofResults.error}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={showVC ? "ghost" : "outline"} onClick={() => setShowVC((value) => !value)} icon={showVC ? EyeOff : Eye}>
          {showVC ? "Hide VC" : "View VC"}
        </Button>
        <Button variant="outline" onClick={() => downloadJsonFile(`vc-${(order.orderId || "document").slice(0, 18)}.json`, vc)}>
          Export VC JSON
        </Button>
      </div>

      {showVC && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <h4 className="font-semibold mb-3">Verifiable Credential</h4>
          <VCViewer vc={vc} sidecar={null} report={buildAuditReport()} />
        </div>
      )}

      {allPassed && <div className="text-sm font-semibold text-green-700">All primary verifications passed.</div>}
    </div>
  );
};

export default VerifyVCInline;
