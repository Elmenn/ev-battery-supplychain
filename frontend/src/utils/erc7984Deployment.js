const DEFAULT_CHAIN_ID = 11155111;
const SEPOLIA_WETH_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";

function parseBooleanEnv(value, fallback = false) {
  if (value == null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function getDefaultErc7984DeploymentConfig() {
  const chainId = Number(process.env.REACT_APP_CHAIN_ID || DEFAULT_CHAIN_ID);
  const publicToken =
    process.env.REACT_APP_ERC7984_PUBLIC_TOKEN ||
    (chainId === DEFAULT_CHAIN_ID ? SEPOLIA_WETH_ADDRESS : "");
  const publicTokenSymbol =
    process.env.REACT_APP_ERC7984_PUBLIC_TOKEN_SYMBOL ||
    (publicToken.toLowerCase() === SEPOLIA_WETH_ADDRESS.toLowerCase() ? "WETH" : "ERC20");
  const publicTokenIsWrappedNative = parseBooleanEnv(
    process.env.REACT_APP_ERC7984_PUBLIC_TOKEN_IS_WRAPPED_NATIVE,
    publicToken.toLowerCase() === SEPOLIA_WETH_ADDRESS.toLowerCase()
  );

  return {
    chainId,
    deploymentVersion: "legacy-public-only",
    factory:
      process.env.REACT_APP_ERC7984_FACTORY_ADDRESS ||
      process.env.REACT_APP_FACTORY_ADDRESS ||
      "",
    publicToken,
    publicTokenSymbol,
    publicTokenIsWrappedNative,
    fundingWrapper: process.env.REACT_APP_ERC7984_FUNDING_WRAPPER || "",
    implementation: process.env.REACT_APP_ERC7984_IMPLEMENTATION || "",
    privateImplementation: process.env.REACT_APP_ERC7984_PRIVATE_IMPLEMENTATION || "",
    confidentialToken:
      process.env.REACT_APP_ERC7984_CONFIDENTIAL_TOKEN ||
      process.env.REACT_APP_ERC7984_PAYMENT_TOKEN ||
      "",
    supportedPriceProfiles: ["public"],
    supportsPrivatePrice: false,
  };
}

export async function loadErc7984DeploymentConfig() {
  const fallback = getDefaultErc7984DeploymentConfig();

  try {
    const response = await fetch("/erc7984-sepolia-latest.json", {
      cache: "no-store",
    });

    if (!response.ok) {
      return fallback;
    }

    const payload = await response.json();
    const privateImplementation =
      payload?.privateImplementation || fallback.privateImplementation || "";
    const supportedPriceProfiles = Array.isArray(payload?.supportedPriceProfiles)
      ? payload.supportedPriceProfiles
      : privateImplementation
      ? ["public", "private"]
      : fallback.supportedPriceProfiles;
    return {
      ...fallback,
      ...payload,
      chainId: Number(payload?.chainId || fallback.chainId || DEFAULT_CHAIN_ID),
      deploymentVersion:
        payload?.deploymentVersion || fallback.deploymentVersion || "legacy-public-only",
      factory: payload?.factory || fallback.factory || "",
      publicToken: payload?.publicToken || fallback.publicToken || "",
      publicTokenSymbol: payload?.publicTokenSymbol || fallback.publicTokenSymbol || "ERC20",
      publicTokenIsWrappedNative:
        typeof payload?.publicTokenIsWrappedNative === "boolean"
          ? payload.publicTokenIsWrappedNative
          : fallback.publicTokenIsWrappedNative,
      fundingWrapper: payload?.fundingWrapper || fallback.fundingWrapper || "",
      implementation: payload?.implementation || fallback.implementation || "",
      privateImplementation,
      confidentialToken:
        payload?.confidentialToken || fallback.confidentialToken || "",
      supportedPriceProfiles,
      supportsPrivatePrice:
        typeof payload?.supportsPrivatePrice === "boolean"
          ? payload.supportsPrivatePrice
          : supportedPriceProfiles.includes("private"),
    };
  } catch {
    return fallback;
  }
}
