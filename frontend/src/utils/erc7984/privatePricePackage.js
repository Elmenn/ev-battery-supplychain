function normalizeAddress(address) {
  return address ? String(address).trim().toLowerCase() : "";
}

export function getLocalPrivatePricePackage(productAddress) {
  const normalizedAddress = normalizeAddress(productAddress);
  if (!normalizedAddress || typeof localStorage === "undefined") {
    return null;
  }

  const privatePriceWei = localStorage.getItem(`privatePriceWei_${normalizedAddress}`) || "";
  const priceCommitment = localStorage.getItem(`priceCommitment_${normalizedAddress}`) || "";
  const storedBlinding = localStorage.getItem(`priceCommitmentBlinding_${normalizedAddress}`) || "";
  const priceBlinding =
    storedBlinding && !String(storedBlinding).startsWith("0x")
      ? `0x${storedBlinding}`
      : String(storedBlinding || "");

  if (!privatePriceWei || !priceCommitment || !priceBlinding) {
    return null;
  }

  return {
    version: "1.0",
    priceVisibility: "private",
    proofFamily: "bulletproof",
    productAddress: normalizedAddress,
    priceCommitment: String(priceCommitment).trim(),
    privatePriceWei: String(privatePriceWei).trim(),
    priceBlinding: String(priceBlinding).trim(),
  };
}

export function serializePrivatePricePackage(productAddress) {
  const payload = getLocalPrivatePricePackage(productAddress);
  return payload ? JSON.stringify(payload, null, 2) : "";
}
