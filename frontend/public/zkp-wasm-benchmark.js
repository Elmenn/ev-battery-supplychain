const SCENARIOS = [
  {
    id: "small",
    label: "Small Order",
    unitPriceWei: "10000000000",
    quantity: "2",
  },
  {
    id: "medium",
    label: "Medium Order",
    unitPriceWei: "1000000000000000",
    quantity: "25",
  },
  {
    id: "large",
    label: "Large Order",
    unitPriceWei: "250000000000000000",
    quantity: "120",
  },
];

const WORKER_TIMEOUT_MS = 120000;

let worker = null;
let nextRequestId = 1;
const pending = new Map();

function ensureWorker() {
  if (worker) return worker;

  worker = new Worker("/wasmZkpWorker.js", { type: "module" });
  worker.onmessage = (event) => {
    const { id, ok, result, error } = event.data || {};
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(id);
    if (ok) {
      entry.resolve(result);
    } else {
      entry.reject(new Error(error || "Unknown wasm worker error"));
    }
  };
  worker.onerror = (event) => {
    const error = event?.message || "Unhandled worker error";
    pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(new Error(error));
    });
    pending.clear();
    try {
      worker.terminate();
    } catch {
      // no-op
    }
    worker = null;
  };
  return worker;
}

function callWorker(method, payload) {
  const activeWorker = ensureWorker();
  const id = `${Date.now()}-${nextRequestId++}`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout for ${method}`));
    }, WORKER_TIMEOUT_MS);

    pending.set(id, { resolve, reject, timer });
    activeWorker.postMessage({ id, method, payload, publicUrl: "" });
  });
}

function randomHex32() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function normalizeHex(value) {
  return typeof value === "string" && value.startsWith("0x") ? value : `0x${value}`;
}

function multiplyStrings(left, right) {
  return (BigInt(left) * BigInt(right)).toString();
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return null;
  const idx = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * ratio) - 1),
  );
  return sortedValues[idx];
}

function summarizeDurations(durations, successes, totalRuns) {
  const sorted = [...durations].sort((a, b) => a - b);
  const avg = durations.length
    ? durations.reduce((sum, value) => sum + value, 0) / durations.length
    : null;
  return {
    averageMs: avg,
    minMs: sorted[0] ?? null,
    maxMs: sorted[sorted.length - 1] ?? null,
    p95Ms: percentile(sorted, 0.95),
    successRate: totalRuns ? successes / totalRuns : null,
  };
}

function captureMemory(enabled) {
  if (!enabled) return null;
  const perfMemory = globalThis.performance?.memory;
  if (!perfMemory) return null;
  return {
    usedJSHeapSize: perfMemory.usedJSHeapSize,
    totalJSHeapSize: perfMemory.totalJSHeapSize,
    jsHeapSizeLimit: perfMemory.jsHeapSizeLimit,
  };
}

async function measureOperation(label, fn) {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return {
    label,
    durationMs: end - start,
    result,
  };
}

async function buildProofBundle({ unitPriceWei, quantity }) {
  const totalWei = multiplyStrings(unitPriceWei, quantity);
  const contextHashHex = randomHex32();
  const rQuantityHex = randomHex32();
  const rTotalHex = randomHex32();
  const rPayHex = randomHex32();

  const cQuantity = await callWorker("generate-scalar-commitment-with-blinding", {
    value: quantity,
    blindingHex: rQuantityHex,
  });
  const cTotal = await callWorker("generate-scalar-commitment-with-blinding", {
    value: totalWei,
    blindingHex: rTotalHex,
  });
  const cPay = await callWorker("generate-scalar-commitment-with-blinding", {
    value: totalWei,
    blindingHex: rPayHex,
  });

  const quantityTotalProof = await callWorker("generate-quantity-total-proof", {
    cQuantityHex: normalizeHex(cQuantity.commitment),
    cTotalHex: normalizeHex(cTotal.commitment),
    unitPriceWei,
    rQuantityHex,
    rTotalHex,
    contextHashHex,
  });

  const totalPaymentProof = await callWorker("generate-total-payment-equality-proof", {
    cTotalHex: normalizeHex(cTotal.commitment),
    cPayHex: normalizeHex(cPay.commitment),
    rTotalHex,
    rPayHex,
    contextHashHex,
  });

  return {
    quantity,
    totalWei,
    unitPriceWei,
    contextHashHex,
    rQuantityHex,
    rTotalHex,
    rPayHex,
    cQuantity,
    cTotal,
    cPay,
    quantityTotalProof,
    totalPaymentProof,
  };
}

async function runSingleScenario(scenario, options) {
  const metricRuns = new Map([
    ["generateScalarCommitments", []],
    ["generateQuantityTotalProof", []],
    ["generateTotalPaymentEqualityProof", []],
    ["verifyQuantityTotalProof", []],
    ["verifyTotalPaymentEqualityProof", []],
    ["buyerCryptoE2E", []],
    ["auditorVerifyE2E", []],
  ]);
  const metricSuccesses = new Map(
    Array.from(metricRuns.keys(), (key) => [key, 0]),
  );

  let coldStartMs = null;
  let memoryBefore = captureMemory(options.captureMemory);
  let memoryAfter = null;
  let lastBundle = null;

  const totalRuns = options.warmupIterations + options.iterations;

  for (let runIndex = 0; runIndex < totalRuns; runIndex += 1) {
    const isMeasured = runIndex >= options.warmupIterations;
    const totalWei = multiplyStrings(scenario.unitPriceWei, scenario.quantity);
    const contextHashHex = randomHex32();
    const rQuantityHex = randomHex32();
    const rTotalHex = randomHex32();
    const rPayHex = randomHex32();

    const scalarCommitmentOp = await measureOperation("generateScalarCommitments", async () => {
      return {
        cQuantity: await callWorker("generate-scalar-commitment-with-blinding", {
          value: scenario.quantity,
          blindingHex: rQuantityHex,
        }),
        cTotal: await callWorker("generate-scalar-commitment-with-blinding", {
          value: totalWei,
          blindingHex: rTotalHex,
        }),
        cPay: await callWorker("generate-scalar-commitment-with-blinding", {
          value: totalWei,
          blindingHex: rPayHex,
        }),
      };
    });

    if (runIndex === 0) {
      coldStartMs = scalarCommitmentOp.durationMs;
    }

    const quantityTotalGenOp = await measureOperation("generateQuantityTotalProof", async () =>
      callWorker("generate-quantity-total-proof", {
        cQuantityHex: normalizeHex(scalarCommitmentOp.result.cQuantity.commitment),
        cTotalHex: normalizeHex(scalarCommitmentOp.result.cTotal.commitment),
        unitPriceWei: scenario.unitPriceWei,
        rQuantityHex,
        rTotalHex,
        contextHashHex,
      }),
    );

    const totalPaymentGenOp = await measureOperation("generateTotalPaymentEqualityProof", async () =>
      callWorker("generate-total-payment-equality-proof", {
        cTotalHex: normalizeHex(scalarCommitmentOp.result.cTotal.commitment),
        cPayHex: normalizeHex(scalarCommitmentOp.result.cPay.commitment),
        rTotalHex,
        rPayHex,
        contextHashHex,
      }),
    );

    const buyerCryptoOp = await measureOperation("buyerCryptoE2E", async () =>
      buildProofBundle(scenario),
    );
    lastBundle = buyerCryptoOp.result;

    const verifyQuantityOp = await measureOperation("verifyQuantityTotalProof", async () =>
      callWorker("verify-quantity-total-proof", {
        cQuantityHex: normalizeHex(lastBundle.cQuantity.commitment),
        cTotalHex: normalizeHex(lastBundle.cTotal.commitment),
        unitPriceWei: scenario.unitPriceWei,
        proofRHex: normalizeHex(lastBundle.quantityTotalProof.proof_r_hex),
        proofSHex: normalizeHex(lastBundle.quantityTotalProof.proof_s_hex),
        contextHashHex: lastBundle.contextHashHex,
      }),
    );

    const verifyTotalPayOp = await measureOperation("verifyTotalPaymentEqualityProof", async () =>
      callWorker("verify-total-payment-equality-proof", {
        cTotalHex: normalizeHex(lastBundle.cTotal.commitment),
        cPayHex: normalizeHex(lastBundle.cPay.commitment),
        proofRHex: normalizeHex(lastBundle.totalPaymentProof.proof_r_hex),
        proofSHex: normalizeHex(lastBundle.totalPaymentProof.proof_s_hex),
        contextHashHex: lastBundle.contextHashHex,
      }),
    );

    const auditorVerifyE2E = {
      durationMs: verifyQuantityOp.durationMs + verifyTotalPayOp.durationMs,
      result: {
        quantityTotal: verifyQuantityOp.result,
        totalPayment: verifyTotalPayOp.result,
      },
    };

    if (!isMeasured) {
      continue;
    }

    metricRuns.get("generateScalarCommitments").push(scalarCommitmentOp.durationMs);
    metricRuns.get("generateQuantityTotalProof").push(quantityTotalGenOp.durationMs);
    metricRuns.get("generateTotalPaymentEqualityProof").push(totalPaymentGenOp.durationMs);
    metricRuns.get("verifyQuantityTotalProof").push(verifyQuantityOp.durationMs);
    metricRuns.get("verifyTotalPaymentEqualityProof").push(verifyTotalPayOp.durationMs);
    metricRuns.get("buyerCryptoE2E").push(buyerCryptoOp.durationMs);
    metricRuns.get("auditorVerifyE2E").push(auditorVerifyE2E.durationMs);

    metricSuccesses.set(
      "generateScalarCommitments",
      metricSuccesses.get("generateScalarCommitments") + 1,
    );
    metricSuccesses.set(
      "generateQuantityTotalProof",
      metricSuccesses.get("generateQuantityTotalProof") +
        (quantityTotalGenOp.result.verified ? 1 : 0),
    );
    metricSuccesses.set(
      "generateTotalPaymentEqualityProof",
      metricSuccesses.get("generateTotalPaymentEqualityProof") +
        (totalPaymentGenOp.result.verified ? 1 : 0),
    );
    metricSuccesses.set(
      "verifyQuantityTotalProof",
      metricSuccesses.get("verifyQuantityTotalProof") +
        (verifyQuantityOp.result.verified ? 1 : 0),
    );
    metricSuccesses.set(
      "verifyTotalPaymentEqualityProof",
      metricSuccesses.get("verifyTotalPaymentEqualityProof") +
        (verifyTotalPayOp.result.verified ? 1 : 0),
    );
    metricSuccesses.set("buyerCryptoE2E", metricSuccesses.get("buyerCryptoE2E") + 1);
    metricSuccesses.set(
      "auditorVerifyE2E",
      metricSuccesses.get("auditorVerifyE2E") +
        (verifyQuantityOp.result.verified && verifyTotalPayOp.result.verified ? 1 : 0),
    );
  }

  memoryAfter = captureMemory(options.captureMemory);

  return {
    scenario,
    options,
    coldStartMs,
    metrics: Object.fromEntries(
      Array.from(metricRuns.entries(), ([metric, durations]) => [
        metric,
        summarizeDurations(durations, metricSuccesses.get(metric), options.iterations),
      ]),
    ),
    memoryBefore,
    memoryAfter,
    lastProofBundlePreview: lastBundle
      ? {
          contextHashHex: lastBundle.contextHashHex,
          cQuantity: lastBundle.cQuantity.commitment,
          cTotal: lastBundle.cTotal.commitment,
          cPay: lastBundle.cPay.commitment,
          quantityTotalVerified: lastBundle.quantityTotalProof.verified,
          totalPaymentVerified: lastBundle.totalPaymentProof.verified,
        }
      : null,
  };
}

function renderSummary(report) {
  const tbody = document.getElementById("resultsBody");
  tbody.innerHTML = "";

  const rows = [
    ["Cold Start", report.coldStartMs, report.coldStartMs, report.coldStartMs, report.coldStartMs, 1],
    ...Object.entries(report.metrics).map(([metric, stats]) => [
      metric,
      stats.averageMs,
      stats.minMs,
      stats.maxMs,
      stats.p95Ms,
      stats.successRate,
    ]),
  ];

  for (const row of rows) {
    const tr = document.createElement("tr");
    row.forEach((value, index) => {
      const cell = document.createElement(index === 0 ? "th" : "td");
      if (typeof value === "number") {
        cell.textContent = index === 5 ? `${(value * 100).toFixed(1)}%` : value.toFixed(2);
      } else {
        cell.textContent = value == null ? "—" : String(value);
      }
      tr.appendChild(cell);
    });
    tbody.appendChild(tr);
  }
}

function renderEnvironment(report) {
  const environment = {
    timestamp: new Date().toISOString(),
    url: location.href,
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: navigator.deviceMemory ?? null,
    scenario: report.scenario,
    options: report.options,
    memoryBefore: report.memoryBefore,
    memoryAfter: report.memoryAfter,
  };
  document.getElementById("environmentBox").textContent = JSON.stringify(environment, null, 2);
}

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

function setupScenarioSelect() {
  const select = document.getElementById("scenario");
  SCENARIOS.forEach((scenario) => {
    const option = document.createElement("option");
    option.value = scenario.id;
    option.textContent = `${scenario.label} — unitPrice=${scenario.unitPriceWei}, quantity=${scenario.quantity}`;
    select.appendChild(option);
  });
}

function selectedScenario() {
  const selected = document.getElementById("scenario").value;
  return SCENARIOS.find((scenario) => scenario.id === selected) || SCENARIOS[0];
}

function selectedOptions() {
  return {
    iterations: Number(document.getElementById("iterations").value || 20),
    warmupIterations: Number(document.getElementById("warmup").value || 2),
    captureMemory: document.getElementById("includeMemory").value === "yes",
  };
}

async function copyReport() {
  const text = document.getElementById("reportBox").value;
  if (!text) return;
  await navigator.clipboard.writeText(text);
  setStatus("Benchmark JSON copied to clipboard.");
}

async function runBenchmark() {
  const runBtn = document.getElementById("runBtn");
  const copyBtn = document.getElementById("copyBtn");
  runBtn.disabled = true;
  copyBtn.disabled = true;
  setStatus("Running benchmark...");

  try {
    const report = await runSingleScenario(selectedScenario(), selectedOptions());
    renderSummary(report);
    renderEnvironment(report);
    document.getElementById("reportBox").value = JSON.stringify(report, null, 2);
    copyBtn.disabled = false;
    setStatus("Benchmark complete.");
  } catch (error) {
    document.getElementById("reportBox").value = JSON.stringify(
      { error: error.message || String(error) },
      null,
      2,
    );
    setStatus(`Benchmark failed: ${error.message || String(error)}`);
  } finally {
    runBtn.disabled = false;
  }
}

document.getElementById("runBtn").addEventListener("click", runBenchmark);
document.getElementById("copyBtn").addEventListener("click", copyReport);
setupScenarioSelect();
document.getElementById("scenario").value = SCENARIOS[0].id;
