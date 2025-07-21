import React, { useState } from "react";
import { verifyVCWithServer } from "../../utils/verifyVc";
import VCViewer from "./VCViewer";
import VerificationBox from "./VerifyVCTab-Enhanced";
import ZKPVerificationBox from "./ZKPVerificationBox";
import { extractZKPProof } from "../../utils/verifyZKP";

import { Button } from "../ui/button";
import { AlertBadge } from "../ui/AlertBadge";

import {
  CheckCircle2,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";

const VerifyVCInline = ({ vc, cid }) => {
  const [verified, setVerified] = useState(null);      // true | false | null
  const [result, setResult] = useState({});
  const [error, setError] = useState("");

  const [zkpResult, setZkpResult] = useState(null);
  const [zkpTriggered, setZkpTriggered] = useState(false);

  const [showVC, setShowVC] = useState(false);

  const [vcLoading, setVcLoading] = useState(false);
  const [zkpLoading, setZkpLoading] = useState(false);

  /* ─── handlers ────────────────────────────────────────────── */
  const handleVerify = async () => {
    setVcLoading(true);
    try {
      const res = await verifyVCWithServer(vc);
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
    try {
      const { commitment, proof } = extractZKPProof(vc);
      const res = await fetch("http://localhost:5010/zkp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitment, proof }),
      });
      const data = await res.json();
      setZkpResult(data);
    } catch (err) {
      console.error("❌ ZKP verify error:", err);
      setZkpResult({ verified: false, error: err.message || "Error verifying ZKP." });
    } finally {
      setZkpLoading(false);
    }
  };


  /* ─── render ──────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        {verified !== true && (
          <Button
            onClick={handleVerify}
            isLoading={vcLoading}
            icon={CheckCircle2}
          >
            Verify VC
          </Button>
        )}

        {(!zkpResult || zkpResult.verified !== true) && (
          <Button
            onClick={handleVerifyZKP}
            isLoading={zkpLoading}
            icon={ShieldCheck}
          >
            Verify&nbsp;ZKP
          </Button>
        )}

        <Button
          variant={showVC ? "ghost" : "default"}
          onClick={() => setShowVC((s) => !s)}
          icon={showVC ? EyeOff : Eye}
        >
          {showVC ? "Hide VC" : "View VC"}
        </Button>
      </div>

      {/* Two-column grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* LEFT column */}
        <div className="space-y-4">
          {verified === true && (
            <AlertBadge variant="success">VC verified successfully</AlertBadge>
          )}
          {verified === false && (
            <AlertBadge variant="error">
              {error || "VC verification failed"}
            </AlertBadge>
          )}

          {result?.issuer && (
            <VerificationBox
              title="Verification Information for Issuer"
              result={result.issuer}
              did={vc?.issuer?.id}
            />
          )}
          {result?.holder && (
            <VerificationBox
              title="Verification Information for Holder"
              result={result.holder}
              did={vc?.holder?.id}
            />
          )}
        </div>

        {/* RIGHT column – VC viewer */}
        {showVC && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <VCViewer vc={vc} />
          </div>
        )}
      </div>

      {/* ZKP result row */}
      {zkpTriggered && zkpResult && typeof zkpResult.verified === "boolean" && (
        <div className="animate-fade-in">
          <ZKPVerificationBox proof={zkpResult} />
        </div>
      )}
    </div>
  );
};

export default VerifyVCInline;
