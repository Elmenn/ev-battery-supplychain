#!/usr/bin/env python3
"""Export smart-contract/runtime artifacts (CSV + optional plots) from order-eval JSON files."""

from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path
from statistics import mean
from typing import Dict, Iterable, List, Optional, Tuple


CORE_STEPS = [
    "create product",
    "buyer confidential purchase",
    "seller confidential bond",
    "seller equality finalization",
    "seller confirm order",
]

SELLER_STEPS = [
    "seller confidential bond",
    "seller equality finalization",
    "seller confirm order",
]

SIGNATURE_BASELINE_RANGES = [
    {
        "metric": "issuer_signature_verification_median_ms",
        "min_ms": 48.820,
        "max_ms": 51.410,
    },
    {
        "metric": "holder_signature_verification_median_ms",
        "min_ms": 48.318,
        "max_ms": 48.794,
    },
    {
        "metric": "full_two_signature_verification_median_ms",
        "min_ms": 93.430,
        "max_ms": 106.649,
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


def to_float(value) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except Exception:
        return None


def percentile(values: List[float], p: float) -> float:
    if not values:
        return math.nan
    sorted_values = sorted(values)
    if p <= 0:
        return sorted_values[0]
    if p >= 100:
        return sorted_values[-1]
    pos = (len(sorted_values) - 1) * p / 100
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return sorted_values[lo]
    w = pos - lo
    return sorted_values[lo] * (1 - w) + sorted_values[hi] * w


def stddev(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    avg = mean(values)
    var = sum((v - avg) ** 2 for v in values) / len(values)
    return math.sqrt(var)


def stats(values: Iterable[float]) -> Dict[str, float]:
    nums = [float(v) for v in values]
    if not nums:
        return {
            "min": math.nan,
            "mean": math.nan,
            "median": math.nan,
            "p95": math.nan,
            "max": math.nan,
            "stddev": math.nan,
            "n": 0,
        }
    return {
        "min": round3(min(nums)),
        "mean": round3(mean(nums)),
        "median": round3(percentile(nums, 50)),
        "p95": round3(percentile(nums, 95)),
        "max": round3(max(nums)),
        "stddev": round3(stddev(nums)),
        "n": len(nums),
    }


def load_json_tolerant(path: Path) -> Dict:
    raw = path.read_bytes()
    decodings = ("utf-8-sig", "utf-16", "utf-16-le", "utf-16-be", "cp1252", "latin-1")
    last_error: Exception | None = None
    for encoding in decodings:
        try:
            text = raw.decode(encoding)
        except Exception as exc:
            last_error = exc
            continue

        try:
            return json.loads(text)
        except Exception:
            pass

        decoder = json.JSONDecoder()
        for idx, ch in enumerate(text):
            if ch not in "{[":
                continue
            try:
                candidate, _ = decoder.raw_decode(text[idx:])
            except Exception as exc:
                last_error = exc
                continue
            if isinstance(candidate, dict) and ("profile" in candidate and "steps" in candidate):
                return candidate

    if last_error:
        raise ValueError(f"Unable to parse JSON from {path}: {last_error}") from last_error
    raise ValueError(f"Unable to parse JSON from {path}")


def collect_input_files(input_dir: Path, input_files: List[str]) -> List[Path]:
    if input_files:
        files = [Path(item).resolve() for item in input_files]
    else:
        files = sorted(input_dir.glob("*.json"))
    return [path for path in files if path.exists()]


def get_step_map(order_json: Dict) -> Dict[str, Dict]:
    return {str(step.get("step")): step for step in order_json.get("steps", [])}


def fee_eth(step: Optional[Dict]) -> Optional[float]:
    if not step:
        return None
    return to_float(step.get("feeEth"))


def gas_used(step: Optional[Dict]) -> Optional[float]:
    if not step:
        return None
    return to_float(step.get("gasUsed"))


def ts(step: Optional[Dict]) -> Optional[int]:
    if not step:
        return None
    value = step.get("blockTimestamp")
    try:
        return int(value) if value is not None else None
    except Exception:
        return None


def elapsed_seconds(start: Optional[int], end: Optional[int]) -> Optional[float]:
    if start is None or end is None:
        return None
    return float(end - start)


def build_order_sample(order_json: Dict, source_file: str) -> Dict:
    step_map = get_step_map(order_json)
    create = step_map.get("create product")
    purchase = step_map.get("buyer confidential purchase")
    seller_bond = step_map.get("seller confidential bond")
    seller_confirm = step_map.get("seller confirm order")

    all_fees = [to_float(step.get("feeEth")) for step in order_json.get("steps", [])]
    full_measured_fee_eth = sum(v for v in all_fees if v is not None)
    core_fee_eth = sum(
        fee_eth(step_map.get(step_name)) or 0.0 for step_name in CORE_STEPS
    )

    return {
        "source_file": source_file,
        "profile": order_json.get("profile"),
        "order_id": order_json.get("orderId"),
        "vc_cid": order_json.get("orderVcCid"),
        "product_address": order_json.get("productAddress"),
        "buyer_side_fee_eth": to_float(order_json.get("summary", {}).get("buyerSideFeeEth")),
        "seller_side_fee_eth": to_float(order_json.get("summary", {}).get("sellerSideFeeEth")),
        "total_fee_eth_reported": to_float(order_json.get("summary", {}).get("totalFeeEth")),
        "core_fee_eth": round3(core_fee_eth),
        "full_measured_fee_eth": round3(full_measured_fee_eth),
        "seller_elapsed_s": elapsed_seconds(ts(seller_bond), ts(seller_confirm)),
        "core_elapsed_s": elapsed_seconds(ts(purchase), ts(seller_confirm)),
        "full_elapsed_s": elapsed_seconds(ts(create), ts(seller_confirm)),
        "has_all_core_steps": all(step_map.get(step_name) for step_name in CORE_STEPS),
    }


def build_step_rows(order_json: Dict, source_file: str) -> List[Dict]:
    step_map = get_step_map(order_json)
    rows: List[Dict] = []
    for step_name in CORE_STEPS:
        step = step_map.get(step_name)
        rows.append(
            {
                "source_file": source_file,
                "profile": order_json.get("profile"),
                "order_id": order_json.get("orderId"),
                "step": step_name,
                "gas_used": gas_used(step),
                "fee_eth": fee_eth(step),
                "block_timestamp_iso": step.get("blockTimestampIso") if step else None,
            }
        )
    return rows


def aggregate_step_metrics(step_rows: List[Dict]) -> List[Dict]:
    grouped: Dict[Tuple[str, str], Dict[str, List[float]]] = {}
    for row in step_rows:
        key = (str(row["profile"]), str(row["step"]))
        grouped.setdefault(key, {"gas": [], "fee": []})
        if row["gas_used"] is not None:
            grouped[key]["gas"].append(float(row["gas_used"]))
        if row["fee_eth"] is not None:
            grouped[key]["fee"].append(float(row["fee_eth"]))

    out = []
    for (profile, step), values in sorted(grouped.items()):
        gas_stats = stats(values["gas"])
        fee_stats = stats(values["fee"])
        out.append(
            {
                "profile": profile,
                "step": step,
                "gas_mean": gas_stats["mean"],
                "gas_median": gas_stats["median"],
                "gas_p95": gas_stats["p95"],
                "gas_stddev": gas_stats["stddev"],
                "gas_n": gas_stats["n"],
                "fee_mean_eth": fee_stats["mean"],
                "fee_median_eth": fee_stats["median"],
                "fee_p95_eth": fee_stats["p95"],
                "fee_stddev_eth": fee_stats["stddev"],
                "fee_n": fee_stats["n"],
            }
        )
    return out


def aggregate_profile_totals(order_rows: List[Dict]) -> List[Dict]:
    metrics = [
        "buyer_side_fee_eth",
        "seller_side_fee_eth",
        "total_fee_eth_reported",
        "core_fee_eth",
        "full_measured_fee_eth",
        "seller_elapsed_s",
        "core_elapsed_s",
        "full_elapsed_s",
    ]
    output: List[Dict] = []
    for profile in ("public", "private"):
        scoped = [row for row in order_rows if row["profile"] == profile]
        for metric in metrics:
            values = [float(v) for v in (row.get(metric) for row in scoped) if v is not None]
            st = stats(values)
            output.append(
                {
                    "profile": profile,
                    "metric": metric,
                    "min": st["min"],
                    "mean": st["mean"],
                    "median": st["median"],
                    "p95": st["p95"],
                    "max": st["max"],
                    "stddev": st["stddev"],
                    "n": st["n"],
                }
            )
    return output


def build_erc20_comparison(
    step_metrics: List[Dict],
    erc20_gas: float,
    erc20_fee_eth: float,
) -> List[Dict]:
    core_subset = [
        "create product",
        "buyer confidential purchase",
        "seller confidential bond",
        "seller equality finalization",
        "seller confirm order",
    ]
    rows = []
    for profile in ("public", "private"):
        for step in core_subset:
            row = next((r for r in step_metrics if r["profile"] == profile and r["step"] == step), None)
            if not row:
                continue
            rows.append(
                {
                    "profile": row["profile"],
                    "step": row["step"],
                    "gas_mean": row["gas_mean"],
                    "fee_mean_eth": row["fee_mean_eth"],
                    "gas_ratio_vs_erc20": round3(row["gas_mean"] / erc20_gas) if erc20_gas else math.nan,
                    "fee_ratio_vs_erc20": round3(row["fee_mean_eth"] / erc20_fee_eth) if erc20_fee_eth else math.nan,
                    "erc20_gas_baseline": erc20_gas,
                    "erc20_fee_eth_baseline": erc20_fee_eth,
                }
            )
    return rows


def signature_baseline_rows() -> List[Dict]:
    rows = []
    for item in SIGNATURE_BASELINE_RANGES:
        min_v = float(item["min_ms"])
        max_v = float(item["max_ms"])
        rows.append(
            {
                "metric": item["metric"],
                "min_ms": round3(min_v),
                "max_ms": round3(max_v),
                "midpoint_ms": round3((min_v + max_v) / 2),
                "range_width_ms": round3(max_v - min_v),
            }
        )
    return rows


def maybe_plot(
    output_dir: Path,
    step_metrics: List[Dict],
    profile_totals: List[Dict],
    erc20_rows: List[Dict],
    include_signature_plot: bool,
) -> List[str]:
    try:
        import matplotlib.pyplot as plt  # type: ignore
    except Exception:
        return ["matplotlib not available; skipped plot generation"]

    plots: List[str] = []
    width = 0.35

    # Plot 1: Core-step gas mean
    steps = CORE_STEPS
    public_gas = []
    private_gas = []
    for step in steps:
        pub = next((r for r in step_metrics if r["profile"] == "public" and r["step"] == step), None)
        priv = next((r for r in step_metrics if r["profile"] == "private" and r["step"] == step), None)
        public_gas.append(float(pub["gas_mean"]) if pub and not math.isnan(pub["gas_mean"]) else math.nan)
        private_gas.append(float(priv["gas_mean"]) if priv and not math.isnan(priv["gas_mean"]) else math.nan)

    x = list(range(len(steps)))
    fig1 = plt.figure(figsize=(10, 4))
    ax1 = fig1.add_subplot(111)
    ax1.bar([v - width / 2 for v in x], public_gas, width=width, label="public")
    ax1.bar([v + width / 2 for v in x], private_gas, width=width, label="private")
    ax1.set_xticks(x)
    ax1.set_xticklabels(steps, rotation=20, ha="right")
    ax1.set_ylabel("gas")
    ax1.set_title("Core Flow Gas (Mean)")
    ax1.legend()
    fig1.tight_layout()
    p1 = output_dir / "plot_sc_core_step_gas_mean.png"
    fig1.savefig(p1, dpi=160)
    plt.close(fig1)
    plots.append(str(p1))

    # Plot 2: Core-step fee mean
    public_fee = []
    private_fee = []
    for step in steps:
        pub = next((r for r in step_metrics if r["profile"] == "public" and r["step"] == step), None)
        priv = next((r for r in step_metrics if r["profile"] == "private" and r["step"] == step), None)
        public_fee.append(float(pub["fee_mean_eth"]) if pub and not math.isnan(pub["fee_mean_eth"]) else math.nan)
        private_fee.append(float(priv["fee_mean_eth"]) if priv and not math.isnan(priv["fee_mean_eth"]) else math.nan)

    fig2 = plt.figure(figsize=(10, 4))
    ax2 = fig2.add_subplot(111)
    ax2.bar([v - width / 2 for v in x], public_fee, width=width, label="public")
    ax2.bar([v + width / 2 for v in x], private_fee, width=width, label="private")
    ax2.set_xticks(x)
    ax2.set_xticklabels(steps, rotation=20, ha="right")
    ax2.set_ylabel("ETH")
    ax2.set_title("Core Flow Fee (Mean ETH)")
    ax2.legend()
    fig2.tight_layout()
    p2 = output_dir / "plot_sc_core_step_fee_mean_eth.png"
    fig2.savefig(p2, dpi=160)
    plt.close(fig2)
    plots.append(str(p2))

    # Plot 3: Profile total fee mean
    metrics_fee = ["buyer_side_fee_eth", "seller_side_fee_eth", "total_fee_eth_reported"]
    labels_fee = ["buyer-side", "seller-side", "end-to-end"]
    public_vals = []
    private_vals = []
    for metric in metrics_fee:
        pub = next((r for r in profile_totals if r["profile"] == "public" and r["metric"] == metric), None)
        priv = next((r for r in profile_totals if r["profile"] == "private" and r["metric"] == metric), None)
        public_vals.append(float(pub["mean"]) if pub and not math.isnan(pub["mean"]) else math.nan)
        private_vals.append(float(priv["mean"]) if priv and not math.isnan(priv["mean"]) else math.nan)

    x3 = list(range(len(labels_fee)))
    fig3 = plt.figure(figsize=(8, 4))
    ax3 = fig3.add_subplot(111)
    ax3.bar([v - width / 2 for v in x3], public_vals, width=width, label="public")
    ax3.bar([v + width / 2 for v in x3], private_vals, width=width, label="private")
    ax3.set_xticks(x3)
    ax3.set_xticklabels(labels_fee)
    ax3.set_ylabel("ETH")
    ax3.set_title("Profile Runtime Fee Totals (Mean)")
    ax3.legend()
    fig3.tight_layout()
    p3 = output_dir / "plot_sc_profile_fee_totals_mean_eth.png"
    fig3.savefig(p3, dpi=160)
    plt.close(fig3)
    plots.append(str(p3))

    # Plot 4: Profile elapsed means
    metrics_elapsed = ["seller_elapsed_s", "core_elapsed_s", "full_elapsed_s"]
    labels_elapsed = ["seller", "core", "full"]
    public_elapsed = []
    private_elapsed = []
    for metric in metrics_elapsed:
        pub = next((r for r in profile_totals if r["profile"] == "public" and r["metric"] == metric), None)
        priv = next((r for r in profile_totals if r["profile"] == "private" and r["metric"] == metric), None)
        public_elapsed.append(float(pub["mean"]) if pub and not math.isnan(pub["mean"]) else math.nan)
        private_elapsed.append(float(priv["mean"]) if priv and not math.isnan(priv["mean"]) else math.nan)

    x4 = list(range(len(labels_elapsed)))
    fig4 = plt.figure(figsize=(8, 4))
    ax4 = fig4.add_subplot(111)
    ax4.bar([v - width / 2 for v in x4], public_elapsed, width=width, label="public")
    ax4.bar([v + width / 2 for v in x4], private_elapsed, width=width, label="private")
    ax4.set_xticks(x4)
    ax4.set_xticklabels(labels_elapsed)
    ax4.set_ylabel("seconds")
    ax4.set_title("Profile Runtime Elapsed Time (Mean)")
    ax4.legend()
    fig4.tight_layout()
    p4 = output_dir / "plot_sc_profile_elapsed_mean_s.png"
    fig4.savefig(p4, dpi=160)
    plt.close(fig4)
    plots.append(str(p4))

    # Plot 5: Gas ratio vs ERC20 baseline
    ratio_steps = [r["step"] for r in erc20_rows if r["profile"] == "public"]
    public_ratio = [float(r["gas_ratio_vs_erc20"]) for r in erc20_rows if r["profile"] == "public"]
    private_ratio = [float(r["gas_ratio_vs_erc20"]) for r in erc20_rows if r["profile"] == "private"]
    x5 = list(range(len(ratio_steps)))
    fig5 = plt.figure(figsize=(9, 4))
    ax5 = fig5.add_subplot(111)
    ax5.bar([v - width / 2 for v in x5], public_ratio, width=width, label="public")
    ax5.bar([v + width / 2 for v in x5], private_ratio, width=width, label="private")
    ax5.set_xticks(x5)
    ax5.set_xticklabels(ratio_steps, rotation=20, ha="right")
    ax5.set_ylabel("x vs ERC20")
    ax5.set_title("Core Step Gas Multiplier vs ERC20 Baseline")
    ax5.legend()
    fig5.tight_layout()
    p5 = output_dir / "plot_sc_vs_erc20_gas_ratio.png"
    fig5.savefig(p5, dpi=160)
    plt.close(fig5)
    plots.append(str(p5))

    # Plot 6: Confidential multiplier vs ERC20 with profile range (public/private spread).
    # This compresses public/private into one core signal with an uncertainty band.
    labels6: List[str] = []
    midpoint6: List[float] = []
    err_low6: List[float] = []
    err_high6: List[float] = []
    for step in CORE_STEPS:
        pub_row = next((r for r in erc20_rows if r["profile"] == "public" and r["step"] == step), None)
        priv_row = next((r for r in erc20_rows if r["profile"] == "private" and r["step"] == step), None)
        if not pub_row or not priv_row:
            continue
        pub = float(pub_row["gas_ratio_vs_erc20"])
        priv = float(priv_row["gas_ratio_vs_erc20"])
        lo = min(pub, priv)
        hi = max(pub, priv)
        mid = (pub + priv) / 2.0
        labels6.append(step)
        midpoint6.append(mid)
        err_low6.append(mid - lo)
        err_high6.append(hi - mid)

    if labels6:
        x6 = list(range(len(labels6)))
        fig6 = plt.figure(figsize=(10, 4))
        ax6 = fig6.add_subplot(111)
        ax6.bar(x6, midpoint6, yerr=[err_low6, err_high6], capsize=6)
        ax6.set_xticks(x6)
        ax6.set_xticklabels(labels6, rotation=20, ha="right")
        ax6.set_ylabel("x vs ERC20")
        ax6.set_title("Confidential Core-Step Gas Multiplier vs ERC20 (Public/Private Range)")
        fig6.tight_layout()
        p6 = output_dir / "plot_sc_vs_erc20_multiplier_with_profile_range.png"
        fig6.savefig(p6, dpi=160)
        plt.close(fig6)
        plots.append(str(p6))

    # Plot 7: Private-minus-public delta (%), step-by-step.
    labels7: List[str] = []
    delta_pct7: List[float] = []
    for step in CORE_STEPS:
        pub_row = next((r for r in step_metrics if r["profile"] == "public" and r["step"] == step), None)
        priv_row = next((r for r in step_metrics if r["profile"] == "private" and r["step"] == step), None)
        if not pub_row or not priv_row:
            continue
        pub_gas = float(pub_row["gas_mean"])
        priv_gas = float(priv_row["gas_mean"])
        if pub_gas == 0:
            continue
        labels7.append(step)
        delta_pct7.append(((priv_gas - pub_gas) / pub_gas) * 100.0)

    if labels7:
        x7 = list(range(len(labels7)))
        fig7 = plt.figure(figsize=(10, 4))
        ax7 = fig7.add_subplot(111)
        ax7.bar(x7, delta_pct7)
        ax7.axhline(0.0, linewidth=1)
        ax7.set_xticks(x7)
        ax7.set_xticklabels(labels7, rotation=20, ha="right")
        ax7.set_ylabel("private - public (%)")
        ax7.set_title("Core-Step Gas Delta: Private vs Public")
        fig7.tight_layout()
        p7 = output_dir / "plot_sc_private_minus_public_delta_pct.png"
        fig7.savefig(p7, dpi=160)
        plt.close(fig7)
        plots.append(str(p7))

    if include_signature_plot:
        sig_rows = signature_baseline_rows()
        labels = [row["metric"] for row in sig_rows]
        mids = [float(row["midpoint_ms"]) for row in sig_rows]
        err_low = [float(row["midpoint_ms"] - row["min_ms"]) for row in sig_rows]
        err_high = [float(row["max_ms"] - row["midpoint_ms"]) for row in sig_rows]
        fig6 = plt.figure(figsize=(10, 4))
        ax6 = fig6.add_subplot(111)
        ax6.bar(labels, mids, yerr=[err_low, err_high], capsize=6)
        ax6.set_ylabel("ms")
        ax6.set_title("VC Signature Verification Baseline (Median Range)")
        ax6.set_xticklabels(labels, rotation=20, ha="right")
        fig6.tight_layout()
        p6 = output_dir / "plot_vc_signature_baseline_median_range_ms.png"
        fig6.savefig(p6, dpi=160)
        plt.close(fig6)
        plots.append(str(p6))

    return plots


def main() -> None:
    parser = argparse.ArgumentParser(description="Export CSV + plots for smart-contract/runtime evaluation artifacts.")
    parser.add_argument(
        "--input-dir",
        default="docs/erc7984-spike/artifacts/order-runtime",
        help="Directory containing order evaluation JSON files.",
    )
    parser.add_argument(
        "--input-files",
        action="append",
        default=[],
        help="Explicit JSON file path (repeatable). If provided, --input-dir scan is skipped.",
    )
    parser.add_argument(
        "--output-dir",
        default="docs/erc7984-spike/artifacts/order-runtime",
        help="Output artifact directory.",
    )
    parser.add_argument("--erc20-gas", type=float, default=34470.0, help="ERC20 transfer gas baseline.")
    parser.add_argument("--erc20-fee-eth", type=float, default=0.000133628, help="ERC20 transfer fee ETH baseline.")
    parser.add_argument("--no-plots", action="store_true", help="Skip PNG plot generation.")
    parser.add_argument(
        "--include-signature-baseline",
        action="store_true",
        help="Also emit VC signature baseline CSV/plot from doc-23 ranges.",
    )
    args = parser.parse_args()

    input_dir = Path(args.input_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    ensure_dir(output_dir)

    input_paths = collect_input_files(input_dir, args.input_files)
    if not input_paths:
        raise ValueError("No input JSON files found. Provide --input-files or place files in --input-dir.")

    order_rows: List[Dict] = []
    step_rows: List[Dict] = []
    for path in input_paths:
        data = load_json_tolerant(path)
        order_rows.append(build_order_sample(data, str(path)))
        step_rows.extend(build_step_rows(data, str(path)))

    step_metrics = aggregate_step_metrics(step_rows)
    profile_totals = aggregate_profile_totals(order_rows)
    erc20_rows = build_erc20_comparison(step_metrics, args.erc20_gas, args.erc20_fee_eth)

    write_csv(
        output_dir / "runtime_order_samples.csv",
        order_rows,
        [
            "source_file",
            "profile",
            "order_id",
            "vc_cid",
            "product_address",
            "buyer_side_fee_eth",
            "seller_side_fee_eth",
            "total_fee_eth_reported",
            "core_fee_eth",
            "full_measured_fee_eth",
            "seller_elapsed_s",
            "core_elapsed_s",
            "full_elapsed_s",
            "has_all_core_steps",
        ],
    )

    write_csv(
        output_dir / "runtime_core_step_metrics.csv",
        step_metrics,
        [
            "profile",
            "step",
            "gas_mean",
            "gas_median",
            "gas_p95",
            "gas_stddev",
            "gas_n",
            "fee_mean_eth",
            "fee_median_eth",
            "fee_p95_eth",
            "fee_stddev_eth",
            "fee_n",
        ],
    )

    write_csv(
        output_dir / "runtime_profile_totals_metrics.csv",
        profile_totals,
        ["profile", "metric", "min", "mean", "median", "p95", "max", "stddev", "n"],
    )

    write_csv(
        output_dir / "runtime_vs_erc20_baseline.csv",
        erc20_rows,
        [
            "profile",
            "step",
            "gas_mean",
            "fee_mean_eth",
            "gas_ratio_vs_erc20",
            "fee_ratio_vs_erc20",
            "erc20_gas_baseline",
            "erc20_fee_eth_baseline",
        ],
    )

    csv_files = [
        "runtime_order_samples.csv",
        "runtime_core_step_metrics.csv",
        "runtime_profile_totals_metrics.csv",
        "runtime_vs_erc20_baseline.csv",
    ]

    if args.include_signature_baseline:
        sig_rows = signature_baseline_rows()
        write_csv(
            output_dir / "signature_baseline_ranges.csv",
            sig_rows,
            ["metric", "min_ms", "max_ms", "midpoint_ms", "range_width_ms"],
        )
        csv_files.append("signature_baseline_ranges.csv")

    plots: List[str] = []
    if not args.no_plots:
        plots = maybe_plot(
            output_dir=output_dir,
            step_metrics=step_metrics,
            profile_totals=profile_totals,
            erc20_rows=erc20_rows,
            include_signature_plot=args.include_signature_baseline,
        )

    print(
        json.dumps(
            {
                "input_files": [str(p) for p in input_paths],
                "output_dir": str(output_dir),
                "csv_files": csv_files,
                "plots": plots,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
