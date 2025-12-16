import React, { useState } from "react";
import { verifyVCWithServer } from "../../utils/verifyVc";
import VCViewer from "./VCViewer";
import VerificationBox from "./VerifyVCTab-Enhanced";
import ZKPVerificationBox from "./ZKPVerificationBox";
import { extractZKPProof, extractTxHashCommitment, extractPurchaseTxHashCommitment, verifyTxHashCommitment, verifyBindingTagsMatch, verifyTransactionOnChain, verifyPurchaseTransactionOnChain } from "../../utils/verifyZKP";
import { verifyCommitmentMatch } from "../../utils/commitmentUtils";
import { ethers } from "ethers";
import ProductEscrowABI from "../../abis/ProductEscrow_Initializer.json";

import { Button } from "../ui/button";
// import { AlertBadge } from "../ui/AlertBadge"; // Not currently used

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
  
  const [txHashCommitmentResult, setTxHashCommitmentResult] = useState(null);  // ✅ TX hash commitment verification (Step 6)
  const [txHashCommitmentLoading, setTxHashCommitmentLoading] = useState(false);
  
  const [bindingTagMatchResult, setBindingTagMatchResult] = useState(null);  // Feature 2: Binding tag match verification
  const [bindingTagMatchLoading, setBindingTagMatchLoading] = useState(false);
  
  const [transactionVerificationResult, setTransactionVerificationResult] = useState(null);  // Feature 1: Delivery transaction verification
  const [transactionVerificationLoading, setTransactionVerificationLoading] = useState(false);
  
  const [purchaseTransactionVerificationResult, setPurchaseTransactionVerificationResult] = useState(null);  // Feature 1: Purchase transaction verification
  const [purchaseTransactionVerificationLoading, setPurchaseTransactionVerificationLoading] = useState(false);

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


  // ✅ Step 6: Verify TX hash commitment (for privacy verification)
  // Checks for delivery TX hash commitment first, then purchase TX hash commitment
  const handleVerifyTxHashCommitment = async () => {
    setTxHashCommitmentLoading(true);
    console.log('[Flow][Audit] Running TX hash commitment verification (Step 6).');
    console.log('[Flow][Audit] VC being verified:', JSON.stringify(vc, null, 2));
    console.log('[Flow][Audit] VC credentialSubject:', JSON.stringify(vc?.credentialSubject, null, 2));
    try {
      // First check for delivery TX hash commitment (Stage 3)
      let txHashCommitment = extractTxHashCommitment(vc);
      let commitmentType = 'delivery';
      
      // If not found, check for purchase TX hash commitment (Stage 2)
      if (!txHashCommitment) {
        console.log('[Flow][Audit] No delivery TX hash commitment found, checking for purchase TX hash commitment...');
        const purchaseCommitment = extractPurchaseTxHashCommitment(vc);
        if (purchaseCommitment) {
          txHashCommitment = purchaseCommitment;
          commitmentType = 'purchase';
          console.log('[Flow][Audit] Found purchase TX hash commitment (Stage 2 VC)');
        }
      } else {
        console.log('[Flow][Audit] Found delivery TX hash commitment (Stage 3 VC)');
      }
      
      console.log('[Flow][Audit] Extracted TX hash commitment:', txHashCommitment, `(type: ${commitmentType})`);
      
      if (!txHashCommitment) {
        console.warn('[Flow][Audit] ⚠️ No TX hash commitment found in VC (neither delivery nor purchase)');
        console.warn('[Flow][Audit] VC credentialSubject keys:', Object.keys(vc?.credentialSubject || {}));
        setTxHashCommitmentResult({
          verified: null,
          message: "⚠️ No TX hash commitment found in VC (optional field)",
          error: commitmentType === 'delivery' 
            ? "TX hash commitment is optional and may not be present in older VCs. Make sure you completed delivery AFTER the fix was applied."
            : "No purchase or delivery TX hash commitment found. This VC may be from before these features were added.",
        });
        return;
      }
      
      const zkpBackendUrl = process.env.REACT_APP_ZKP_BACKEND_URL || 'http://localhost:5010';
      const result = await verifyTxHashCommitment(
        txHashCommitment.commitment,
        txHashCommitment.proof,
        zkpBackendUrl,
        txHashCommitment.bindingTag || null // Feature 2: Pass binding tag for verification
      );
      
      const commitmentLabel = commitmentType === 'purchase' ? 'Purchase TX hash commitment' : 'Delivery TX hash commitment';
      setTxHashCommitmentResult({
        verified: result.verified,
        commitment: txHashCommitment.commitment.substring(0, 20) + '...',
        protocol: txHashCommitment.protocol,
        version: txHashCommitment.version,
        commitmentType: commitmentType,
        message: result.verified
          ? `✅ ${commitmentLabel} verified - transaction hash is hidden but valid`
          : `❌ ${commitmentLabel} verification failed: ${result.error || "Unknown error"}`,
        error: result.error,
      });
      
      if (result.verified) {
        console.log('[Flow][Audit] TX hash commitment verified ✔︎ – transaction hash is hidden but commitment is valid.');
      } else {
        console.warn('[Flow][Audit] TX hash commitment verification failed ✖︎', result.error);
      }
    } catch (err) {
      console.error("❌ TX hash commitment verification error:", err);
      setTxHashCommitmentResult({
        verified: false,
        error: err.message || "Error verifying TX hash commitment",
        message: `❌ Error: ${err.message || "Failed to verify TX hash commitment"}`,
      });
    } finally {
      setTxHashCommitmentLoading(false);
    }
  };

  // Feature 2: Verify binding tags match between purchase and delivery TX hash commitments
  const handleVerifyBindingTagsMatch = async () => {
    setBindingTagMatchLoading(true);
    console.log('[Flow][Audit] Running binding tag match verification (Feature 2).');
    try {
      const purchaseCommitment = extractPurchaseTxHashCommitment(vc);
      const deliveryCommitment = extractTxHashCommitment(vc);
      
      if (!purchaseCommitment || !deliveryCommitment) {
        setBindingTagMatchResult({
          verified: false,
          message: "⚠️ Both purchase and delivery TX hash commitments are required to verify linkage",
          error: !purchaseCommitment ? "Purchase TX hash commitment not found" : "Delivery TX hash commitment not found",
        });
        return;
      }
      
      const matches = verifyBindingTagsMatch(purchaseCommitment, deliveryCommitment);
      
      setBindingTagMatchResult({
        verified: matches,
        purchaseBindingTag: purchaseCommitment.bindingTag ? purchaseCommitment.bindingTag.substring(0, 20) + '...' : null,
        deliveryBindingTag: deliveryCommitment.bindingTag ? deliveryCommitment.bindingTag.substring(0, 20) + '...' : null,
        message: matches
          ? "✅ Binding tags match - purchase and delivery TX hash commitments are linked"
          : "❌ Binding tags do not match - purchase and delivery TX hash commitments are not linked",
        error: matches ? undefined : "Binding tags do not match or are missing",
      });
      
      if (matches) {
        console.log('[Flow][Audit] Binding tags match ✔︎ – purchase and delivery TX hash commitments are linked.');
      } else {
        console.warn('[Flow][Audit] Binding tags do not match ✖︎ – purchase and delivery TX hash commitments are not linked.');
      }
    } catch (err) {
      console.error("❌ Binding tag match verification error:", err);
      setBindingTagMatchResult({
        verified: false,
        error: err.message || "Error verifying binding tag match",
      });
    } finally {
      setBindingTagMatchLoading(false);
    }
  };

  // Feature 1: Purchase Transaction Verification (Event-Based)
  const handleVerifyPurchaseTransactionOnChain = async () => {
    setPurchaseTransactionVerificationLoading(true);
    console.log('[Flow][Audit] Running purchase transaction verification (Feature 1).');
    try {
      const purchaseCommitment = extractPurchaseTxHashCommitment(vc);
      
      if (!purchaseCommitment) {
        setPurchaseTransactionVerificationResult({
          verified: null,
          message: "⚠️ No purchase TX hash commitment found in VC (required for purchase transaction verification)",
          error: "Purchase TX hash commitment is required for purchase transaction verification",
        });
        return;
      }
      
      if (!provider || !contractAddress) {
        setPurchaseTransactionVerificationResult({
          verified: false,
          message: "❌ Provider or contract address not available",
          error: "Provider and contract address are required for purchase transaction verification",
        });
        return;
      }
      
      // Get VC CID from props or extract from VC
      const vcCID = cid || vc?.id || "";
      if (!vcCID) {
        setPurchaseTransactionVerificationResult({
          verified: false,
          message: "❌ VC CID not available",
          error: "VC CID is required for purchase transaction verification",
        });
        return;
      }
      
      // Ensure commitment has "0x" prefix for bytes32 format
      let commitmentHex = purchaseCommitment.commitment;
      if (!commitmentHex.startsWith('0x')) {
        commitmentHex = '0x' + commitmentHex;
      }
      
      const result = await verifyPurchaseTransactionOnChain(
        commitmentHex,
        contractAddress,
        vcCID,
        provider
      );
      
      setPurchaseTransactionVerificationResult({
        verified: result.verified,
        blockNumber: result.blockNumber,
        // Don't store transactionHash in state - it's a privacy leak
        message: result.verified
          ? `✅ Purchase transaction verified: exists on-chain and succeeded (privacy maintained - hash hidden)`
          : `❌ Purchase transaction verification failed: ${result.error || "Unknown error"}`,
        error: result.error,
      });
      
      if (result.verified) {
        console.log('[Flow][Audit] Purchase transaction verified ✔︎ – transaction exists on-chain and succeeded.');
      } else {
        console.warn('[Flow][Audit] Purchase transaction verification failed ✖︎', result.error);
      }
    } catch (err) {
      console.error("❌ Purchase transaction verification error:", err);
      setPurchaseTransactionVerificationResult({
        verified: false,
        error: err.message || "Error verifying purchase transaction",
        message: `❌ Error: ${err.message || "Failed to verify purchase transaction"}`,
      });
    } finally {
      setPurchaseTransactionVerificationLoading(false);
    }
  };

  // Feature 1: Delivery Transaction Verification (Event-Based)
  const handleVerifyTransactionOnChain = async () => {
    setTransactionVerificationLoading(true);
    console.log('[Flow][Audit] Running delivery transaction verification (Feature 1).');
    try {
      // Check for delivery TX hash commitment (required for transaction verification)
      const txHashCommitment = extractTxHashCommitment(vc);
      
      if (!txHashCommitment) {
        setTransactionVerificationResult({
          verified: null,
          message: "⚠️ No delivery TX hash commitment found in VC (required for delivery transaction verification)",
          error: "Delivery TX hash commitment is required for delivery transaction verification",
        });
        return;
      }
      
      if (!provider || !contractAddress) {
        setTransactionVerificationResult({
          verified: false,
          message: "❌ Provider or contract address not available",
          error: "Provider and contract address are required for transaction verification",
        });
        return;
      }
      
      // Get VC CID from props or extract from VC
      const vcCID = cid || vc?.id || "";
      if (!vcCID) {
        setTransactionVerificationResult({
          verified: false,
          message: "❌ VC CID not available",
          error: "VC CID is required for transaction verification",
        });
        return;
      }
      
      // Ensure commitment has "0x" prefix for bytes32 format
      let commitmentHex = txHashCommitment.commitment;
      if (!commitmentHex.startsWith('0x')) {
        commitmentHex = '0x' + commitmentHex;
      }
      
      const result = await verifyTransactionOnChain(
        commitmentHex,
        contractAddress,
        vcCID,
        provider
      );
      
      setTransactionVerificationResult({
        verified: result.verified,
        blockNumber: result.blockNumber,
        // Don't store transactionHash in state - it's a privacy leak
        message: result.verified
          ? `✅ Delivery transaction verified: exists on-chain and succeeded (privacy maintained - hash hidden)`
          : `❌ Transaction verification failed: ${result.error || "Unknown error"}`,
        error: result.error,
      });
      
      if (result.verified) {
        console.log('[Flow][Audit] Transaction verified ✔︎ – transaction exists on-chain and succeeded.');
      } else {
        console.warn('[Flow][Audit] Transaction verification failed ✖︎', result.error);
      }
    } catch (err) {
      console.error("❌ Transaction verification error:", err);
      setTransactionVerificationResult({
        verified: false,
        error: err.message || "Error verifying transaction on-chain",
        message: `❌ Error: ${err.message || "Failed to verify transaction on-chain"}`,
      });
    } finally {
      setTransactionVerificationLoading(false);
    }
  };

  // Run all verifications at once (for auditors)
  const handleRunAllVerifications = async () => {
    await handleVerify();
    await handleVerifyZKP();
    if (provider && contractAddress) {
      await handleVerifyCommitmentMatch();
    }
    await handleVerifyTxHashCommitment(); // ✅ Include TX hash commitment verification
    await handleVerifyPurchaseTransactionOnChain(); // Feature 1: Include purchase transaction verification
    await handleVerifyBindingTagsMatch(); // Feature 2: Include binding tag match verification
    await handleVerifyTransactionOnChain(); // Feature 1: Include delivery transaction verification
  };

  const allVerificationsComplete = 
    verified === true && 
    zkpResult?.verified === true && 
    (commitmentMatch?.verified === true || (!provider || !contractAddress)) &&
    (txHashCommitmentResult?.verified === true || txHashCommitmentResult?.verified === null); // null means not present (optional)

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
            isLoading={vcLoading || zkpLoading || commitmentLoading || txHashCommitmentLoading || purchaseTransactionVerificationLoading || transactionVerificationLoading}
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
            {(!txHashCommitmentResult || txHashCommitmentResult.verified === null || txHashCommitmentResult.verified === false) && (
              <Button
                onClick={handleVerifyTxHashCommitment}
                isLoading={txHashCommitmentLoading}
                icon={ShieldCheck}
                variant="outline"
                title="Verify TX hash commitment (privacy verification)"
              >
                Verify TX Hash Commitment
              </Button>
            )}

            {provider && contractAddress && (!purchaseTransactionVerificationResult || !purchaseTransactionVerificationResult.verified) && (
              <Button
                onClick={handleVerifyPurchaseTransactionOnChain}
                isLoading={purchaseTransactionVerificationLoading}
                icon={ShieldCheck}
                variant="outline"
                title="Verify purchase transaction exists on-chain and succeeded (Feature 1)"
              >
                Verify Purchase Transaction
              </Button>
            )}

            {provider && contractAddress && (!transactionVerificationResult || !transactionVerificationResult.verified) && (
              <Button
                onClick={handleVerifyTransactionOnChain}
                isLoading={transactionVerificationLoading}
                icon={ShieldCheck}
                variant="outline"
                title="Verify delivery transaction exists on-chain and succeeded (Feature 1)"
              >
                Verify Delivery Transaction
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
      {(verified !== null || zkpResult || commitmentMatch || txHashCommitmentResult) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-3">📊 Verification Summary</h4>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
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
            <div className={`p-3 rounded ${txHashCommitmentResult?.verified === true ? 'bg-green-100 border border-green-300' : txHashCommitmentResult?.verified === false ? 'bg-red-100 border border-red-300' : txHashCommitmentResult?.verified === null ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-100 border border-gray-300'}`}>
              <div className="text-sm font-medium mb-1">TX Hash Commitment</div>
              <div className="text-xs text-gray-600 mb-1">Transaction hash privacy verification</div>
              {txHashCommitmentResult?.verified === true && <div className="text-green-700 font-semibold">✅ Verified</div>}
              {txHashCommitmentResult?.verified === false && <div className="text-red-700 font-semibold">❌ Failed</div>}
              {txHashCommitmentResult?.verified === null && <div className="text-yellow-700 text-xs">⚠️ Not present</div>}
              {!txHashCommitmentResult && <div className="text-gray-500">⏳ Not checked</div>}
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
      {(result?.issuer || result?.holder || zkpTriggered || commitmentMatch || txHashCommitmentResult || purchaseTransactionVerificationResult || transactionVerificationResult) && (
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

          {/* TX Hash Commitment Result (Step 6) */}
          {txHashCommitmentResult && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-3">
                🔐 TX Hash Commitment Verification (Privacy)
                {txHashCommitmentResult.commitmentType && (
                  <span className="text-xs text-gray-500 ml-2">
                    ({txHashCommitmentResult.commitmentType === 'purchase' ? 'Purchase' : 'Delivery'})
                  </span>
                )}
              </h4>
              
              <div className={`mb-3 p-3 rounded ${txHashCommitmentResult.verified === true ? 'bg-green-50 border border-green-200' : txHashCommitmentResult.verified === false ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                {txHashCommitmentResult.verified === true ? (
                  <div>
                    <div className="text-green-700 font-semibold mb-1">
                      ✅ {txHashCommitmentResult.commitmentType === 'purchase' ? 'Purchase' : 'Delivery'} TX Hash Commitment: VERIFIED
                    </div>
                    <div className="text-sm text-green-600">
                      {txHashCommitmentResult.message || "The transaction hash commitment is valid."}
                    </div>
                  </div>
                ) : txHashCommitmentResult.verified === null ? (
                  <div>
                    <div className="text-yellow-700 font-semibold mb-1">⚠️ TX Hash Commitment: NOT PRESENT</div>
                    <div className="text-sm text-yellow-600">
                      {txHashCommitmentResult.message || "This VC does not contain a TX hash commitment. This is optional and may not be present in older VCs."}
                    </div>
                    {txHashCommitmentResult.commitmentType === 'purchase' && (
                      <div className="text-xs text-yellow-700 mt-2">
                        Note: At Stage 2, only purchase TX hash commitment is available. Delivery TX hash commitment will be available after delivery confirmation (Stage 3).
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="text-red-700 font-semibold mb-1">❌ TX Hash Commitment: VERIFICATION FAILED</div>
                    <div className="text-sm text-red-600">
                      {txHashCommitmentResult.error || txHashCommitmentResult.message || "The TX hash commitment verification failed."}
                    </div>
                  </div>
                )}
              </div>
              
              {txHashCommitmentResult.commitment && (
                <div className="text-xs text-gray-600 space-y-1">
                  <div><strong>Commitment:</strong> {txHashCommitmentResult.commitment}</div>
                  {txHashCommitmentResult.protocol && <div><strong>Protocol:</strong> {txHashCommitmentResult.protocol}</div>}
                  {txHashCommitmentResult.version && <div><strong>Version:</strong> {txHashCommitmentResult.version}</div>}
                </div>
              )}

              {/* What This Proves */}
              <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600 space-y-1">
                <div><strong>What this verification proves:</strong></div>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>The transaction hash is hidden (privacy protection)</li>
                  <li>The commitment proves knowledge of the transaction hash without revealing it</li>
                  <li>The proof is cryptographically valid (Bulletproofs ZKP)</li>
                </ul>
              </div>
            </div>
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

          {/* Purchase Transaction Verification Result (Feature 1) */}
          {purchaseTransactionVerificationResult && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-3">🔍 Purchase Transaction Verification (Feature 1)</h4>
              
              <div className={`mb-3 p-3 rounded ${purchaseTransactionVerificationResult.verified === true ? 'bg-green-50 border border-green-200' : purchaseTransactionVerificationResult.verified === false ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                {purchaseTransactionVerificationResult.verified === true ? (
                  <div>
                    <div className="text-green-700 font-semibold mb-1">✅ Purchase Transaction Verification: VERIFIED</div>
                    <div className="text-sm text-green-600">
                      {purchaseTransactionVerificationResult.message || "The purchase transaction exists on-chain and succeeded."}
                    </div>
                    {purchaseTransactionVerificationResult.blockNumber && (
                      <div className="text-xs text-green-600 mt-1">
                        Block: {purchaseTransactionVerificationResult.blockNumber}
                      </div>
                    )}
                    {/* Transaction hash intentionally hidden to maintain privacy */}
                  </div>
                ) : purchaseTransactionVerificationResult.verified === null ? (
                  <div>
                    <div className="text-yellow-700 font-semibold mb-1">⚠️ Purchase Transaction Verification: NOT AVAILABLE</div>
                    <div className="text-sm text-yellow-600">
                      {purchaseTransactionVerificationResult.message || "Purchase transaction verification is not available (purchase TX hash commitment not found in VC)."}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-red-700 font-semibold mb-1">❌ Purchase Transaction Verification: FAILED</div>
                    <div className="text-sm text-red-600">
                      {purchaseTransactionVerificationResult.message || purchaseTransactionVerificationResult.error || "Purchase transaction verification failed."}
                    </div>
                  </div>
                )}
              </div>

              {/* What This Proves */}
              <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600 space-y-1">
                <div><strong>What this verification proves:</strong></div>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>A purchase transaction exists on-chain and succeeded (verified via event)</li>
                  <li>The transaction matches this VC (commitment and CID verified)</li>
                  <li><strong>Privacy maintained:</strong> The actual transaction hash is never revealed</li>
                  <li>You can prove transaction success without exposing which transaction it was</li>
                </ul>
              </div>
            </div>
          )}

          {/* Delivery Transaction Verification Result (Feature 1) */}
          {transactionVerificationResult && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-3">🔍 Delivery Transaction Verification (Feature 1)</h4>
              
              <div className={`mb-3 p-3 rounded ${transactionVerificationResult.verified === true ? 'bg-green-50 border border-green-200' : transactionVerificationResult.verified === false ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                {transactionVerificationResult.verified === true ? (
                  <div>
                    <div className="text-green-700 font-semibold mb-1">✅ Delivery Transaction Verification: VERIFIED</div>
                    <div className="text-sm text-green-600">
                      {transactionVerificationResult.message || "The delivery transaction exists on-chain and succeeded."}
                    </div>
                    {transactionVerificationResult.blockNumber && (
                      <div className="text-xs text-green-600 mt-1">
                        Block: {transactionVerificationResult.blockNumber}
                      </div>
                    )}
                    {/* Transaction hash intentionally hidden to maintain privacy */}
                  </div>
                ) : transactionVerificationResult.verified === null ? (
                  <div>
                    <div className="text-yellow-700 font-semibold mb-1">⚠️ Delivery Transaction Verification: NOT AVAILABLE</div>
                    <div className="text-sm text-yellow-600">
                      {transactionVerificationResult.message || "Delivery transaction verification is not available (delivery TX hash commitment not found in VC)."}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-red-700 font-semibold mb-1">❌ Delivery Transaction Verification: FAILED</div>
                    <div className="text-sm text-red-600">
                      {transactionVerificationResult.message || transactionVerificationResult.error || "Delivery transaction verification failed."}
                    </div>
                  </div>
                )}
              </div>

              {/* What This Proves */}
              <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600 space-y-1">
                <div><strong>What this verification proves:</strong></div>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>A delivery transaction exists on-chain and succeeded (verified via event)</li>
                  <li>The transaction matches this VC (commitment and CID verified)</li>
                  <li><strong>Privacy maintained:</strong> The actual transaction hash is never revealed</li>
                  <li>You can prove transaction success without exposing which transaction it was</li>
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
