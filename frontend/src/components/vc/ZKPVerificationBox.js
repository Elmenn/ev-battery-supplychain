import React from "react";
import { AlertBadge } from "../ui/AlertBadge";

const ZKPVerificationBox = ({ proof }) => {
  if (!proof) return null;

  // proof.verified is boolean in your backend response
  const ok = proof.verified === true;

  return (
    <div className="mt-4">
      {ok ? (
        <AlertBadge variant="success">ZKP Proof is valid</AlertBadge>
      ) : (
        <AlertBadge variant="error">
          {proof.error || "ZKP proof is invalid"}
        </AlertBadge>
      )}
    </div>
  );
};

export default ZKPVerificationBox;
