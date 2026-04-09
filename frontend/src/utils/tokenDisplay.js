import { ethers } from "ethers";

function trimFormattedUnits(value) {
  if (!value) return "0";
  if (!value.includes(".")) return value;
  return value.replace(/\.?0+$/, "");
}

export function formatTokenInputValue(amountWei, decimals = 18) {
  if (amountWei == null || amountWei === "") {
    return "";
  }

  try {
    return trimFormattedUnits(ethers.formatUnits(String(amountWei), decimals));
  } catch {
    return String(amountWei);
  }
}

export function formatTokenAmount(amountWei, { symbol = "WETH", decimals = 18, fallback = "Not set" } = {}) {
  if (amountWei == null || amountWei === "") {
    return fallback;
  }

  try {
    const formatted = trimFormattedUnits(ethers.formatUnits(String(amountWei), decimals));
    return symbol ? `${formatted} ${symbol}` : formatted;
  } catch {
    return symbol ? `${String(amountWei)} ${symbol}` : String(amountWei);
  }
}

export function parseTokenAmountInput(value, { label = "Amount", decimals = 18 } = {}) {
  const raw = String(value || "").trim();

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`${label} must be a positive decimal amount.`);
  }

  const parsed = ethers.parseUnits(raw, decimals);
  if (parsed <= 0n) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return parsed;
}
