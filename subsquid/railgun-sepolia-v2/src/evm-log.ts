export interface EvmProcessorLog {
    id: string;
    transactionIndex: number;
    logIndex: number;
    address: string;
    data: string;
    topics: string[];
    block: {
        id: string;
        hash: string;
        height: number;
        parentHash: string;
        timestamp: number;
    },
    transaction: {
        hash: string
    }
}