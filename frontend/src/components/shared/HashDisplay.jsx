import React, { useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";

const ZERO_BYTES32 = "0x" + "0".repeat(64);

function isEmptyHash(hash) {
  if (!hash) return true;
  const normalized = hash.toLowerCase();
  return normalized === ZERO_BYTES32 || normalized === "0x" + "0".repeat(64);
}

function truncateHash(hash) {
  if (!hash || hash.length <= 20) return hash;
  return hash.slice(0, 10) + "..." + hash.slice(-8);
}

function normalizeBaseUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function getQrBaseUrl() {
  const overrideUrl = normalizeBaseUrl(process.env.REACT_APP_QR_BASE_URL);
  if (overrideUrl) return overrideUrl;

  const publicUrl = normalizeBaseUrl(process.env.REACT_APP_PUBLIC_URL);
  if (publicUrl) return publicUrl;

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "https://example.invalid";
}

function buildDeliveryQrLink({ hash, productAddress, chainId, vcCid }) {
  const appBaseUrl = getQrBaseUrl();
  const path = productAddress ? `/product/${productAddress}` : "/product";
  const url = new URL(`${appBaseUrl}${path}`);
  url.searchParams.set("qr", "delivery-v1");
  url.searchParams.set("deliveryHash", hash || "");

  if (chainId != null && String(chainId).trim() !== "") {
    url.searchParams.set("chainId", String(chainId));
  }
  if (vcCid && String(vcCid).trim() !== "") {
    url.searchParams.set("cid", String(vcCid).trim());
  }

  return url.toString();
}

/**
 * Display a hash with truncation, copy button, QR code, and optional guidance text.
 *
 * @param {{ hash: string, label: string, guidance?: string, productAddress?: string, chainId?: number|string, vcCid?: string }} props
 */
export default function HashDisplay({
  hash,
  label,
  guidance,
  productAddress,
  chainId,
  vcCid,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!hash || isEmptyHash(hash)) return;
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [hash]);

  const empty = isEmptyHash(hash);
  const qrPayload = buildDeliveryQrLink({
    hash,
    productAddress,
    chainId,
    vcCid,
  });

  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <h4 className="text-sm font-medium text-gray-700 mb-2">{label}</h4>

      {empty ? (
        <p className="text-sm text-gray-400 italic">Not yet available</p>
      ) : (
        <>
          <div className="flex items-center space-x-2 mb-3">
            <code className="text-xs font-mono bg-white px-2 py-1 rounded border border-gray-200 text-gray-800 break-all">
              {truncateHash(hash)}
            </code>
            <button
              onClick={handleCopy}
              className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div className="flex justify-center">
            <QRCodeSVG value={qrPayload} size={128} />
          </div>
          <p className="mt-2 text-center text-[11px] text-gray-500">
            QR deep-link: product + hash + chain + CID
          </p>
        </>
      )}

      {guidance && (
        <p className="mt-2 text-xs text-gray-500">{guidance}</p>
      )}
    </div>
  );
}
