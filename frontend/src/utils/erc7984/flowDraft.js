const STORAGE_KEY = "erc7984_flow_draft_v1";

function isObjectLike(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeMaybeString(value) {
  return value == null ? "" : String(value).trim();
}

export function readErc7984FlowDraft() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return isObjectLike(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeErc7984FlowDraft(patch) {
  if (!isObjectLike(patch)) {
    return null;
  }

  const nextValue = {
    ...(readErc7984FlowDraft() || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextValue));
  return nextValue;
}

export function clearErc7984FlowDraft() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function buildErc7984FlowDraftPatch({
  orderId,
  productAddress,
  paymentToken,
  buyerDepositTxHash,
  buyerDepositReference,
  buyerQuantity,
  vcCid,
}) {
  const patch = {};
  const hasNewOrderContext = orderId !== undefined || productAddress !== undefined;

  if (orderId !== undefined) {
    patch.orderId = normalizeMaybeString(orderId);
  }
  if (productAddress !== undefined) {
    patch.productAddress = normalizeMaybeString(productAddress).toLowerCase();
  }
  if (paymentToken !== undefined) {
    patch.paymentToken = normalizeMaybeString(paymentToken).toLowerCase();
  }
  if (hasNewOrderContext && buyerDepositTxHash === undefined) {
    patch.buyerDepositTxHash = "";
  }
  if (buyerDepositTxHash !== undefined) {
    patch.buyerDepositTxHash = normalizeMaybeString(buyerDepositTxHash).toLowerCase();
  }
  if (hasNewOrderContext && buyerDepositReference === undefined) {
    patch.buyerDepositReference = "";
  }
  if (buyerDepositReference !== undefined) {
    patch.buyerDepositReference = normalizeMaybeString(buyerDepositReference);
  }
  if (hasNewOrderContext && buyerQuantity === undefined) {
    patch.buyerQuantity = "";
  }
  if (buyerQuantity !== undefined) {
    patch.buyerQuantity = normalizeMaybeString(buyerQuantity);
  }
  if (hasNewOrderContext && vcCid === undefined) {
    patch.vcCid = "";
  }
  if (vcCid !== undefined) {
    patch.vcCid = normalizeMaybeString(vcCid);
  }

  return patch;
}
