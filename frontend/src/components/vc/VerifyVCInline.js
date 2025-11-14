import React, { useState } from "react";
import { verifyVCWithServer } from "../../utils/verifyVc";
import VCViewer from "./VCViewer";
import VerificationBox from "./VerifyVCTab-Enhanced";
import ZKPVerificationBox from "./ZKPVerificationBox";
import { extractZKPProof } from "../../utils/verifyZKP";
import { verifyCommitmentMatch } from "../../utils/commitmentUtils";
import { ethers } from "ethers";
import ProductEscrowABI from "../../abis/ProductEscrow_Initializer.json";

import { Button } from "../ui/button";
import { AlertBadge } from "../ui/AlertBadge";

import {
  CheckCircle2,
  ShieldCheck,
  Eye,
  EyeOff,
  Link as LinkIcon,
} from "lucide-react";

const VerifyVCInline = ({ vc, cid, provider, contractAddress }) => {
  const [verified, setVerified] = useState(null);      // true | false | null
  const [result, setResult] = useState({});
  const [error, setError] = useState("");

  const [zkpResult, setZkpResult] = useState(null);
  const [zkpTriggered, setZkpTriggered] = useState(false);
  
  const [commitmentMatch, setCommitmentMatch] = useState(null);  // ✅ On-chain commitment match
  const [commitmentLoading, setCommitmentLoading] = useState(false);

  const [showVC, setShowVC] = useState(false);

  const [vcLoading, setVcLoading] = useState(false);
  const [zkpLoading, setZkpLoading] = useState(false);

  /* ─── handlers ────────────────────────────────────────────── */
  const handleVerify = async () => {
    setVcLoading(true);
    try {
      // ✅ Pass contractAddress to verifyVCWithServer for verifyingContract binding
      const res = await verifyVCWithServer(vc, contractAddress);
      setVerified(res.success);
      setResult(res);
      setError(res.error || "");
    } catch (err) {
      setVerified(false);
      setError(err.message || "Verification failed");
    } finally {
      setVcLoading(false);
    }
  };

  const handleVerifyZKP = async () => {
    setZkpLoading(true);
    setZkpTriggered(true);
    const stageLabel = vc?.credentialSubject?.previousCredential ? 'post-purchase VC (Stage 2/3)' : 'listing VC (Stage 0)';
    console.log(`[Flow][Audit] Running ZKP verification for ${stageLabel}.`);
    try {
      const { commitment, proof, protocol, proofType, bindingTag } = extractZKPProof(vc);
      const endpoint =
        proofType === "zkRangeProof-v1" || protocol === "bulletproofs-pedersen"
          ? "verify-value-commitment"
          : "verify";
      const zkpBackendUrl = process.env.REACT_APP_ZKP_BACKEND_URL || 'http://localhost:5010';
      
      // ✅ Include binding tag in verification request if available
      const requestBody = {
        commitment,
        proof,
        ...(bindingTag && { binding_tag_hex: bindingTag }),
      };
      
      const res = await fetch(`${zkpBackendUrl}/zkp/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      setZkpResult(data);
      
      if (data?.verified) {
        console.log(`[Flow][Audit] ZKP verified ✔︎ – commitment proves the hidden price is within the allowed range for the ${stageLabel}.`);
      } else {
        console.warn(`[Flow][Audit] ZKP verification failed ✖︎ – proof does not validate for the ${stageLabel}.`, data);
      }
      
      // Log binding tag verification
      if (bindingTag) {
        console.log("✅ ZKP verification with binding tag:", bindingTag);
      } else {
        console.warn("⚠️ ZKP verification without binding tag (backward compatible)");
      }
    } catch (err) {
      console.error("❌ ZKP verify error:", err);
      setZkpResult({ verified: false, error: err.message || "Error verifying ZKP." });
    } finally {
      setZkpLoading(false);
    }
  };

  // ✅ Step 5: Verify commitment matches on-chain commitment (Auditor Flow)
  const handleVerifyCommitmentMatch = async () => {
    if (!provider || !contractAddress) {
      setCommitmentMatch({ verified: false, error: "Provider or contract address not available" });
      return;
    }

    setCommitmentLoading(true);
    const stageLabel = vc?.credentialSubject?.previousCredential ? 'post-purchase VC (Stage 2/3)' : 'listing VC (Stage 0)';
    console.log(`[Flow][Audit] Checking VC commitment against on-chain escrow for the ${stageLabel}.`);
    try {
      // Extract commitment from VC
      const { commitment: vcCommitment } = extractZKPProof(vc);
      
      // Read on-chain commitment from contract
      const contract = new ethers.Contract(contractAddress, ProductEscrowABI.abi, provider);
      const onChainCommitment = await contract.publicPriceCommitment();
      
      // Normalize commitments (remove 0x, lowercase)
      const vcCommitmentNormalized = vcCommitment.toLowerCase().replace(/^0x/, '');
      const onChainCommitmentNormalized = onChainCommitment.toLowerCase().replace(/^0x/, '');
      
      // Verify match
      const matches = verifyCommitmentMatch(vcCommitment, onChainCommitment);
      
      setCommitmentMatch({
        verified: matches,
        vcCommitment: vcCommitmentNormalized,
        onChainCommitment: onChainCommitmentNormalized,
        message: matches 
          ? "✅ Commitment matches on-chain commitment" 
          : "❌ Commitment does not match on-chain commitment"
      });

      if (matches) {
        console.log(`[Flow][Audit] Commitment verified ✔︎ – the VC matches the escrow’s stored commitment for the ${stageLabel}.`);
      } else {
        console.warn(`[Flow][Audit] Commitment mismatch ✖︎ – VC commitment differs from escrow for the ${stageLabel}.`, {
          vcCommitment: vcCommitmentNormalized,
          onChainCommitment: onChainCommitmentNormalized,
        });
      }
    } catch (err) {
      console.error("❌ Commitment verification error:", err);
      setCommitmentMatch({ verified: false, error: err.message || "Error verifying commitment match" });
    } finally {
      setCommitmentLoading(false);
    }
  };


  // Run all verifications at once (for auditors)
  const handleRunAllVerifications = async () => {
    await handleVerify();
    await handleVerifyZKP();
    if (provider && contractAddress) {
      await handleVerifyCommitmentMatch();
    }
  };

  const allVerificationsComplete = 
    verified === true && 
    zkpResult?.verified === true && 
    (commitmentMatch?.verified === true || (!provider || !contractAddress));

  /* ─── render ──────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Auditor Section Header */}
      <div className="border-b pb-4">
        <h3 className="text-lg font-semibold mb-2">🔍 Auditor Verification</h3>
        <p className="text-sm text-gray-600">
          Verify the authenticity and integrity of this Verifiable Credential. Each check validates a different aspect of the credential.
        </p>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Run All Button (for auditors) */}
        {(!allVerificationsComplete) && (
          <Button
            onClick={handleRunAllVerifications}
            isLoading={vcLoading || zkpLoading || commitmentLoading}
            variant="default"
            className="bg-blue-600 hover:bg-blue-700"
          >
            Run All Verifications
          </Button>
        )}

        <div className="flex-1 border-l pl-4 ml-2">
          <div className="text-xs text-gray-500 mb-1">Individual Checks:</div>
          <div className="flex flex-wrap gap-2">
            {verified !== true && (
              <Button
                onClick={handleVerify}
                isLoading={vcLoading}
                icon={CheckCircle2}
                variant="outline"
                title="Verify EIP-712 signatures of seller and buyer"
              >
                Verify VC Signatures
              </Button>
            )}

            {(!zkpResult || zkpResult.verified !== true) && (
              <Button
                onClick={handleVerifyZKP}
                isLoading={zkpLoading}
                icon={ShieldCheck}
                variant="outline"
                title="Verify zero-knowledge proof that price is in valid range"
              >
                Verify ZKP Proof
              </Button>
            )}

            {provider && contractAddress && (!commitmentMatch || !commitmentMatch.verified) && (
              <Button
                onClick={handleVerifyCommitmentMatch}
                isLoading={commitmentLoading}
                icon={LinkIcon}
                variant="outline"
                title="Verify VC commitment matches on-chain commitment"
              >
                Verify Commitment Match
              </Button>
            )}
          </div>
        </div>

        <Button
          variant={showVC ? "ghost" : "outline"}
          onClick={() => setShowVC((s) => !s)}
          icon={showVC ? EyeOff : Eye}
        >
          {showVC ? "Hide VC" : "View VC"}
        </Button>
      </div>

      {/* Verification Summary (for auditors) */}
      {(verified !== null || zkpResult || commitmentMatch) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-3">📊 Verification Summary</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className={`p-3 rounded ${verified === true ? 'bg-green-100 border border-green-300' : verified === false ? 'bg-red-100 border border-red-300' : 'bg-gray-100 border border-gray-300'}`}>
              <div className="text-sm font-medium mb-1">VC Signatures</div>
              <div className="text-xs text-gray-600 mb-1">EIP-712 signature verification</div>
              {verified === true && <div className="text-green-700 font-semibold">✅ Valid</div>}
              {verified === false && <div className="text-red-700 font-semibold">❌ Invalid</div>}
              {verified === null && <div className="text-gray-500">⏳ Not checked</div>}
            </div>
            <div className={`p-3 rounded ${zkpResult?.verified === true ? 'bg-green-100 border border-green-300' : zkpResult?.verified === false ? 'bg-red-100 border border-red-300' : 'bg-gray-100 border border-gray-300'}`}>
              <div className="text-sm font-medium mb-1">ZKP Proof</div>
              <div className="text-xs text-gray-600 mb-1">Price range proof verification</div>
              {zkpResult?.verified === true && <div className="text-green-700 font-semibold">✅ Valid</div>}
              {zkpResult?.verified === false && <div className="text-red-700 font-semibold">❌ Invalid</div>}
              {!zkpResult && <div className="text-gray-500">⏳ Not checked</div>}
            </div>
            <div className={`p-3 rounded ${commitmentMatch?.verified === true ? 'bg-green-100 border border-green-300' : commitmentMatch?.verified === false ? 'bg-red-100 border border-red-300' : (!provider || !contractAddress) ? 'bg-gray-50 border border-gray-200' : 'bg-gray-100 border border-gray-300'}`}>
              <div className="text-sm font-medium mb-1">Commitment Match</div>
              <div className="text-xs text-gray-600 mb-1">On-chain commitment verification</div>
              {commitmentMatch?.verified === true && <div className="text-green-700 font-semibold">✅ Matches</div>}
              {commitmentMatch?.verified === false && <div className="text-red-700 font-semibold">❌ Mismatch</div>}
              {(!provider || !contractAddress) && <div className="text-gray-500 text-xs">⚠️ Requires contract</div>}
              {!commitmentMatch && provider && contractAddress && <div className="text-gray-500">⏳ Not checked</div>}
            </div>
          </div>
          {allVerificationsComplete && (
            <div className="mt-3 pt-3 border-t border-blue-200">
              <div className="text-green-700 font-semibold">✅ All verifications passed! This credential is authentic and valid.</div>
            </div>
          )}
        </div>
      )}

      {/* Detailed Verification Results */}
      {(result?.issuer || result?.holder || zkpTriggered || commitmentMatch) && (
        <div className="space-y-4">
          <h4 className="font-semibold text-gray-900">Detailed Verification Results</h4>
          
          {/* VC Signature Verification Results */}
          {result?.issuer && (
            <VerificationBox
              title="📝 Seller (Issuer) Signature Verification"
              result={result.issuer}
              did={vc?.issuer?.id}
            />
          )}
          {result?.holder && (
            <VerificationBox
              title="📝 Buyer (Holder) Signature Verification"
              result={result.holder}
              did={vc?.holder?.id}
            />
          )}

          {/* ZKP Verification Result */}
          {zkpTriggered && zkpResult && typeof zkpResult.verified === "boolean" && (
            <ZKPVerificationBox proof={zkpResult} />
          )}

          {/* Commitment Match Result */}
          {commitmentMatch && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-3">🔗 On-Chain Commitment Verification</h4>
              
              <div className={`mb-3 p-3 rounded ${commitmentMatch.verified ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                {commitmentMatch.verified ? (
                  <div>
                    <div className="text-green-700 font-semibold mb-1">✅ Commitment Match: VERIFIED</div>
                    <div className="text-sm text-green-600">
                      The VC commitment matches the on-chain commitment. The commitment is immutable and hasn't been tampered with.
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-red-700 font-semibold mb-1">❌ Commitment Match: FAILED</div>
                    <div className="text-sm text-red-600">
                      {commitmentMatch.error || commitmentMatch.message || "The VC commitment does not match the on-chain commitment."}
                    </div>
                  </div>
                )}
              </div>

              {/* Commitment Details */}
              {commitmentMatch.vcCommitment && commitmentMatch.onChainCommitment && (
                <div className="text-xs text-gray-600 space-y-2">
                  <div>
                    <strong>VC Commitment:</strong>
                    <div className="font-mono text-xs mt-1 break-all bg-white p-2 rounded border">
                      {commitmentMatch.vcCommitment}
                    </div>
                  </div>
                  <div>
                    <strong>On-Chain Commitment:</strong>
                    <div className="font-mono text-xs mt-1 break-all bg-white p-2 rounded border">
                      {commitmentMatch.onChainCommitment}
                    </div>
                  </div>
                </div>
              )}

              {/* What This Proves */}
              <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600 space-y-1">
                <div><strong>What this verification proves:</strong></div>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>The VC commitment hasn't been tampered with</li>
                  <li>The commitment matches what was stored on-chain at product creation</li>
                  <li>The commitment is immutable (frozen on-chain)</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VC Viewer */}
      {showVC && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <h4 className="font-semibold mb-3">📄 Verifiable Credential (Full JSON)</h4>
          <VCViewer vc={vc} />
        </div>
      )}
    </div>
  );
};

export default VerifyVCInline;
