require("dotenv").config({ path: ".env.truffle" });

const { performance } = require("perf_hooks");

const DEFAULT_API_BASE = process.env.API_BASE_URL || "http://localhost:5000";
const DEFAULT_ZKP_BASE =
  process.env.ZKP_BACKEND_URL ||
  process.env.REACT_APP_ZKP_BACKEND_URL ||
  "http://127.0.0.1:5010";
const DEFAULT_ITERATIONS = 10;
const DEFAULT_PUBLIC_CIDS = [
  "QmSzh1jRYsEx9pvNyYoTyN8RcvaEwy76xRMjySxtmgfh9s",
  "QmaT4FTL6ufPWXgu7tQ772ro6RHbMuda9V2mpQ5F6ETcD7",
  "QmPBZp6H6iHAzcF1Jw1wJXiDwNP7LopbE8mserbZxnoeEd",
];
const DEFAULT_PRIVATE_CIDS = [
  "QmaDMn58Zj9jxsUXvo7xENS6hzE4zgheFAstVsTx5s8pCd",
  "QmaYeHgr7zrfrgUM6CgA4DSb7tngsQCQBnhzPh4wVFsn7Q",
  "QmR2vJCs3aSq7p5px64ozYYLHJVPqQ8Toh5Lk3UBsAyCzn",
];

function usage() {
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/erc7984/evaluate-dual-profile-proof-vrc.js");
  console.log("");
  console.log("Optional:");
  console.log("  --api-base <url>         Backend API base URL (default: http://localhost:5000)");
  console.log("  --zkp-base <url>         ZKP backend base URL (default: http://127.0.0.1:5010)");
  console.log("  --iterations <n>         Timing iterations per endpoint (default: 10)");
  console.log("  --public-cids <a,b,c>    Override public profile CIDs");
  console.log("  --private-cids <a,b,c>   Override private profile CIDs");
  console.log("  --json-only              Print only JSON output");
  console.log("");
}

function parseArgs(argv) {
  const options = {
    apiBase: DEFAULT_API_BASE.replace(/\/+$/, ""),
    zkpBase: DEFAULT_ZKP_BASE.replace(/\/+$/, ""),
    iterations: DEFAULT_ITERATIONS,
    publicCids: [...DEFAULT_PUBLIC_CIDS],
    privateCids: [...DEFAULT_PRIVATE_CIDS],
    jsonOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--api-base") {
      options.apiBase = String(argv[++index] || "").trim().replace(/\/+$/, "");
    } else if (arg === "--zkp-base") {
      options.zkpBase = String(argv[++index] || "").trim().replace(/\/+$/, "");
    } else if (arg === "--iterations") {
      options.iterations = Number(argv[++index] || DEFAULT_ITERATIONS);
    } else if (arg === "--public-cids") {
      options.publicCids = String(argv[++index] || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    } else if (arg === "--private-cids") {
      options.privateCids = String(argv[++index] || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    } else if (arg === "--json-only") {
      options.jsonOnly = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.iterations) || options.iterations < 1) {
    throw new Error("--iterations must be a positive integer");
  }

  if (!options.apiBase) {
    throw new Error("Missing --api-base");
  }
  if (!options.zkpBase) {
    throw new Error("Missing --zkp-base");
  }

  if (!options.publicCids.length || !options.privateCids.length) {
    throw new Error("Both public and private CID lists must be non-empty");
  }

  return options;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

function hexBytes(value) {
  if (typeof value !== "string") return 0;
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  if (!clean || clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) return 0;
  return clean.length / 2;
}

function toNumberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];
  const position = ((sorted.length - 1) * p) / 100;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function stddev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function round3(value) {
  return Number(value.toFixed(3));
}

function stats(values) {
  if (!values.length) {
    return {
      minMs: null,
      meanMs: null,
      medianMs: null,
      p95Ms: null,
      maxMs: null,
      stdDevMs: null,
    };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const meanValue = values.reduce((sum, value) => sum + value, 0) / values.length;
  const med = median(values);
  return {
    minMs: round3(min),
    meanMs: round3(meanValue),
    medianMs: round3(med),
    p95Ms: round3(percentile(values, 95)),
    maxMs: round3(max),
    stdDevMs: round3(stddev(values)),
  };
}

function mean(values) {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function distribution(values) {
  if (!values.length) {
    return {
      min: null,
      mean: null,
      median: null,
      p95: null,
      max: null,
      stddev: null,
    };
  }
  return {
    min: round3(Math.min(...values)),
    mean: round3(mean(values)),
    median: round3(median(values)),
    p95: round3(percentile(values, 95)),
    max: round3(Math.max(...values)),
    stddev: round3(stddev(values)),
  };
}

function buildQuantityRequest(vc) {
  const subject = vc?.credentialSubject || {};
  const listing = subject?.listing || {};
  const commitments = subject?.commitments || {};
  const privacyProofs = subject?.privacyProofs || {};
  const paymentBridge = subject?.paymentBridge || {};
  const attestation = subject?.attestation || {};
  const quantityProof = privacyProofs?.quantityTotal || {};
  const priceVisibility = String(listing?.priceVisibility || "").toLowerCase();
  const isBulletproof =
    priceVisibility === "private" ||
    String(quantityProof?.proofType || "").toLowerCase().includes("bulletproof");
  const contextHash = String(paymentBridge?.contextHash || attestation?.contextHash || "").trim();

  if (isBulletproof) {
    return {
      path: "/zkp/verify-private-price-quantity-total-bulletproof",
      body: {
        c_price_hex: commitments?.priceCommitment,
        c_quantity_hex: commitments?.quantityCommitment,
        c_total_hex: commitments?.totalCommitment,
        proof_hex: quantityProof?.proofHex,
        context_hash_hex: contextHash,
      },
    };
  }

  return {
    path: "/zkp/verify-quantity-total-proof",
    body: {
      c_quantity_hex: commitments?.quantityCommitment,
      c_total_hex: commitments?.totalCommitment,
      unit_price_wei: listing?.unitPriceWei,
      proof_r_hex: quantityProof?.proofRHex,
      proof_s_hex: quantityProof?.proofSHex,
      context_hash_hex: contextHash,
    },
  };
}

function buildTotalPaymentRequest(vc) {
  const subject = vc?.credentialSubject || {};
  const commitments = subject?.commitments || {};
  const privacyProofs = subject?.privacyProofs || {};
  const paymentBridge = subject?.paymentBridge || {};
  const attestation = subject?.attestation || {};
  const paymentProof = privacyProofs?.totalPaymentEquality || {};
  const isBulletproof = String(paymentProof?.proofType || "").toLowerCase().includes("bulletproof");
  const contextHash = String(paymentBridge?.contextHash || attestation?.contextHash || "").trim();

  if (isBulletproof) {
    return {
      path: "/zkp/verify-total-payment-equality-bulletproof",
      body: {
        c_total_hex: commitments?.totalCommitment,
        c_pay_hex: commitments?.paymentCommitment,
        proof_hex: paymentProof?.proofHex,
        context_hash_hex: contextHash,
      },
    };
  }

  return {
    path: "/zkp/verify-total-payment-equality-proof",
    body: {
      c_total_hex: commitments?.totalCommitment,
      c_pay_hex: commitments?.paymentCommitment,
      proof_r_hex: paymentProof?.proofRHex,
      proof_s_hex: paymentProof?.proofSHex,
      context_hash_hex: contextHash,
    },
  };
}

function proofSizeBytes(record) {
  const explicit = toNumberOrZero(record?.proofSizeBytes);
  if (explicit > 0) return explicit;
  return (
    hexBytes(record?.proofHex) +
    hexBytes(record?.proofRHex) +
    hexBytes(record?.proofSHex) +
    hexBytes(record?.commitmentProof)
  );
}

async function measureEndpoint(url, body, iterations) {
  const durations = [];
  let lastPayload = null;

  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    const payload = await postJson(url, body);
    const elapsed = performance.now() - start;
    durations.push(elapsed);
    lastPayload = payload;
  }

  return {
    ...stats(durations),
    iterations,
    lastPayload,
  };
}

async function evaluateCid({ apiBase, zkpBase, cid, profile, iterations }) {
  let fetchPayload;
  try {
    fetchPayload = await postJson(`${apiBase}/fetch-vc`, { cid });
  } catch (error) {
    throw new Error(`CID ${cid} fetch failed via ${apiBase}/fetch-vc -> ${error.message}`);
  }
  const vc = fetchPayload?.vc;
  if (!vc) {
    throw new Error(`No VC returned for CID ${cid}`);
  }

  const quantityRecord = vc?.credentialSubject?.privacyProofs?.quantityTotal || {};
  const totalPaymentRecord = vc?.credentialSubject?.privacyProofs?.totalPaymentEquality || {};

  const verifyVcStats = await measureEndpoint(`${apiBase}/verify-vc`, { vc }, iterations);
  const quantityReq = buildQuantityRequest(vc);
  const totalReq = buildTotalPaymentRequest(vc);
  const quantityStats = await measureEndpoint(`${zkpBase}${quantityReq.path}`, quantityReq.body, iterations);
  const totalStats = await measureEndpoint(`${zkpBase}${totalReq.path}`, totalReq.body, iterations);

  const proofVerifyMean = (quantityStats.meanMs || 0) + (totalStats.meanMs || 0);
  const verifyVcMean = verifyVcStats.meanMs || 0;
  const estimatedSignatureAndOverheadMs = verifyVcMean - proofVerifyMean;

  return {
    cid,
    profile,
    orderId: vc?.credentialSubject?.order?.orderId || null,
    productContract: vc?.credentialSubject?.productContract || null,
    priceVisibility: vc?.credentialSubject?.listing?.priceVisibility || null,
    proofFamilyQuantityTotal: quantityRecord?.proofFamily || null,
    proofFamilyTotalPayment: totalPaymentRecord?.proofFamily || null,
    proofTypeQuantityTotal: quantityRecord?.proofType || null,
    proofTypeTotalPayment: totalPaymentRecord?.proofType || null,
    proofSize: {
      quantityTotalBytes: proofSizeBytes(quantityRecord),
      totalPaymentBytes: proofSizeBytes(totalPaymentRecord),
      combinedBytes: proofSizeBytes(quantityRecord) + proofSizeBytes(totalPaymentRecord),
    },
    verification: {
      verifyVc: verifyVcStats,
      quantityProof: {
        endpoint: quantityReq.path,
        ...quantityStats,
      },
      totalPaymentProof: {
        endpoint: totalReq.path,
        ...totalStats,
      },
      combinedProofVerifyMeanMs: Number(proofVerifyMean.toFixed(3)),
      estimatedSignatureAndOverheadMeanMs: Number(estimatedSignatureAndOverheadMs.toFixed(3)),
    },
    verifyResult: {
      success: verifyVcStats?.lastPayload?.success === true,
      issuerOk: verifyVcStats?.lastPayload?.issuer?.signature_verified === true,
      holderOk:
        verifyVcStats?.lastPayload?.holder?.skipped === true ||
        verifyVcStats?.lastPayload?.holder?.signature_verified === true,
      quantityTotalOk: verifyVcStats?.lastPayload?.privacyProofs?.quantityTotal === true,
      totalPaymentOk: verifyVcStats?.lastPayload?.privacyProofs?.totalPayment === true,
    },
  };
}

function aggregateProfile(items, profile) {
  const scoped = items.filter((item) => item.profile === profile);
  const combinedProofSizes = scoped.map((item) => item.proofSize.combinedBytes);
  const verifyVcMeans = scoped.map((item) => item.verification.verifyVc.meanMs || 0);
  const proofVerifyMeans = scoped.map((item) => item.verification.combinedProofVerifyMeanMs || 0);
  const signatureEstimates = scoped.map(
    (item) => item.verification.estimatedSignatureAndOverheadMeanMs || 0
  );

  return {
    profile,
    sampleCount: scoped.length,
    proofSizeCombinedBytes: distribution(combinedProofSizes),
    verifyVcMeanMs: distribution(verifyVcMeans),
    combinedProofVerifyMeanMs: distribution(proofVerifyMeans),
    estimatedSignatureAndOverheadMeanMs: distribution(signatureEstimates),
    allVerifyPass: scoped.every(
      (item) =>
        item.verifyResult.success &&
        item.verifyResult.issuerOk &&
        item.verifyResult.holderOk &&
        item.verifyResult.quantityTotalOk &&
        item.verifyResult.totalPaymentOk
    ),
  };
}

function printSummary(result) {
  const publicAgg = result.aggregates.public;
  const privateAgg = result.aggregates.private;

  console.log("");
  console.log("Dual-profile proof/VRC evaluation");
  console.log(`API base     : ${result.meta.apiBase}`);
  console.log(`ZKP base     : ${result.meta.zkpBase}`);
  console.log(`Iterations   : ${result.meta.iterations}`);
  console.log(`Public CIDs  : ${result.meta.publicCids.length}`);
  console.log(`Private CIDs : ${result.meta.privateCids.length}`);
  console.log("");
  console.table(
    result.samples.map((item) => ({
      profile: item.profile,
      cid: item.cid,
      combinedProofBytes: item.proofSize.combinedBytes,
      verifyVcMeanMs: item.verification.verifyVc.meanMs,
      verifyVcMedianMs: item.verification.verifyVc.medianMs,
      verifyVcP95Ms: item.verification.verifyVc.p95Ms,
      verifyVcStdDevMs: item.verification.verifyVc.stdDevMs,
      proofVerifyMeanMs: item.verification.combinedProofVerifyMeanMs,
      sigAndOverheadMs: item.verification.estimatedSignatureAndOverheadMeanMs,
      verifyPass: item.verifyResult.success,
    }))
  );
  console.log("Aggregate comparison:");
  console.table([
    {
      metric: "proof size combined (bytes)",
      stat: "mean",
      public: publicAgg.proofSizeCombinedBytes.mean,
      private: privateAgg.proofSizeCombinedBytes.mean,
    },
    {
      metric: "proof size combined (bytes)",
      stat: "median",
      public: publicAgg.proofSizeCombinedBytes.median,
      private: privateAgg.proofSizeCombinedBytes.median,
    },
    {
      metric: "proof size combined (bytes)",
      stat: "p95",
      public: publicAgg.proofSizeCombinedBytes.p95,
      private: privateAgg.proofSizeCombinedBytes.p95,
    },
    {
      metric: "proof size combined (bytes)",
      stat: "stddev",
      public: publicAgg.proofSizeCombinedBytes.stddev,
      private: privateAgg.proofSizeCombinedBytes.stddev,
    },
    {
      metric: "/verify-vc (ms)",
      stat: "mean",
      public: publicAgg.verifyVcMeanMs.mean,
      private: privateAgg.verifyVcMeanMs.mean,
    },
    {
      metric: "/verify-vc (ms)",
      stat: "median",
      public: publicAgg.verifyVcMeanMs.median,
      private: privateAgg.verifyVcMeanMs.median,
    },
    {
      metric: "/verify-vc (ms)",
      stat: "p95",
      public: publicAgg.verifyVcMeanMs.p95,
      private: privateAgg.verifyVcMeanMs.p95,
    },
    {
      metric: "/verify-vc (ms)",
      stat: "stddev",
      public: publicAgg.verifyVcMeanMs.stddev,
      private: privateAgg.verifyVcMeanMs.stddev,
    },
    {
      metric: "proof verify (ms)",
      stat: "mean",
      public: publicAgg.combinedProofVerifyMeanMs.mean,
      private: privateAgg.combinedProofVerifyMeanMs.mean,
    },
    {
      metric: "proof verify (ms)",
      stat: "median",
      public: publicAgg.combinedProofVerifyMeanMs.median,
      private: privateAgg.combinedProofVerifyMeanMs.median,
    },
    {
      metric: "proof verify (ms)",
      stat: "p95",
      public: publicAgg.combinedProofVerifyMeanMs.p95,
      private: privateAgg.combinedProofVerifyMeanMs.p95,
    },
    {
      metric: "proof verify (ms)",
      stat: "stddev",
      public: publicAgg.combinedProofVerifyMeanMs.stddev,
      private: privateAgg.combinedProofVerifyMeanMs.stddev,
    },
    {
      metric: "estimated signature+overhead (ms)",
      stat: "mean",
      public: publicAgg.estimatedSignatureAndOverheadMeanMs.mean,
      private: privateAgg.estimatedSignatureAndOverheadMeanMs.mean,
    },
    {
      metric: "estimated signature+overhead (ms)",
      stat: "median",
      public: publicAgg.estimatedSignatureAndOverheadMeanMs.median,
      private: privateAgg.estimatedSignatureAndOverheadMeanMs.median,
    },
    {
      metric: "estimated signature+overhead (ms)",
      stat: "p95",
      public: publicAgg.estimatedSignatureAndOverheadMeanMs.p95,
      private: privateAgg.estimatedSignatureAndOverheadMeanMs.p95,
    },
    {
      metric: "estimated signature+overhead (ms)",
      stat: "stddev",
      public: publicAgg.estimatedSignatureAndOverheadMeanMs.stddev,
      private: privateAgg.estimatedSignatureAndOverheadMeanMs.stddev,
    },
  ]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const samples = [];

  for (const cid of options.publicCids) {
    samples.push(
      await evaluateCid({
        apiBase: options.apiBase,
        zkpBase: options.zkpBase,
        cid,
        profile: "public",
        iterations: options.iterations,
      })
    );
  }

  for (const cid of options.privateCids) {
    samples.push(
      await evaluateCid({
        apiBase: options.apiBase,
        zkpBase: options.zkpBase,
        cid,
        profile: "private",
        iterations: options.iterations,
      })
    );
  }

  const result = {
    meta: {
      apiBase: options.apiBase,
      zkpBase: options.zkpBase,
      iterations: options.iterations,
      publicCids: options.publicCids,
      privateCids: options.privateCids,
      generatedAt: new Date().toISOString(),
    },
    samples,
    aggregates: {
      public: aggregateProfile(samples, "public"),
      private: aggregateProfile(samples, "private"),
    },
  };

  if (!options.jsonOnly) {
    printSummary(result);
    console.log("Detailed JSON:");
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
