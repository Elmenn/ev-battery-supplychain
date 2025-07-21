// utils/vcBuilder.js
import { v4 as uuid } from "uuid";
import { keccak256 } from "ethers";

const CHAIN = process.env.REACT_APP_CHAIN_ID || "1337";
const ZERO_DID = `did:ethr:${CHAIN}:0x${"0".repeat(40)}`;

export function hashVcPayload(vc) {
  return keccak256(Buffer.from(JSON.stringify(vc)));
}

/* ───────────── Stage-0 (unchanged) ───────────── */
export function buildStage0VC({ product, sellerAddr, issuerProof }) {
  /* ... your existing Stage-0 code ... */
}

/* ───────────── Stage-2 (seller → buyer) ───────────── */
export function buildStage2VC({
  stage0,
  stage0Cid,
  buyerAddr,
  sellerAddr,
  issuerProof,
}) {
  if (!stage0Cid) {
    throw new Error("stage0Cid is missing – cannot link previousCredential");
  }

  const vc = {
    "@context": stage0["@context"],
    id: stage0.id || `https://example.edu/credentials/${uuid()}`,
    type: stage0.type || ["VerifiableCredential"],

    issuer: {
      id: `did:ethr:${CHAIN}:${sellerAddr}`,
      name: "Seller",
    },
    holder: {
      id: `did:ethr:${CHAIN}:${buyerAddr}`,
      name: "Buyer",
    },
    issuanceDate: stage0.issuanceDate, // preserve original date

    credentialSubject: {
      ...stage0.credentialSubject,
      id: `did:ethr:${CHAIN}:${buyerAddr}`,
      /* 🔗 THIS is the crucial link */
      previousCredential: stage0Cid,
    },

    proofs: {
      issuerProof: issuerProof || {},
      holderProof: {},
    },
  };

  console.log("🛠️  Stage-2 VC created → linked to", stage0Cid);
  return vc;
}



// --------------------------------------------------
//  Stage‑3  ➜  Final VC – buyer signs *after* on‑chain delivery confirmation
// --------------------------------------------------
//  ‣ NOW we have a real on‑chain transaction hash → include it.
// --------------------------------------------------
export function buildStage3VC({ stage2, buyerProof, txHash, zkpProof }) {
  const credentialSubject = {
    ...stage2.credentialSubject,
  };

  if (zkpProof) {
    credentialSubject.zkpProof = zkpProof;
  } else if (txHash) {
    credentialSubject.transactionId = txHash;
  }

  const vc = {
    ...stage2,
    credentialSubject,
    proofs: {
      ...stage2.proofs,
      holderProof: buyerProof,
    },
  };

  console.log("\n🛠️  [Stage‑3] VC finalized (Buyer proof attached)");
  console.log("🔗 txHash or proof:", txHash || "[ZKP]");
  console.log("📦 Previous VC CID:", stage2.credentialSubject?.previousCredential);
  console.log("🖊️  Buyer Proof:", buyerProof);
  console.log("🧾 Final VC:", JSON.stringify(vc, null, 2));

  return vc;
}

