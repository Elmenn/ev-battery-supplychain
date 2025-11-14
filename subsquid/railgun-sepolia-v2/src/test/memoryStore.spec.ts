import { expect } from "chai";
import { MemoryStore } from "../pipeline/memory-store";
import { Token, VerificationHash, Nullifier, TokenType } from "../model";

describe("MemoryStore", () => {
  it("tracks dirty entities and extracts batches", async () => {
    const store = new MemoryStore();

    const token = new Token({
      id: "1",
      tokenType: TokenType.ERC20,
      tokenAddress: new Uint8Array(20),
      tokenSubID: "0",
    });

    const nullifier = new Nullifier({
      id: "nullifier",
      blockNumber: 1n,
      blockTimestamp: 1n,
      transactionHash: new Uint8Array(32),
      treeNumber: 0,
      nullifier: new Uint8Array(32),
    });

    await store.upsert(token);
    await store.upsert(nullifier);

    const batch = store.extractPersistableBatch();
    expect(batch.tokens).to.have.length(1);
    expect(batch.nullifiers).to.have.length(1);
  });

  it("supports seeding existing records", async () => {
    const verification = new VerificationHash({
      id: "0x",
      verificationHash: new Uint8Array(0),
    });

    const store = new MemoryStore({ verificationHashes: [verification] });
    const loaded = await store.findOneBy(VerificationHash, { id: "0x" });
    expect(loaded?.id).to.equal("0x");
  });
});

