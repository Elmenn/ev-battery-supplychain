export type BlockRange = {
  fromBlock: number;
  toBlock: number;
};

export type RawLog = {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  transactionIndex: string;
  blockNumber: string;
  blockHash: string;
  logIndex: string;
  removed?: boolean;
};

export type RawTransaction = {
  blockHash: string;
  blockNumber: string;
  from: string;
  gas: string;
  gasPrice: string;
  hash: string;
  input: string;
  nonce: string;
  to: string | null;
  transactionIndex: string;
  value: string;
};

export type RawBlock = {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: string;
};

export type ChunkResult = {
  range: BlockRange;
  logs: RawLog[];
  blocks: Map<number, RawBlock>;
  transactions: Map<string, RawTransaction>;
};



