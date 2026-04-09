import React from "react";
import { Link } from "react-router-dom";

function StepCard({ eyebrow, title, body, to, cta }) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-lg"
    >
      <div className="text-xs uppercase tracking-[0.24em] text-cyan-700">{eyebrow}</div>
      <h2 className="mt-3 text-2xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
      <div className="mt-6 text-sm font-medium text-cyan-700 group-hover:text-cyan-900">{cta}</div>
    </Link>
  );
}

export default function Erc7984Home({ currentUser }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#cffafe,_#f8fafc_42%,_#e2e8f0_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-2xl">
          <div className="grid gap-8 px-8 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
            <div className="space-y-5">
              <p className="text-xs uppercase tracking-[0.34em] text-cyan-300">ERC-7984 Spike Workspace</p>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white lg:text-5xl">
                Confidential escrow flow, without Railgun assumptions.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-300">
                This worktree is now centered on the ERC-7984 marketplace redesign: confidential
                buyer payment, confidential seller and transporter collateral, equality attestation,
                and ERC-7984-native VRC generation.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  to="/erc7984/actions"
                  className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
                >
                  Open Actions Flow
                </Link>
                <Link
                  to="/erc7984/vrc"
                  className="rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Open VRC Flow
                </Link>
              </div>
            </div>

            <div className="grid gap-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Connected Wallet</div>
                <div className="mt-2 break-all font-mono text-sm text-slate-100">
                  {currentUser || "not-connected"}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Proven On Sepolia</div>
                  <div className="mt-2 text-sm text-slate-100">
                    Factory deployment, public-to-confidential funding, bond equality attestation, delivery, VRC.
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Current Funding Model</div>
                  <div className="mt-2 text-sm text-slate-100">
                    Real Sepolia WETH is wrapped or brought by the actor wallet, then deposited into a wrapper
                    contract that mints matching confidential ERC-7984 balance for the marketplace flow.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <StepCard
            eyebrow="Step 1"
            title="Actions Flow"
            body="Load a live ERC-7984 escrow, inspect on-chain phase and collateral state, and execute the plain ethers-driven actions already available from the browser."
            to="/erc7984/actions"
            cta="Open ERC-7984 actions"
          />
          <StepCard
            eyebrow="Step 2"
            title="VRC Flow"
            body="Build, sign, archive, and verify the ERC-7984 schemaVersion 6.1 commitment VRC from recovered order state and the live confidential-settlement policy."
            to="/erc7984/vrc"
            cta="Open ERC-7984 VRC builder"
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Current Frontend Scope</div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-900">Included</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                ERC-7984-only navigation, actions workbench, VRC workbench, backend archive/verify integration.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-900">Explicitly Removed From Primary UX</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Railgun payment screens, legacy marketplace-first navigation, and mixed-flow entry points.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-900">Next Integration Step</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Persist proof-complete payment-bridge data so browser-created orders stop relying on fallback VRC context.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
