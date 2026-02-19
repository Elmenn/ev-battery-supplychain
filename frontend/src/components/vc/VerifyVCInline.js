import React, { useState } from "react";
import { ethers } from "ethers";

import { verifyVCWithServer, verifyVCChainWithServer } from "../../utils/verifyVc";
import { extractZKPProof } from "../../utils/verifyZKP";

import VCViewer from "./VCViewer";
import VerificationBox from "./VerifyVCTab-Enhanced";
import ZKPVerificationBox from "./ZKPVerificationBox";
import ProductEscrowABI from "../../abis/ProductEscrow_Initializer.json";

import { Button } from "../ui/button";
import { CheckCircle2, Eye, EyeOff, Link as LinkIcon } from "lucide-react";

const getStatusMeta = (state) => {
  if (state === true) return { label: "Pass", tone: "text-green-700", badge: "bg-green-100 border-green-300" };
  if (state === false) return { label: "Fail", tone: "text-red-700", badge: "bg-red-100 border-red-300" };
  return { label: "Warning", tone: "text-amber-700", badge: "bg-amber-100 border-amber-300" };
};

const scopeBadges = [
  { label: "Cryptographic", tone: "bg-blue-50 text-blue-700 border-blue-200" },
  { label: "On-Chain", tone: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { label: "Provenance", tone: "bg-teal-50 text-teal-700 border-teal-200" },
  { label: "Governance", tone: "bg-purple-50 text-purple-700 border-purple-200" },
];

const VerifyVCInline = ({ vc, cid, provider, contractAddress }) => {
  const [verified, setVerified] = useState(null);
  const [result, setResult] = useState({});

  const [zkpResult, setZkpResult] = useState(null);
  const [zkpTriggered, setZkpTriggered] = useState(false);

  const [commitmentMatch, setCommitmentMatch] = useState(null);
  const [commitmentLoading, setCommitmentLoading] = useState(false);

  const [chainResult, setChainResult] = useState(null);
  const [chainLoading, setChainLoading] = useState(false);

  const [chainAnchorResult, setChainAnchorResult] = useState(null);
  const [chainAnchorLoading, setChainAnchorLoading] = useState(false);

  const [showVC, setShowVC] = useState(false);
  const [vcLoading, setVcLoading] = useState(false);
  const [zkpLoading, setZkpLoading] = useState(false);

  const handleVerify = async () => {
    setVcLoading(true);
    try {
      const res = await verifyVCWithServer(vc, contractAddress);
      setVerified(res.success);
      setResult(res);
    } catch (err) {
      setVerified(false);
      setResult({ error: err.message || "Verification failed" });
    } finally {
      setVcLoading(false);
    }
  };

  const handleVerifyZKP = async () => {
    setZkpLoading(true);
    setZkpTriggered(true);
    try {
      const { commitment, proof, protocol, proofType, bindingTag } = extractZKPProof(vc);
      const endpoint =
        proofType === "zkRangeProof-v1" || protocol === "bulletproofs-pedersen"
          ? "verify-value-commitment"
          : "verify";
      const zkpBackendUrl = process.env.REACT_APP_ZKP_BACKEND_URL || "http://localhost:5010";

      const requestBody = {
        commitment,
        proof,
        ...(bindingTag ? { binding_tag_hex: bindingTag } : {}),
      };

      const res = await fetch(`${zkpBackendUrl}/zkp/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      setZkpResult(data);
    } catch (err) {
      setZkpResult({ verified: false, error: err.message || "Error verifying ZKP." });
    } finally {
      setZkpLoading(false);
    }
  };

  const handleVerifyCommitmentMatch = async () => {
    if (!provider || !contractAddress) {
      setCommitmentMatch({ verified: false, error: "Provider or contract address not available" });
      return;
    }

    setCommitmentLoading(true);
    try {
      if (!cid) {
        throw new Error("VC CID is required to verify on-chain VC hash anchor");
      }

      const contract = new ethers.Contract(contractAddress, ProductEscrowABI.abi, provider);
      const onChainVcHash = await contract.getVcHash();
      const localVcHash = ethers.keccak256(ethers.toUtf8Bytes(cid));

      const localVcHashNormalized = localVcHash.toLowerCase().replace(/^0x/, "");
      const onChainVcHashNormalized = onChainVcHash.toLowerCase().replace(/^0x/, "");

      setCommitmentMatch({
        verified: localVcHashNormalized === onChainVcHashNormalized,
        vcHash: localVcHashNormalized,
        onChainVcHash: onChainVcHashNormalized,
      });
    } catch (err) {
      setCommitmentMatch({ verified: false, error: err.message || "Error verifying VC hash anchor" });
    } finally {
      setCommitmentLoading(false);
    }
  };

  const handleVerifyChain = async () => {
    setChainLoading(true);
    try {
      if (!cid) throw new Error("VC CID is required for chain verification");
      const res = await verifyVCChainWithServer(cid, 50);
      setChainResult(res);
    } catch (err) {
      setChainResult({
        success: false,
        continuity: { verified: false, reason: err.message || "Chain verification failed" },
        governance: { verified: false, reason: err.message || "Chain verification failed", violations: [] },
        nodes: [],
      });
    } finally {
      setChainLoading(false);
    }
  };

  const handleVerifyChainAnchors = async () => {
    if (!provider) {
      setChainAnchorResult({ verified: false, error: "Provider not available" });
      return;
    }

    setChainAnchorLoading(true);
    try {
      let chain = chainResult;
      if (!chain || !Array.isArray(chain.nodes) || chain.nodes.length === 0) {
        if (!cid) throw new Error("VC CID is required for chain anchor verification");
        chain = await verifyVCChainWithServer(cid, 50);
        setChainResult(chain);
      }

      const failed = [];
      let checked = 0;

      for (const node of chain.nodes) {
        const stepContractAddress = node.productContract || contractAddress;
        if (!stepContractAddress) {
          failed.push({ cid: node.cid, reason: "Missing productContract" });
          continue;
        }

        try {
          const contract = new ethers.Contract(stepContractAddress, ProductEscrowABI.abi, provider);
          const onChainVcHash = await contract.getVcHash();
          const localVcHash = ethers.keccak256(ethers.toUtf8Bytes(node.cid));

          const onChainNorm = onChainVcHash.toLowerCase().replace(/^0x/, "");
          const localNorm = localVcHash.toLowerCase().replace(/^0x/, "");

          checked += 1;
          if (onChainNorm !== localNorm) {
            failed.push({
              cid: node.cid,
              reason: "Hash mismatch",
              expected: localNorm,
              actual: onChainNorm,
            });
          }
        } catch (err) {
          failed.push({
            cid: node.cid,
            reason: err.message || "On-chain check failed",
          });
        }
      }

      setChainAnchorResult({
        verified: failed.length === 0 && checked > 0,
        checked,
        total: chain.nodes.length,
        failed,
      });
    } catch (err) {
      setChainAnchorResult({ verified: false, error: err.message || "Chain anchor verification failed" });
    } finally {
      setChainAnchorLoading(false);
    }
  };

  const handleRunAllVerifications = async () => {
    await handleVerify();
    await handleVerifyZKP();
    if (provider && contractAddress) {
      await handleVerifyCommitmentMatch();
    }
    await handleVerifyChain();
    if (provider) {
      await handleVerifyChainAnchors();
    }
  };

  const allVerificationsComplete =
    verified === true &&
    zkpResult?.verified === true &&
    (!provider || !contractAddress || commitmentMatch?.verified === true) &&
    chainResult?.continuity?.verified === true &&
    chainResult?.governance?.verified === true &&
    (!provider || chainAnchorResult?.verified === true);

  const buildAuditReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      target: {
        vcCid: cid || null,
        productContract: contractAddress || vc?.credentialSubject?.productContract || null,
        productId: vc?.credentialSubject?.productId || null,
      },
      summary: {
        signatures: verified,
        zkpProof: zkpResult?.verified ?? null,
        vcHashAnchor: commitmentMatch?.verified ?? null,
        provenanceContinuity: chainResult?.continuity?.verified ?? null,
        governanceConsistency: chainResult?.governance?.verified ?? null,
        chainWideAnchors: chainAnchorResult?.verified ?? null,
        allPassed: allVerificationsComplete,
      },
      evidence: {
        signature: {
          issuer: result?.issuer || null,
          holder: result?.holder || null,
        },
        zkp: zkpResult || null,
        vcHashAnchor: commitmentMatch || null,
        provenance: {
          continuity: chainResult?.continuity || null,
          governance: chainResult?.governance || null,
          chainLength: chainResult?.chainLength || 0,
          nodes: chainResult?.nodes || [],
          edges: chainResult?.edges || [],
        },
        chainAnchors: chainAnchorResult || null,
      },
    };
    return report;
  };

  const handleDownloadAuditJson = () => {
    const report = buildAuditReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeCid = (cid || "audit-report").slice(0, 24);
    link.href = url;
    link.download = `audit-report-${safeCid}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintAuditReport = () => {
    const report = buildAuditReport();
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;

    const rows = [
      ["VC CID", report.target.vcCid || "-"],
      ["Product Contract", report.target.productContract || "-"],
      ["Product ID", report.target.productId || "-"],
      ["Generated At", report.generatedAt],
      ["VC Signatures", String(report.summary.signatures)],
      ["ZKP Proof", String(report.summary.zkpProof)],
      ["VC Hash Anchor", String(report.summary.vcHashAnchor)],
      ["Provenance Continuity", String(report.summary.provenanceContinuity)],
      ["Governance Consistency", String(report.summary.governanceConsistency)],
      ["Chain-Wide Anchors", String(report.summary.chainWideAnchors)],
      ["All Passed", String(report.summary.allPassed)],
      ["Chain Length", String(report.evidence.provenance.chainLength || 0)],
    ];

    const tableHtml = rows
      .map(([k, v]) => `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:600">${k}</td><td style="padding:8px;border:1px solid #ddd">${v}</td></tr>`)
      .join("");

    win.document.write(`
      <html>
        <head><title>Audit Report</title></head>
        <body style="font-family:Arial, sans-serif; padding:24px;">
          <h2 style="margin:0 0 12px;">Auditor Verification Report</h2>
          <p style="margin:0 0 16px;color:#555;">Privacy-preserving EV battery provenance audit snapshot.</p>
          <table style="border-collapse:collapse; width:100%; margin-bottom:16px;">${tableHtml}</table>
          <h3 style="margin:0 0 8px;">Recommended Actions</h3>
          <ul>
            ${(recommendedActions.length > 0 ? recommendedActions : ["No action needed. All checks passed."])
              .map((a) => `<li>${a}</li>`)
              .join("")}
          </ul>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  const recommendedActions = [];
  if (verified === false) recommendedActions.push("Re-load VC and ensure seller signature is generated from the expected issuer wallet.");
  if (zkpResult?.verified === false) recommendedActions.push("Regenerate the price commitment proof in seller flow and confirm VC stores `priceCommitment.proof`.");
  if (provider && contractAddress && commitmentMatch?.verified === false) recommendedActions.push("Check that the escrow `vcHash` was recorded with the same CID currently being audited.");
  if (chainResult?.continuity?.verified === false) recommendedActions.push("Fix broken component CIDs in `componentCredentials` and ensure every referenced CID is fetchable.");
  if (chainResult?.governance?.verified === false) recommendedActions.push("Enforce issuer-holder transfer rule: parent VC issuer must equal each component VC holder.");
  if (provider && chainAnchorResult?.verified === false) recommendedActions.push("Re-verify each component product contract has the correct on-chain `vcHash` anchor.");

  return (
    <div className="space-y-4 border rounded-xl p-4 bg-white shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" /> Auditor Verification
        </h3>

        <div className="flex items-center gap-2">
          <Button onClick={handleRunAllVerifications} icon={LinkIcon}>
            Run All Verifications
          </Button>
          <Button onClick={handleDownloadAuditJson} variant="outline">
            Download JSON
          </Button>
          <Button onClick={handlePrintAuditReport} variant="outline">
            Print / PDF
          </Button>
        </div>
      </div>

      <div className="text-sm text-gray-600">
        Verify signature, ZKP, current VC anchor, provenance continuity, governance consistency, and chain-wide on-chain anchors.
      </div>

      <div className="flex flex-wrap gap-2">
        {scopeBadges.map((scope) => (
          <span key={scope.label} className={`text-xs border rounded-full px-2 py-1 ${scope.tone}`}>
            {scope.label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {(!verified || verified === null) && (
          <Button onClick={handleVerify} isLoading={vcLoading} variant="outline">
            Verify VC Signatures
          </Button>
        )}

        {(!zkpResult || !zkpResult.verified) && (
          <Button onClick={handleVerifyZKP} isLoading={zkpLoading} variant="outline">
            Verify ZKP Proof
          </Button>
        )}

        {provider && contractAddress && (!commitmentMatch || !commitmentMatch.verified) && (
          <Button onClick={handleVerifyCommitmentMatch} isLoading={commitmentLoading} variant="outline">
            Verify VC Hash Anchor
          </Button>
        )}

        {(!chainResult || !chainResult.continuity || !chainResult.governance) && (
          <Button onClick={handleVerifyChain} isLoading={chainLoading} variant="outline">
            Verify Provenance Continuity
          </Button>
        )}

        {provider && (!chainAnchorResult || !chainAnchorResult.verified) && (
          <Button onClick={handleVerifyChainAnchors} isLoading={chainAnchorLoading} variant="outline">
            Verify Chain Anchors
          </Button>
        )}
      </div>

      {(verified !== null || zkpResult || commitmentMatch || chainResult || chainAnchorResult) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-3">Verification Summary</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className={`p-3 rounded ${verified === true ? "bg-green-100 border border-green-300" : verified === false ? "bg-red-100 border border-red-300" : "bg-gray-100 border border-gray-300"}`}>
              <div className="text-sm font-medium mb-1 flex items-center justify-between">
                <span>VC Signatures</span>
                <span className={`text-[11px] px-2 py-0.5 rounded border ${getStatusMeta(verified).badge} ${getStatusMeta(verified).tone}`}>
                  {getStatusMeta(verified).label}
                </span>
              </div>
              <div className="text-xs text-gray-600 mb-1">EIP-712 verification</div>
              {verified === true && <div className="text-green-700 font-semibold">Valid</div>}
              {verified === false && <div className="text-red-700 font-semibold">Invalid</div>}
              {verified === null && <div className="text-gray-500">Not checked</div>}
            </div>

            <div className={`p-3 rounded ${zkpResult?.verified === true ? "bg-green-100 border border-green-300" : zkpResult?.verified === false ? "bg-red-100 border border-red-300" : "bg-gray-100 border border-gray-300"}`}>
              <div className="text-sm font-medium mb-1 flex items-center justify-between">
                <span>ZKP Proof</span>
                <span className={`text-[11px] px-2 py-0.5 rounded border ${getStatusMeta(zkpResult?.verified).badge} ${getStatusMeta(zkpResult?.verified).tone}`}>
                  {getStatusMeta(zkpResult?.verified).label}
                </span>
              </div>
              <div className="text-xs text-gray-600 mb-1">Price range proof</div>
              {zkpResult?.verified === true && <div className="text-green-700 font-semibold">Valid</div>}
              {zkpResult?.verified === false && <div className="text-red-700 font-semibold">Invalid</div>}
              {!zkpResult && <div className="text-gray-500">Not checked</div>}
            </div>

            <div className={`p-3 rounded ${commitmentMatch?.verified === true ? "bg-green-100 border border-green-300" : commitmentMatch?.verified === false ? "bg-red-100 border border-red-300" : (!provider || !contractAddress) ? "bg-gray-50 border border-gray-200" : "bg-gray-100 border border-gray-300"}`}>
              <div className="text-sm font-medium mb-1 flex items-center justify-between">
                <span>VC Hash Anchor</span>
                <span className={`text-[11px] px-2 py-0.5 rounded border ${getStatusMeta(commitmentMatch?.verified).badge} ${getStatusMeta(commitmentMatch?.verified).tone}`}>
                  {getStatusMeta(commitmentMatch?.verified).label}
                </span>
              </div>
              <div className="text-xs text-gray-600 mb-1">Current VC on-chain hash(VC CID)</div>
              {commitmentMatch?.verified === true && <div className="text-green-700 font-semibold">Matches</div>}
              {commitmentMatch?.verified === false && <div className="text-red-700 font-semibold">Mismatch</div>}
              {(!provider || !contractAddress) && <div className="text-gray-500 text-xs">Requires contract</div>}
              {!commitmentMatch && provider && contractAddress && <div className="text-gray-500">Not checked</div>}
            </div>

            <div className={`p-3 rounded ${chainResult?.continuity?.verified === true ? "bg-green-100 border border-green-300" : chainResult?.continuity?.verified === false ? "bg-red-100 border border-red-300" : "bg-gray-100 border border-gray-300"}`}>
              <div className="text-sm font-medium mb-1 flex items-center justify-between">
                <span>Provenance Continuity</span>
                <span className={`text-[11px] px-2 py-0.5 rounded border ${getStatusMeta(chainResult?.continuity?.verified).badge} ${getStatusMeta(chainResult?.continuity?.verified).tone}`}>
                  {getStatusMeta(chainResult?.continuity?.verified).label}
                </span>
              </div>
              <div className="text-xs text-gray-600 mb-1">componentCredentials linkage</div>
              {chainResult?.continuity?.verified === true && <div className="text-green-700 font-semibold">Valid</div>}
              {chainResult?.continuity?.verified === false && <div className="text-red-700 font-semibold">Broken</div>}
              {!chainResult?.continuity && <div className="text-gray-500">Not checked</div>}
            </div>

            <div className={`p-3 rounded ${chainResult?.governance?.verified === true ? "bg-green-100 border border-green-300" : chainResult?.governance?.verified === false ? "bg-red-100 border border-red-300" : "bg-gray-100 border border-gray-300"}`}>
              <div className="text-sm font-medium mb-1 flex items-center justify-between">
                <span>Governance Consistency</span>
                <span className={`text-[11px] px-2 py-0.5 rounded border ${getStatusMeta(chainResult?.governance?.verified).badge} ${getStatusMeta(chainResult?.governance?.verified).tone}`}>
                  {getStatusMeta(chainResult?.governance?.verified).label}
                </span>
              </div>
              <div className="text-xs text-gray-600 mb-1">next issuer must be component holder</div>
              {chainResult?.governance?.verified === true && <div className="text-green-700 font-semibold">Consistent</div>}
              {chainResult?.governance?.verified === false && <div className="text-red-700 font-semibold">Mismatch</div>}
              {!chainResult?.governance && <div className="text-gray-500">Not checked</div>}
            </div>

            <div className={`p-3 rounded ${chainAnchorResult?.verified === true ? "bg-green-100 border border-green-300" : chainAnchorResult?.verified === false ? "bg-red-100 border border-red-300" : (!provider) ? "bg-gray-50 border border-gray-200" : "bg-gray-100 border border-gray-300"}`}>
              <div className="text-sm font-medium mb-1 flex items-center justify-between">
                <span>Chain-Wide Anchors</span>
                <span className={`text-[11px] px-2 py-0.5 rounded border ${getStatusMeta(chainAnchorResult?.verified).badge} ${getStatusMeta(chainAnchorResult?.verified).tone}`}>
                  {getStatusMeta(chainAnchorResult?.verified).label}
                </span>
              </div>
              <div className="text-xs text-gray-600 mb-1">hash(CID) vs on-chain vcHash for each step</div>
              {chainAnchorResult?.verified === true && <div className="text-green-700 font-semibold">All Match</div>}
              {chainAnchorResult?.verified === false && <div className="text-red-700 font-semibold">Failures</div>}
              {!provider && <div className="text-gray-500 text-xs">Requires provider</div>}
              {!chainAnchorResult && provider && <div className="text-gray-500">Not checked</div>}
            </div>
          </div>

          {allVerificationsComplete && (
            <div className="mt-3 pt-3 border-t border-blue-200">
              <div className="text-green-700 font-semibold">All verifications passed.</div>
            </div>
          )}

          {recommendedActions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-blue-200">
              <h5 className="text-sm font-semibold text-amber-800 mb-2">Recommended Actions</h5>
              <ul className="text-xs text-amber-800 list-disc pl-5 space-y-1">
                {recommendedActions.map((action, idx) => (
                  <li key={`${action}-${idx}`}>{action}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {(result?.issuer || result?.holder || zkpTriggered || commitmentMatch || chainResult || chainAnchorResult) && (
        <div className="space-y-4">
          <h4 className="font-semibold text-gray-900">Detailed Verification Results</h4>

          {result?.issuer && (
            <VerificationBox title="Seller (Issuer) Signature Verification" result={result.issuer} did={vc?.issuer?.id} />
          )}

          {result?.holder && !result?.holder?.skipped && (
            <VerificationBox title="Buyer (Holder) Signature Verification" result={result.holder} did={vc?.holder?.id} />
          )}

          {zkpTriggered && zkpResult && typeof zkpResult.verified === "boolean" && (
            <ZKPVerificationBox proof={zkpResult} />
          )}

          {commitmentMatch && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-3">On-Chain VC Hash Anchor Verification</h4>
              <div className={`mb-3 p-3 rounded ${commitmentMatch.verified ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                {commitmentMatch.verified ? (
                  <div className="text-green-700 font-semibold">VC Hash Anchor: VERIFIED</div>
                ) : (
                  <div className="text-red-700 font-semibold">VC Hash Anchor: FAILED</div>
                )}
              </div>
              {commitmentMatch.vcHash && commitmentMatch.onChainVcHash && (
                <div className="text-xs text-gray-600 space-y-2">
                  <div>
                    <strong>Computed hash(VC CID):</strong>
                    <div className="font-mono text-xs mt-1 break-all bg-white p-2 rounded border">{commitmentMatch.vcHash}</div>
                  </div>
                  <div>
                    <strong>On-chain vcHash:</strong>
                    <div className="font-mono text-xs mt-1 break-all bg-white p-2 rounded border">{commitmentMatch.onChainVcHash}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {chainResult && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-gray-900">Provenance and Governance Verification</h4>

              <div className={`p-3 rounded ${chainResult.continuity?.verified ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                <div className={chainResult.continuity?.verified ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>
                  Provenance Continuity: {chainResult.continuity?.verified ? "VERIFIED" : "FAILED"}
                </div>
                <div className="text-sm mt-1">{chainResult.continuity?.reason || "No continuity result"}</div>
              </div>

              <div className={`p-3 rounded ${chainResult.governance?.verified ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                <div className={chainResult.governance?.verified ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>
                  Governance Consistency: {chainResult.governance?.verified ? "VERIFIED" : "FAILED"}
                </div>
                <div className="text-sm mt-1">{chainResult.governance?.reason || "No governance result"}</div>
                {Array.isArray(chainResult.governance?.violations) && chainResult.governance.violations.length > 0 && (
                  <div className="text-xs mt-2 space-y-1">
                    {chainResult.governance.violations.slice(0, 5).map((m, idx) => (
                      <div key={idx} className="bg-white border rounded p-2">
                        Governance mismatch: parent {m.from} vs component {m.to}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-xs text-gray-600">Provenance nodes checked: {chainResult.chainLength || 0}</div>
            </div>
          )}

          {chainAnchorResult && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-gray-900">Chain-Wide On-Chain Anchor Verification</h4>
              <div className={`p-3 rounded ${chainAnchorResult.verified ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                <div className={chainAnchorResult.verified ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>
                  Chain Anchors: {chainAnchorResult.verified ? "VERIFIED" : "FAILED"}
                </div>
                {chainAnchorResult.error ? (
                  <div className="text-sm mt-1">{chainAnchorResult.error}</div>
                ) : (
                  <div className="text-sm mt-1">Checked {chainAnchorResult.checked || 0} / {chainAnchorResult.total || 0} chain steps.</div>
                )}
              </div>
              {Array.isArray(chainAnchorResult.failed) && chainAnchorResult.failed.length > 0 && (
                <div className="text-xs space-y-1">
                  {chainAnchorResult.failed.slice(0, 5).map((f, idx) => (
                    <div key={idx} className="bg-white border rounded p-2">
                      CID {f.cid}: {f.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <Button variant={showVC ? "ghost" : "outline"} onClick={() => setShowVC((s) => !s)} icon={showVC ? EyeOff : Eye}>
          {showVC ? "Hide VC" : "View VC"}
        </Button>
      </div>

      {showVC && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <h4 className="font-semibold mb-3">Verifiable Credential (Full JSON)</h4>
          <VCViewer vc={vc} />
        </div>
      )}
    </div>
  );
};

export default VerifyVCInline;
