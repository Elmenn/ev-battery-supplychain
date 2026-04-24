#!/usr/bin/env python3
"""Export proof-evaluation artifacts (CSV + optional plots) from eval JSON."""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
from statistics import mean
from typing import Dict, Iterable, List, Tuple


RAW_LAYER_A_ROWS = [
    {
        "statement": "payment=total",
        "proof_family": "fiat-shamir",
        "generation_median_ms": 0.129,
        "generation_mean_ms": 0.137,
        "proof_size_bytes": 64,
        "verification_median_ms": 0.480,
        "verification_mean_ms": 0.583,
    },
    {
        "statement": "payment=total",
        "proof_family": "bulletproof",
        "generation_median_ms": 7.319,
        "generation_mean_ms": 7.881,
        "proof_size_bytes": 417,
        "verification_median_ms": 6.343,
        "verification_mean_ms": 7.789,
    },
    {
        "statement": "total=unitPrice*quantity",
        "proof_family": "fiat-shamir",
        "generation_median_ms": 0.146,
        "generation_mean_ms": 0.145,
        "proof_size_bytes": 64,
        "verification_median_ms": 0.608,
        "verification_mean_ms": 0.613,
    },
    {
        "statement": "total=unitPrice*quantity",
        "proof_family": "bulletproof",
        "generation_median_ms": 7.366,
        "generation_mean_ms": 7.717,
        "proof_size_bytes": 417,
        "verification_median_ms": 6.371,
        "verification_mean_ms": 6.572,
    },
]


def round3(value: float) -> float:
    return float(f"{value:.3f}")


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_csv(path: Path, rows: List[Dict], columns: List[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({col: row.get(col) for col in columns})


def safe_stats(values: Iterable[float]) -> Dict[str, float]:
    numbers = [float(v) for v in values]
    if not numbers:
        return {"mean": math.nan, "median": math.nan, "p95": math.nan, "stddev": math.nan}
    sorted_values = sorted(numbers)
    n = len(sorted_values)
    med = sorted_values[n // 2] if n % 2 == 1 else (sorted_values[n // 2 - 1] + sorted_values[n // 2]) / 2
    p95_pos = (n - 1) * 0.95
    lo = math.floor(p95_pos)
    hi = math.ceil(p95_pos)
    p95 = sorted_values[lo] if lo == hi else sorted_values[lo] * (hi - p95_pos) + sorted_values[hi] * (p95_pos - lo)
    avg = mean(sorted_values)
    var = sum((x - avg) ** 2 for x in sorted_values) / n
    return {"mean": round3(avg), "median": round3(med), "p95": round3(p95), "stddev": round3(math.sqrt(var))}


def load_eval_json(path: Path) -> Dict:
    raw = path.read_bytes()
    decodings = ("utf-8-sig", "utf-16", "utf-16-le", "utf-16-be", "cp1252", "latin-1")
    last_error: Exception | None = None

    for encoding in decodings:
        try:
            text = raw.decode(encoding)
        except Exception as exc:  # pragma: no cover - best-effort fallback
            last_error = exc
            continue

        # Fast path: pure JSON file.
        try:
            return json.loads(text)
        except Exception:
            pass

        # Tolerant path: file may contain command/log prefixes before JSON payload.
        decoder = json.JSONDecoder()
        for idx, ch in enumerate(text):
            if ch not in "{[":
                continue
            try:
                candidate, consumed = decoder.raw_decode(text[idx:])
            except Exception as exc:  # pragma: no cover - best-effort fallback
                last_error = exc
                continue

            if isinstance(candidate, dict) and (
                "meta" in candidate or "samples" in candidate or "aggregates" in candidate
            ):
                trailing = text[idx + consumed :].strip()
                if not trailing:
                    return candidate
                # Accept trailing shell/log lines only if payload already matches expected schema.
                return candidate

    if last_error:
        raise ValueError(f"Unable to parse JSON from {path}: {last_error}") from last_error
    raise ValueError(f"Unable to parse JSON from {path}")


def build_runtime_sample_rows(result: Dict) -> List[Dict]:
    rows = []
    for item in result.get("samples", []):
        quantity = item.get("verification", {}).get("quantityProof", {})
        payment = item.get("verification", {}).get("totalPaymentProof", {})
        rows.append(
            {
                "profile": item.get("profile"),
                "cid": item.get("cid"),
                "order_id": item.get("orderId"),
                "product_contract": item.get("productContract"),
                "price_visibility": item.get("priceVisibility"),
                "proof_family_quantity_total": item.get("proofFamilyQuantityTotal"),
                "proof_family_total_payment": item.get("proofFamilyTotalPayment"),
                "proof_type_quantity_total": item.get("proofTypeQuantityTotal"),
                "proof_type_total_payment": item.get("proofTypeTotalPayment"),
                "quantity_total_bytes": item.get("proofSize", {}).get("quantityTotalBytes"),
                "total_payment_bytes": item.get("proofSize", {}).get("totalPaymentBytes"),
                "combined_proof_bytes": item.get("proofSize", {}).get("combinedBytes"),
                "quantity_verify_mean_ms": quantity.get("meanMs"),
                "quantity_verify_median_ms": quantity.get("medianMs"),
                "quantity_verify_p95_ms": quantity.get("p95Ms"),
                "quantity_verify_stddev_ms": quantity.get("stdDevMs"),
                "total_payment_verify_mean_ms": payment.get("meanMs"),
                "total_payment_verify_median_ms": payment.get("medianMs"),
                "total_payment_verify_p95_ms": payment.get("p95Ms"),
                "total_payment_verify_stddev_ms": payment.get("stdDevMs"),
                "combined_proof_verify_mean_ms": item.get("verification", {}).get("combinedProofVerifyMeanMs"),
                "proof_checks_pass": bool(
                    item.get("verifyResult", {}).get("quantityTotalOk")
                    and item.get("verifyResult", {}).get("totalPaymentOk")
                ),
            }
        )
    return rows


def build_runtime_aggregate_rows(result: Dict) -> List[Dict]:
    rows = []
    for profile in ("public", "private"):
        entry = result.get("aggregates", {}).get(profile, {})
        rows.append(
            {
                "profile": profile,
                "sample_count": entry.get("sampleCount"),
                "proof_size_mean_bytes": entry.get("proofSizeCombinedBytes", {}).get("mean"),
                "proof_size_median_bytes": entry.get("proofSizeCombinedBytes", {}).get("median"),
                "proof_size_p95_bytes": entry.get("proofSizeCombinedBytes", {}).get("p95"),
                "proof_size_stddev_bytes": entry.get("proofSizeCombinedBytes", {}).get("stddev"),
                "combined_verify_mean_ms": entry.get("combinedProofVerifyMeanMs", {}).get("mean"),
                "combined_verify_median_ms": entry.get("combinedProofVerifyMeanMs", {}).get("median"),
                "combined_verify_p95_ms": entry.get("combinedProofVerifyMeanMs", {}).get("p95"),
                "combined_verify_stddev_ms": entry.get("combinedProofVerifyMeanMs", {}).get("stddev"),
                "all_proof_checks_pass": entry.get("allVerifyPass"),
            }
        )
    return rows


def build_runtime_statement_rows(result: Dict) -> List[Dict]:
    grouped: Dict[Tuple[str, str], List[float]] = {}
    for item in result.get("samples", []):
        profile = item.get("profile")
        quantity_mean = item.get("verification", {}).get("quantityProof", {}).get("meanMs")
        payment_mean = item.get("verification", {}).get("totalPaymentProof", {}).get("meanMs")
        grouped.setdefault((profile, "quantity-total"), []).append(float(quantity_mean))
        grouped.setdefault((profile, "total-payment"), []).append(float(payment_mean))

    rows = []
    for (profile, statement), values in sorted(grouped.items()):
        st = safe_stats(values)
        rows.append(
            {
                "profile": profile,
                "statement": statement,
                "mean_ms": st["mean"],
                "median_ms": st["median"],
                "p95_ms": st["p95"],
                "stddev_ms": st["stddev"],
                "sample_count": len(values),
            }
        )
    return rows


def maybe_plot(output_dir: Path, runtime_agg_rows: List[Dict], runtime_stmt_rows: List[Dict]) -> List[str]:
    try:
        import matplotlib.pyplot as plt  # type: ignore
    except Exception:
        return ["matplotlib not available; skipped plot generation"]

    plot_notes: List[str] = []

    # Plot 1: Combined proof verify (mean) by profile
    profiles = [r["profile"] for r in runtime_agg_rows]
    verify_means = [float(r["combined_verify_mean_ms"]) for r in runtime_agg_rows]
    fig1 = plt.figure(figsize=(6, 4))
    ax1 = fig1.add_subplot(111)
    ax1.bar(profiles, verify_means)
    ax1.set_title("Runtime Combined Proof Verification (Mean ms)")
    ax1.set_ylabel("ms")
    fig1.tight_layout()
    p1 = output_dir / "plot_runtime_combined_proof_verify_mean_ms.png"
    fig1.savefig(p1, dpi=160)
    plt.close(fig1)
    plot_notes.append(str(p1))

    # Plot 2: Statement-level mean verification by profile
    statements = ["quantity-total", "total-payment"]
    public_vals = []
    private_vals = []
    for statement in statements:
        pub = next((r for r in runtime_stmt_rows if r["profile"] == "public" and r["statement"] == statement), None)
        priv = next((r for r in runtime_stmt_rows if r["profile"] == "private" and r["statement"] == statement), None)
        public_vals.append(float(pub["mean_ms"]) if pub else math.nan)
        private_vals.append(float(priv["mean_ms"]) if priv else math.nan)

    x = list(range(len(statements)))
    width = 0.35
    fig2 = plt.figure(figsize=(7, 4))
    ax2 = fig2.add_subplot(111)
    ax2.bar([v - width / 2 for v in x], public_vals, width=width, label="public")
    ax2.bar([v + width / 2 for v in x], private_vals, width=width, label="private")
    ax2.set_xticks(x)
    ax2.set_xticklabels(statements)
    ax2.set_ylabel("ms")
    ax2.set_title("Runtime Proof Verification by Statement (Mean ms)")
    ax2.legend()
    fig2.tight_layout()
    p2 = output_dir / "plot_runtime_statement_verify_mean_ms.png"
    fig2.savefig(p2, dpi=160)
    plt.close(fig2)
    plot_notes.append(str(p2))

    # Plot 3: Layer A raw generation median (proof-family baseline)
    layer_a_rows = RAW_LAYER_A_ROWS
    fs_vals = [r["generation_median_ms"] for r in layer_a_rows if r["proof_family"] == "fiat-shamir"]
    bp_vals = [r["generation_median_ms"] for r in layer_a_rows if r["proof_family"] == "bulletproof"]
    labels = [r["statement"] for r in layer_a_rows if r["proof_family"] == "fiat-shamir"]
    x3 = list(range(len(labels)))

    fig3 = plt.figure(figsize=(8, 4))
    ax3 = fig3.add_subplot(111)
    ax3.bar([v - width / 2 for v in x3], fs_vals, width=width, label="fiat-shamir")
    ax3.bar([v + width / 2 for v in x3], bp_vals, width=width, label="bulletproof")
    ax3.set_xticks(x3)
    ax3.set_xticklabels(labels)
    ax3.set_ylabel("ms")
    ax3.set_title("Layer A Raw Proof Generation Median")
    ax3.legend()
    fig3.tight_layout()
    p3 = output_dir / "plot_layer_a_generation_median_ms.png"
    fig3.savefig(p3, dpi=160)
    plt.close(fig3)
    plot_notes.append(str(p3))

    # Plot 4: Layer A raw proof size (bytes)
    fs_size_vals = [r["proof_size_bytes"] for r in layer_a_rows if r["proof_family"] == "fiat-shamir"]
    bp_size_vals = [r["proof_size_bytes"] for r in layer_a_rows if r["proof_family"] == "bulletproof"]
    fig4 = plt.figure(figsize=(8, 4))
    ax4 = fig4.add_subplot(111)
    ax4.bar([v - width / 2 for v in x3], fs_size_vals, width=width, label="fiat-shamir")
    ax4.bar([v + width / 2 for v in x3], bp_size_vals, width=width, label="bulletproof")
    ax4.set_xticks(x3)
    ax4.set_xticklabels(labels)
    ax4.set_ylabel("bytes")
    ax4.set_title("Layer A Raw Proof Size")
    ax4.legend()
    fig4.tight_layout()
    p4 = output_dir / "plot_layer_a_proof_size_bytes.png"
    fig4.savefig(p4, dpi=160)
    plt.close(fig4)
    plot_notes.append(str(p4))

    # Plot 5: Layer A raw verification median (ms)
    fs_verify_vals = [r["verification_median_ms"] for r in layer_a_rows if r["proof_family"] == "fiat-shamir"]
    bp_verify_vals = [r["verification_median_ms"] for r in layer_a_rows if r["proof_family"] == "bulletproof"]
    fig5 = plt.figure(figsize=(8, 4))
    ax5 = fig5.add_subplot(111)
    ax5.bar([v - width / 2 for v in x3], fs_verify_vals, width=width, label="fiat-shamir")
    ax5.bar([v + width / 2 for v in x3], bp_verify_vals, width=width, label="bulletproof")
    ax5.set_xticks(x3)
    ax5.set_xticklabels(labels)
    ax5.set_ylabel("ms")
    ax5.set_title("Layer A Raw Proof Verification Median")
    ax5.legend()
    fig5.tight_layout()
    p5 = output_dir / "plot_layer_a_verification_median_ms.png"
    fig5.savefig(p5, dpi=160)
    plt.close(fig5)
    plot_notes.append(str(p5))

    # Plot 6: Runtime statement-level dispersion using median + stddev + p95 marker.
    # Note: this is a stability view based on exported summary stats, not raw per-iteration samples.
    labels_disp = []
    medians_disp = []
    stddev_disp = []
    p95_disp = []
    order = [
        ("public", "quantity-total"),
        ("public", "total-payment"),
        ("private", "quantity-total"),
        ("private", "total-payment"),
    ]
    for profile, statement in order:
        row = next((r for r in runtime_stmt_rows if r["profile"] == profile and r["statement"] == statement), None)
        if not row:
            continue
        labels_disp.append(f"{profile}\n{statement}")
        medians_disp.append(float(row["median_ms"]))
        stddev_disp.append(float(row["stddev_ms"]))
        p95_disp.append(float(row["p95_ms"]))

    if labels_disp:
        x6 = list(range(len(labels_disp)))
        fig6 = plt.figure(figsize=(9, 4.8))
        ax6 = fig6.add_subplot(111)
        ax6.bar(x6, medians_disp, yerr=stddev_disp, capsize=6, label="median ± stddev")
        ax6.scatter(x6, p95_disp, marker="D", label="p95", zorder=3)
        ax6.set_xticks(x6)
        ax6.set_xticklabels(labels_disp)
        ax6.set_ylabel("ms")
        ax6.set_title("Runtime Statement Verification Dispersion (Median, StdDev, P95)")
        ax6.legend()
        fig6.tight_layout()
        p6 = output_dir / "plot_runtime_statement_verify_dispersion_ms.png"
        fig6.savefig(p6, dpi=160)
        plt.close(fig6)
        plot_notes.append(str(p6))

    return plot_notes


def main() -> None:
    parser = argparse.ArgumentParser(description="Export CSV artifacts from proof evaluation JSON.")
    parser.add_argument("--input-json", required=True, help="Path to evaluator JSON output (use --json-only when generating it).")
    parser.add_argument(
        "--output-dir",
        default="docs/erc7984-spike/artifacts/proof-vrc",
        help="Output artifact directory.",
    )
    parser.add_argument("--no-plots", action="store_true", help="Skip plot generation.")
    args = parser.parse_args()

    input_path = Path(args.input_json).resolve()
    output_dir = Path(args.output_dir).resolve()
    ensure_dir(output_dir)

    result = load_eval_json(input_path)

    runtime_sample_rows = build_runtime_sample_rows(result)
    runtime_agg_rows = build_runtime_aggregate_rows(result)
    runtime_stmt_rows = build_runtime_statement_rows(result)

    write_csv(
        output_dir / "runtime_samples_proof_metrics.csv",
        runtime_sample_rows,
        [
            "profile",
            "cid",
            "order_id",
            "product_contract",
            "price_visibility",
            "proof_family_quantity_total",
            "proof_family_total_payment",
            "proof_type_quantity_total",
            "proof_type_total_payment",
            "quantity_total_bytes",
            "total_payment_bytes",
            "combined_proof_bytes",
            "quantity_verify_mean_ms",
            "quantity_verify_median_ms",
            "quantity_verify_p95_ms",
            "quantity_verify_stddev_ms",
            "total_payment_verify_mean_ms",
            "total_payment_verify_median_ms",
            "total_payment_verify_p95_ms",
            "total_payment_verify_stddev_ms",
            "combined_proof_verify_mean_ms",
            "proof_checks_pass",
        ],
    )

    write_csv(
        output_dir / "runtime_aggregates_proof_metrics.csv",
        runtime_agg_rows,
        [
            "profile",
            "sample_count",
            "proof_size_mean_bytes",
            "proof_size_median_bytes",
            "proof_size_p95_bytes",
            "proof_size_stddev_bytes",
            "combined_verify_mean_ms",
            "combined_verify_median_ms",
            "combined_verify_p95_ms",
            "combined_verify_stddev_ms",
            "all_proof_checks_pass",
        ],
    )

    write_csv(
        output_dir / "runtime_statement_proof_verify_metrics.csv",
        runtime_stmt_rows,
        ["profile", "statement", "mean_ms", "median_ms", "p95_ms", "stddev_ms", "sample_count"],
    )

    write_csv(
        output_dir / "layer_a_raw_proof_baseline.csv",
        RAW_LAYER_A_ROWS,
        [
            "statement",
            "proof_family",
            "generation_median_ms",
            "generation_mean_ms",
            "proof_size_bytes",
            "verification_median_ms",
            "verification_mean_ms",
        ],
    )

    plot_paths: List[str] = []
    if not args.no_plots:
        plot_paths = maybe_plot(output_dir, runtime_agg_rows, runtime_stmt_rows)

    summary = {
        "input_json": str(input_path),
        "output_dir": str(output_dir),
        "csv_files": [
            "runtime_samples_proof_metrics.csv",
            "runtime_aggregates_proof_metrics.csv",
            "runtime_statement_proof_verify_metrics.csv",
            "layer_a_raw_proof_baseline.csv",
        ],
        "plots": plot_paths,
    }

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
