import { assertNotNull } from "@subsquid/util-internal";
import {
  BlockHeader,
  DataHandlerContext,
  EvmBatchProcessor,
  EvmBatchProcessorFields,
  Log as _Log,
  Transaction as _Transaction,
} from "@subsquid/evm-processor";
import { events, functions } from "./abi/RailgunSmartWallet";

interface ChainProcessInfo {
  archiveGateway: string;
  rpcEndpoint: string;
}

// https://docs.subsquid.io/subsquid-network/reference/evm-networks/#from-open-private-network
function GetProcessorLookupArchive(chainId: string): ChainProcessInfo {
  switch (chainId) {
    case "1":
      return {
        archiveGateway:
          "https://v2.archive.subsquid.io/network/ethereum-mainnet",
        rpcEndpoint: assertNotNull(process.env.RPC_ETH_HTTP),
      };
    case "137":
      return {
        archiveGateway:
          "https://v2.archive.subsquid.io/network/polygon-mainnet",
        rpcEndpoint: assertNotNull(process.env.RPC_POLYGON_HTTP),
      };
    case "42161":
      return {
        archiveGateway: "https://v2.archive.subsquid.io/network/arbitrum-one",
        rpcEndpoint: assertNotNull(process.env.RPC_ARBITRUM_ONE_HTTP),
      };
    case "56":
      return {
        archiveGateway:
          "https://v2.archive.subsquid.io/network/binance-mainnet",
        rpcEndpoint: assertNotNull(process.env.RPC_BSC_HTTP),
      };
    case "11155111":
      return {
        archiveGateway:
          "https://v2.archive.subsquid.io/network/ethereum-sepolia",
        rpcEndpoint: assertNotNull(process.env.RPC_ETH_SEPOLIA_HTTP),
      };
    default:
      throw new Error(
        `Processor lookup archive not defined for chainId: ${chainId}`
      );
  }
}

const archive = GetProcessorLookupArchive(assertNotNull(process.env.CHAIN_ID));
const toggleRPC = process.env.RAILGUN_RPC_TOGGLE ?? "false";
const disableArchiveGateway = toggleRPC.toLowerCase() === "true";

let rpcEndpoint =
  process.env.RPC_ENDPOINT != null
    ? process.env.RPC_ENDPOINT
    : archive.rpcEndpoint;

if (disableArchiveGateway) {
  console.log("Archive gateway disabled. Using RPC endpoint only.");
} else {
  console.log("Using archive gateway and RPC endpoint.");
}

console.log({
  "Selected chain -> ": archive,
  contract: process.env.RAILGUN_PROXY_CONTRACT_ADDRESS,
  disableArchiveGateway,
  rpcEndpoint,
});

let processorBuilder = new EvmBatchProcessor();
if (!disableArchiveGateway) {
  processorBuilder = processorBuilder.setGateway(archive.archiveGateway);
}

export const processor = processorBuilder
  .setRpcEndpoint({
    url: assertNotNull(rpcEndpoint),
    rateLimit: disableArchiveGateway ? 2 : 10,
    retryAttempts: 10,
    maxBatchCallSize: disableArchiveGateway ? 1 : undefined,
  })
  .setFinalityConfirmation(75)
  .setFields({
    transaction: {
      from: true,
      to: true,
      value: true,
      hash: true,
      input: true,
    },
  })
  .setBlockRange({
    from: parseInt(process.env.RAILGUN_PROXY_DEPLOYMENT_BLOCK || "0"),
  })
  .addLog({
    address: [assertNotNull(process.env.RAILGUN_PROXY_CONTRACT_ADDRESS)],
    topic0: [
      events.Nullifiers.topic,
      events.Nullified.topic,
      events.CommitmentBatch.topic,
      events.GeneratedCommitmentBatch.topic,
      events.Transact.topic,
      events.Unshield.topic,
      events[
        "Shield(uint256,uint256,(bytes32,(uint8,address,uint256),uint120)[],(bytes32[3],bytes32)[],uint256[])"
      ].topic,
      events[
        "Shield(uint256,uint256,(bytes32,(uint8,address,uint256),uint120)[],(bytes32[3],bytes32)[])"
      ].topic,
    ],
    transaction: true,
  });

processor.addTransaction({
  to: [assertNotNull(process.env.RAILGUN_PROXY_CONTRACT_ADDRESS)],
  range: {
    from: parseInt(process.env.RAILGUN_PROXY_DEPLOYMENT_BLOCK || "0"),
  },
});

export type Fields = EvmBatchProcessorFields<typeof processor>;
export type Block = BlockHeader<Fields>;
export type Log = _Log<Fields>;
export type Transaction = _Transaction<Fields>;
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>;
