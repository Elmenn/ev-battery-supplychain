import React, { useCallback, useEffect, useState } from "react";
import { Contract, ethers } from "ethers";
import toast from "react-hot-toast";
import { Button } from "../ui/button";
import { loadErc7984DeploymentConfig } from "../../utils/erc7984Deployment";
import { userDecryptUint64Handle } from "../../utils/erc7984/fhevmClient";
import { formatTokenAmount, parseTokenAmountInput } from "../../utils/tokenDisplay";

const PUBLIC_ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function deposit() payable",
];

const FUNDING_WRAPPER_ABI = [
  "function deposit(uint256 amount) returns (uint64 mintedAmount)",
  "function redeem(uint256 amount) returns (uint64 burnedAmount)",
];

const CONFIDENTIAL_TOKEN_ABI = [
  "function confidentialBalanceOf(address account) view returns (bytes32)",
];

function truncateAddress(value) {
  if (!value) return "";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function Erc7984FundingCard({
  provider,
  currentUser,
  title = "Wallet Funding",
  description = "Move public payment-token value into private balance with the current 1:1 marketplace MVP model.",
  amountInput,
  onAmountInputChange,
  amountLabel = "Move To Private Balance",
  amountPlaceholder = "0.002",
  onBalancesChange,
  refreshTrigger = 0,
}) {
  const [deploymentConfig, setDeploymentConfig] = useState(null);
  const [publicBalance, setPublicBalance] = useState(null);
  const [privateBalance, setPrivateBalance] = useState(null);
  const [privateBalanceLoaded, setPrivateBalanceLoaded] = useState(false);
  const [wrapperLiquidity, setWrapperLiquidity] = useState(null);
  const [actionLoading, setActionLoading] = useState("");

  const publicTokenLabel = deploymentConfig?.publicTokenSymbol || "ERC20";
  const publicTokenIsWrappedNative = Boolean(deploymentConfig?.publicTokenIsWrappedNative);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      const nextConfig = await loadErc7984DeploymentConfig();
      if (!cancelled) {
        setDeploymentConfig(nextConfig);
      }
    }

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshBalances = useCallback(async ({ includePrivate = false } = {}) => {
    if (!provider || !currentUser) return;
    if (!deploymentConfig?.publicToken || !deploymentConfig?.confidentialToken || !deploymentConfig?.fundingWrapper) {
      return;
    }

    const publicToken = new Contract(deploymentConfig.publicToken, PUBLIC_ERC20_ABI, provider);
    const nextPublicBalance = await publicToken.balanceOf(currentUser);
    const nextWrapperLiquidity = await publicToken.balanceOf(deploymentConfig.fundingWrapper);

    const nextPublic = nextPublicBalance.toString();
    const nextLiquidity = nextWrapperLiquidity.toString();
    setPublicBalance(nextPublic);
    setWrapperLiquidity(nextLiquidity);

    let nextPrivate = privateBalance;
    if (includePrivate) {
      const signer = await provider.getSigner();
      const confidentialToken = new Contract(deploymentConfig.confidentialToken, CONFIDENTIAL_TOKEN_ABI, provider);
      const balanceHandle = await confidentialToken.confidentialBalanceOf(currentUser);
      nextPrivate = "0";
      if (balanceHandle && balanceHandle !== ethers.ZeroHash) {
        const decryptedBalance = await userDecryptUint64Handle({
          provider,
          signer,
          contractAddress: deploymentConfig.confidentialToken,
          handle: balanceHandle,
        });
        nextPrivate = decryptedBalance.toString();
      }
      setPrivateBalance(nextPrivate);
      setPrivateBalanceLoaded(true);
    }

    await onBalancesChange?.({
      publicBalance: nextPublic,
      privateBalance: nextPrivate,
      wrapperLiquidity: nextLiquidity,
      fundingWrapper: deploymentConfig.fundingWrapper,
      publicToken: deploymentConfig.publicToken,
      confidentialToken: deploymentConfig.confidentialToken,
    });
  }, [currentUser, deploymentConfig, onBalancesChange, privateBalance, provider]);

  const refreshPrivateBalance = useCallback(async () => {
    if (!provider || !currentUser) return;
    if (!deploymentConfig?.confidentialToken) return;

    const signer = await provider.getSigner();
    const confidentialToken = new Contract(deploymentConfig.confidentialToken, CONFIDENTIAL_TOKEN_ABI, provider);
    const balanceHandle = await confidentialToken.confidentialBalanceOf(currentUser);

    let nextPrivate = "0";
    if (balanceHandle && balanceHandle !== ethers.ZeroHash) {
      const decryptedBalance = await userDecryptUint64Handle({
        provider,
        signer,
        contractAddress: deploymentConfig.confidentialToken,
        handle: balanceHandle,
      });
      nextPrivate = decryptedBalance.toString();
    }

    setPrivateBalance(nextPrivate);
    setPrivateBalanceLoaded(true);
    await onBalancesChange?.({
      publicBalance,
      privateBalance: nextPrivate,
      wrapperLiquidity,
      fundingWrapper: deploymentConfig.fundingWrapper,
      publicToken: deploymentConfig.publicToken,
      confidentialToken: deploymentConfig.confidentialToken,
    });
  }, [currentUser, deploymentConfig, onBalancesChange, provider, publicBalance, wrapperLiquidity]);

  useEffect(() => {
    refreshBalances({ includePrivate: false }).catch((error) => {
      console.warn("Failed to refresh ERC-7984 funding balances", error);
    });
  }, [refreshBalances, refreshTrigger]);

  async function handleWrapToWeth() {
    if (!provider || !deploymentConfig?.publicToken || !publicTokenIsWrappedNative) return;

    setActionLoading("wrap-public-token");
    try {
      const signer = await provider.getSigner();
      const publicToken = new Contract(deploymentConfig.publicToken, PUBLIC_ERC20_ABI, signer);
      const amount = parseTokenAmountInput(amountInput, {
        label: `${publicTokenLabel} wrap amount`,
      });
      const tx = await publicToken.deposit({ value: amount });
      await tx.wait();
      toast.success(
        `Wrapped ${formatTokenAmount(amount, { symbol: publicTokenLabel })} from native balance.`
      );
      await refreshBalances({ includePrivate: false });
    } catch (error) {
      toast.error(error.message || `Failed to wrap native balance into ${publicTokenLabel}.`);
    } finally {
      setActionLoading("");
    }
  }

  async function handleMoveToPrivate() {
    if (!provider || !deploymentConfig?.publicToken || !deploymentConfig?.fundingWrapper) return;

    setActionLoading("fund-private");
    try {
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();
      const amount = parseTokenAmountInput(amountInput, {
        label: `${publicTokenLabel} funding amount`,
      });
      const publicToken = new Contract(deploymentConfig.publicToken, PUBLIC_ERC20_ABI, signer);
      const wrapper = new Contract(deploymentConfig.fundingWrapper, FUNDING_WRAPPER_ABI, signer);
      const currentAllowance = await publicToken.allowance(userAddress, deploymentConfig.fundingWrapper);

      if (currentAllowance < amount) {
        const approveTx = await publicToken.approve(deploymentConfig.fundingWrapper, amount);
        await approveTx.wait();
      }

      const tx = await wrapper.deposit(amount);
      await tx.wait();
      toast.success(
        `Moved ${formatTokenAmount(amount, { symbol: publicTokenLabel })} into private balance.`
      );
      await refreshBalances({ includePrivate: true });
    } catch (error) {
      toast.error(error.message || "Failed to fund private balance.");
    } finally {
      setActionLoading("");
    }
  }

  async function handleRedeemToPublic() {
    if (!provider || !deploymentConfig?.fundingWrapper) return;

    setActionLoading("redeem-public");
    try {
      const signer = await provider.getSigner();
      const amount = parseTokenAmountInput(amountInput, {
        label: `${publicTokenLabel} redeem amount`,
      });
      const wrapper = new Contract(deploymentConfig.fundingWrapper, FUNDING_WRAPPER_ABI, signer);

      const tx = await wrapper.redeem(amount);
      await tx.wait();
      toast.success(
        `Redeemed ${formatTokenAmount(amount, { symbol: publicTokenLabel })} back to public balance.`
      );
      await refreshBalances({ includePrivate: true });
    } catch (error) {
      toast.error(error.message || "Failed to redeem to public balance.");
    } finally {
      setActionLoading("");
    }
  }

  async function handleRefreshPrivateBalance() {
    setActionLoading("refresh-private");
    try {
      await refreshPrivateBalance();
      toast.success(privateBalanceLoaded ? "Private balance refreshed." : "Private balance loaded.");
    } catch (error) {
      toast.error(error.message || "Failed to load private balance.");
    } finally {
      setActionLoading("");
    }
  }

  const hasDeploymentConfig =
    Boolean(deploymentConfig?.publicToken) &&
    Boolean(deploymentConfig?.fundingWrapper) &&
    Boolean(deploymentConfig?.confidentialToken);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{description}</p>

      <div className="mt-4 grid gap-3 text-sm text-slate-700">
        <div>
          <strong>Public balance:</strong>{" "}
          {publicBalance == null
            ? "loading..."
            : formatTokenAmount(publicBalance, { symbol: publicTokenLabel, fallback: "0" })}
        </div>
        <div>
          <strong>Private balance:</strong>{" "}
          {privateBalanceLoaded
            ? formatTokenAmount(privateBalance ?? "0", { symbol: publicTokenLabel, fallback: "0" })
            : "not loaded"}
        </div>
        <div>
          <strong>Funding wrapper:</strong> {truncateAddress(deploymentConfig?.fundingWrapper || "")}
        </div>
        <div>
          <strong>Wrapper public liquidity:</strong>{" "}
          {wrapperLiquidity == null
            ? "loading..."
            : formatTokenAmount(wrapperLiquidity, { symbol: publicTokenLabel, fallback: "0" })}
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {amountLabel}
          </div>
          <input
            value={amountInput}
            onChange={(event) => onAmountInputChange?.(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-500"
            placeholder={amountPlaceholder}
          />
          <div className="mt-2 text-xs text-slate-500">
            {publicTokenIsWrappedNative
              ? `Wrap native ETH into ${publicTokenLabel} first if needed, then deposit ${publicTokenLabel} into the confidential wrapper 1:1. Redeem performs the reverse direction.`
              : `Public ${publicTokenLabel} converts into private balance 1:1 in the current marketplace MVP, and can be redeemed back to public balance.`}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {publicTokenIsWrappedNative && (
            <Button
              variant="ghost"
              onClick={handleWrapToWeth}
              disabled={!hasDeploymentConfig || actionLoading !== ""}
              isLoading={actionLoading === "wrap-public-token"}
            >
              Wrap Native To {publicTokenLabel}
            </Button>
          )}
          <Button
            onClick={handleMoveToPrivate}
            disabled={!hasDeploymentConfig || actionLoading !== ""}
            isLoading={actionLoading === "fund-private"}
          >
            Deposit {publicTokenLabel} To Private
          </Button>
          <Button
            onClick={handleRedeemToPublic}
            disabled={!hasDeploymentConfig || actionLoading !== ""}
            isLoading={actionLoading === "redeem-public"}
          >
            Redeem Private To {publicTokenLabel}
          </Button>
          <Button
            variant="ghost"
            onClick={handleRefreshPrivateBalance}
            disabled={!hasDeploymentConfig || actionLoading !== ""}
            isLoading={actionLoading === "refresh-private"}
          >
            {privateBalanceLoaded ? "Refresh Private Balance" : "Load Private Balance"}
          </Button>
        </div>
      </div>
    </div>
  );
}
