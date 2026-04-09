import React, { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../ui/button";
import VerifyVCInline from "../vc/VerifyVCInline";
import { readProductEscrowState } from "../../utils/erc7984/escrowState";
import { getProductMeta } from "../../utils/productMetaApi";
import { fetchVCWithSource } from "../../utils/verifyVc";
import { getOrder, getOrderByVcHash } from "../../utils/orderApi";

const PHASE_LABELS = {
  0: "Listed",
  1: "Purchased",
  2: "Order Confirmed",
  3: "In Delivery",
  4: "Delivered",
  5: "Expired",
};

function truncateAddress(value) {
  if (!value) return "";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function Erc7984AuditorVerifier({ provider }) {
  const { address } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [escrowState, setEscrowState] = useState(null);
  const [productMetaRow, setProductMetaRow] = useState(null);
  const [orderRow, setOrderRow] = useState(null);
  const [auditCid, setAuditCid] = useState("");
  const [auditVC, setAuditVC] = useState(null);
  const [auditSource, setAuditSource] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");

  const loadAuditVC = useCallback(async (cidToLoad) => {
    const normalizedCid = String(cidToLoad || "").replace(/^ipfs:\/\//, "").trim();
    if (!normalizedCid) {
      setAuditVC(null);
      setAuditSource("");
      setAuditError("");
      return;
    }

    setAuditLoading(true);
    setAuditError("");
    try {
      const { vc: nextVc, source } = await fetchVCWithSource(normalizedCid);
      setAuditCid(normalizedCid);
      setAuditVC(nextVc);
      setAuditSource(source || "");
    } catch (loadError) {
      setAuditVC(null);
      setAuditSource("");
      setAuditError(loadError.message || "Failed to load the archived VRC.");
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const loadVerifierContext = useCallback(async () => {
    if (!provider || !address) return;

    setLoading(true);
    setError("");
    try {
      const [nextState, nextProductMetaRow] = await Promise.all([
        readProductEscrowState(provider, address),
        getProductMeta(address),
      ]);

      let nextOrderRow =
        nextState.activeOrderId && nextState.activeOrderId !== ethers.ZeroHash
          ? await getOrder(nextState.activeOrderId)
          : null;

      if (nextOrderRow && !nextOrderRow.orderVcCid && nextProductMetaRow?.vcCid) {
        nextOrderRow = {
          ...nextOrderRow,
          orderVcCid: nextProductMetaRow.vcCid,
        };
      }

      if (
        nextState.vcHash &&
        nextState.vcHash !== ethers.ZeroHash &&
        (!nextOrderRow || !nextOrderRow.orderVcCid)
      ) {
        const fallbackByHash = await getOrderByVcHash(nextState.vcHash);
        if (fallbackByHash) {
          nextOrderRow = {
            ...(nextOrderRow || {}),
            ...fallbackByHash,
            orderVcCid: fallbackByHash.orderVcCid || nextOrderRow?.orderVcCid || "",
          };
        }
      }

      const resolvedCid =
        nextOrderRow?.orderVcCid ||
        nextProductMetaRow?.vcCid ||
        "";

      setEscrowState(nextState);
      setProductMetaRow(nextProductMetaRow);
      setOrderRow(nextOrderRow);
      setAuditCid(resolvedCid);

      if (resolvedCid) {
        await loadAuditVC(resolvedCid);
      } else {
        setAuditVC(null);
        setAuditSource("");
        setAuditError("");
      }
    } catch (loadError) {
      setError(loadError.message || "Failed to load ERC-7984 verifier context.");
    } finally {
      setLoading(false);
    }
  }, [address, loadAuditVC, provider]);

  useEffect(() => {
    loadVerifierContext();
  }, [loadVerifierContext]);

  if (loading) {
    return <div className="max-w-6xl mx-auto px-4 py-8 text-slate-500">Loading verifier surface...</div>;
  }

  if (error) {
    return <div className="max-w-6xl mx-auto px-4 py-8 text-red-600">{error}</div>;
  }

  const productName =
    productMetaRow?.productMeta?.productName ||
    productMetaRow?.productMeta?.name ||
    escrowState?.name ||
    "ERC-7984 Listing";
  const phaseLabel = PHASE_LABELS[Number(escrowState?.phase)] || "Unknown";
  const boundHash = escrowState?.vcHash || ethers.ZeroHash;
  const hasBoundHash = boundHash !== ethers.ZeroHash;
  const hasBoundCid = Boolean(auditCid);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.24em] text-cyan-700">Auditor / Verifier</div>
            <h1 className="text-3xl font-semibold text-slate-900">{productName}</h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              This surface is read-only. It tries to load the current ERC-7984 commitment VRC
              from IPFS first, falls back to the marketplace backend when needed, and then runs
              local signature checks, on-chain anchor checks, and backend-assisted operational checks.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" onClick={() => navigate(`/product/${address}`)}>
              Back To Product
            </Button>
            <Button variant="ghost" onClick={loadVerifierContext}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Verification Context</h2>
          <div className="mt-4 grid gap-3 text-sm text-slate-700">
            <div>
              <strong>Product Contract:</strong> {truncateAddress(address)}
            </div>
            <div>
              <strong>Stage:</strong> {phaseLabel}
            </div>
            <div className="break-all">
              <strong>Active Order:</strong> {orderRow?.orderId || escrowState?.activeOrderId || "not available"}
            </div>
            <div className="break-all">
              <strong>Bound Hash:</strong> {hasBoundHash ? boundHash : "not bound yet"}
            </div>
            <div className="break-all">
              <strong>Recovered CID:</strong> {hasBoundCid ? auditCid : "not recovered yet"}
            </div>
            <div>
              <strong>Artifact Source:</strong> {auditSource || "not loaded yet"}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Load Archived VRC
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <input
                value={auditCid}
                onChange={(event) => setAuditCid(event.target.value)}
                className="min-w-[260px] flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
                placeholder="Qm... or bafy..."
              />
              <Button onClick={() => loadAuditVC(auditCid)} disabled={auditLoading}>
                {auditLoading ? "Loading..." : "Load VRC"}
              </Button>
            </div>
            {auditError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {auditError}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">What This Checks</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <div>IPFS-first VRC retrieval with backend fallback when IPFS is unavailable.</div>
              <div>Seller signature validity for the archived commitment VRC.</div>
              <div>Marketplace operational status for the archived CID.</div>
              <div>On-chain `vcHash` anchor match against the archived CID.</div>
              <div>Embedded proof material consistency inside the ERC-7984 VRC.</div>
              <div>Backend-assisted provenance continuity and governance checks when references exist.</div>
            </div>
          </div>

          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-cyan-950">Read-Only Surface</h2>
            <p className="mt-2 text-sm text-cyan-900">
              No wallet-role action is required here. The verifier page is intentionally separate
              from buyer, seller, and transporter operations so auditors can inspect the bound
              artifact without stepping into the transaction flow.
            </p>
          </div>
        </aside>
      </div>

      {auditVC ? (
        <VerifyVCInline
          vc={auditVC}
          cid={auditCid}
          provider={provider}
          contractAddress={address}
          artifactSource={auditSource}
        />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          {hasBoundHash
            ? "A bound hash exists on-chain, but the archived CID was not recovered automatically yet. You can paste the CID manually above and load the VRC."
            : "This order does not have a bound VRC hash yet. The verifier surface becomes useful after seller confirmation binds the commitment VRC on-chain."}
        </div>
      )}
    </div>
  );
}
