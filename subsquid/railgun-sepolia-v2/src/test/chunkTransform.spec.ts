import { expect } from "chai";
import { convertChunkToBlocks } from "../pipeline/chunk-transform";
import { ChunkResult } from "../fetcher/types";

const SAMPLE_CHUNK: ChunkResult = {
  range: { fromBlock: 100, toBlock: 110 },
  logs: [
    {
      address: "0x123",
      topics: ["topic-a"],
      data: "0x",
      transactionHash: "0xaaa",
      transactionIndex: "0x2",
      blockNumber: "0x64",
      blockHash: "0xblock1",
      logIndex: "0x1",
    },
    {
      address: "0x123",
      topics: ["topic-b"],
      data: "0x",
      transactionHash: "0xbbb",
      transactionIndex: "0x1",
      blockNumber: "0x64",
      blockHash: "0xblock1",
      logIndex: "0x0",
    },
  ],
  blocks: new Map([
    [
      100,
      {
        number: "0x64",
        hash: "0xblock1",
        parentHash: "0xparent",
        timestamp: "0x5",
      },
    ],
  ]),
  transactions: new Map([
    [
      "0xaaa",
      {
        blockHash: "0xblock1",
        blockNumber: "0x64",
        from: "0x01",
        gas: "0x0",
        gasPrice: "0x0",
        hash: "0xaaa",
        input: "0xdeadbeef",
        nonce: "0x0",
        to: "0x123",
        transactionIndex: "0x2",
        value: "0x0",
      },
    ],
    [
      "0xbbb",
      {
        blockHash: "0xblock1",
        blockNumber: "0x64",
        from: "0x02",
        gas: "0x0",
        gasPrice: "0x0",
        hash: "0xbbb",
        input: "0xfeedface",
        nonce: "0x0",
        to: "0x123",
        transactionIndex: "0x1",
        value: "0x0",
      },
    ],
  ]),
};

describe("convertChunkToBlocks", () => {
  it("groups logs and transactions per block with sorted ordering", () => {
    const blocks = convertChunkToBlocks(SAMPLE_CHUNK);
    expect(blocks).to.have.length(1);

    const [block] = blocks;
    expect(block.header.height).to.equal(100);
    expect(block.header.timestamp).to.equal(5000); // seconds -> milliseconds

    expect(block.logs.map((log) => log.logIndex)).to.deep.equal([0, 1]);
    expect(block.transactions.map((tx) => tx.transactionIndex)).to.deep.equal([1, 2]);
    expect(block.transactions.every((tx) => tx.blockTimestamp === block.header.timestamp)).to.be
      .true;
  });
});



