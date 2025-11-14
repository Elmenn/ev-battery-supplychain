import { MemoryStore } from "./memory-store";

export interface ProcessingBlockHeader {
  height: number;
  timestamp: number;
}

export interface ProcessingBlock {
  header: ProcessingBlockHeader;
}

export interface ProcessingContext {
  store: MemoryStore;
  blocks: ProcessingBlock[];
  _chain: {
    client: {
      call<T = unknown>(method: string, params?: unknown[]): Promise<T>;
    };
  };
}

