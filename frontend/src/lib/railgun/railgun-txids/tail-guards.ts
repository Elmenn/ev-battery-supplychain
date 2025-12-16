// tail-guards.ts
// Validation utilities for TXID transaction tail injection

export type TxV2 = {
  version: 'V2';
  txid: string;
  blockNumber: number;
  timestamp: number;
  commitments: string[]; // bytes32[]
  nullifiers: string[];  // bytes32[]
  utxoTreeIn: number;
  utxoTreeOut: number;
  utxoBatchStartPositionOut: number;
};

export type Anchor = {
  blockNumber: number;
  utxoBatchStartPositionOut: number;
  commitmentsCount: number;
};

export function assertTailSorted(tail: TxV2[]) {
  for (let i = 1; i < tail.length; i++) {
    const a = tail[i - 1];
    const b = tail[i];
    if (a.blockNumber > b.blockNumber) {
      throw new Error(`Tail not sorted by blockNumber at i=${i}: ${a.blockNumber} > ${b.blockNumber}`);
    }
  }
}

export function assertBoundary(anchor: Anchor, first: TxV2) {
  const expected = anchor.utxoBatchStartPositionOut + anchor.commitmentsCount;
  if (first.utxoBatchStartPositionOut !== expected) {
    throw new Error(
      `Boundary mismatch: expected startPosition=${expected}, got=${first.utxoBatchStartPositionOut} (anchor block=${anchor.blockNumber})`
    );
  }
}

export function assertContinuousPositions(tail: TxV2[]) {
  if (tail.length === 0) return;
  let pos = tail[0].utxoBatchStartPositionOut;
  for (let i = 0; i < tail.length; i++) {
    const t = tail[i];
    if (t.utxoBatchStartPositionOut !== pos) {
      throw new Error(
        `Non-contiguous utxoBatchStartPositionOut at index ${i}: expected=${pos}, got=${t.utxoBatchStartPositionOut}`
      );
    }
    pos += t.commitments.length;
  }
}

export function assertNoDuplicates(tail: TxV2[]) {
  const set = new Set<string>();
  for (const t of tail) {
    if (set.has(t.txid)) throw new Error(`Duplicate txid detected: ${t.txid}`);
    set.add(t.txid);
  }
}

