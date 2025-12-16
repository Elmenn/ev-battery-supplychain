import { AccumulatedEvents, Chain } from '@railgun-community/engine';
import {
  NetworkName,
  delay,
  isDefined,
  networkForChain,
  removeUndefineds,
} from '@railgun-community/shared-models';
import { getMeshOptions, getSdk } from './graphql';
import { MeshInstance, getMesh } from '@graphql-mesh/runtime';
import {
  GraphCommitmentV2,
  GraphCommitmentBatchV2,
  formatGraphCommitmentEventsV2,
  formatGraphNullifierEventsV2,
  formatGraphUnshieldEventsV2,
} from './graph-type-formatters-v2';
import { EMPTY_EVENTS, autoPaginatingQuery } from '../graph-query';

// Type alias for map/dictionary types (allows undefined values)
type MapType<T> = Record<string, T | undefined>;

// Helper function to remove duplicates by ID
function removeDuplicatesByID<T extends { id: string | number }>(items: T[]): T[] {
  const seen = new Set<string | number>();
  return items.filter(item => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

const meshes: MapType<MeshInstance> = {};

// Export meshes cache so it can be cleared externally
export { meshes };

// Expose meshes on window.RGV2 for easy access (avoids dynamic import issues)
if (typeof window !== 'undefined') {
  (window as any).RGV2 = (window as any).RGV2 || {};
  (window as any).RGV2._meshes = meshes;
  console.log('[GraphQL Mesh] Exposed meshes cache on window.RGV2._meshes');
}

// 1.5 full trees of commitments
// TODO: This will have to change when we have more than 100k commitments.
const MAX_QUERY_RESULTS = 100000;

const sourceNameForNetwork = (networkName: NetworkName): string => {
  switch (networkName) {
    case NetworkName.Ethereum:
      return 'ethereum';
    case NetworkName.EthereumSepolia:
      return 'sepolia';
    case NetworkName.BNBChain:
      return 'bsc';
    case NetworkName.Polygon:
      return 'matic';
    case NetworkName.Arbitrum:
      return 'arbitrum-one';
    case NetworkName.PolygonAmoy:
    case NetworkName.ArbitrumGoerli_DEPRECATED:
    case NetworkName.EthereumGoerli_DEPRECATED:
    case NetworkName.EthereumRopsten_DEPRECATED:
    case NetworkName.PolygonMumbai_DEPRECATED:
    case NetworkName.Hardhat:
    default:
      throw new Error('No Graph API hosted service for this network');
  }
};

const isSupportedByNetwork = (networkName: NetworkName) => {
  try {
    sourceNameForNetwork(networkName);
    return true;
  } catch {
    return false;
  }
};

export const quickSyncEventsGraphV2 = async (
  chain: Chain,
  startingBlock: number,
): Promise<AccumulatedEvents> => {
  const network = networkForChain(chain);
  if (!network || !isSupportedByNetwork(network.name)) {
    // Return empty logs, Engine will default to full scan.
    return EMPTY_EVENTS;
  }

  // Check if UTXO_SCAN_START_BLOCK environment variable is set
  const envStartBlock = process.env.UTXO_SCAN_START_BLOCK ? parseInt(process.env.UTXO_SCAN_START_BLOCK, 10) : null;
  if (envStartBlock && envStartBlock !== startingBlock) {
    console.log(`[QUICKSYNC-UTXO] ⚠️  Starting block mismatch!`);
    console.log(`[QUICKSYNC-UTXO]    SDK provided: ${startingBlock}`);
    console.log(`[QUICKSYNC-UTXO]    Environment (UTXO_SCAN_START_BLOCK): ${envStartBlock}`);
    console.log(`[QUICKSYNC-UTXO]    Using environment override: ${envStartBlock}`);
    startingBlock = envStartBlock;
  }

  console.log(`[QUICKSYNC-UTXO] Starting UTXO quick-sync for ${network.name}, startingBlock: ${startingBlock}`);

  const sdk = getBuiltGraphSDK(network.name);

  const nullifiers = await autoPaginatingQuery(
    async (blockNumber: string) =>
      (
        await sdk.Nullifiers({
          blockNumber,
        })
      ).nullifiers,
    startingBlock.toString(),
    MAX_QUERY_RESULTS,
  );
  await delay(100);
  const unshields = await autoPaginatingQuery(
    async (blockNumber: string) =>
      (
        await sdk.Unshields({
          blockNumber,
        })
      ).unshields,
    startingBlock.toString(),
    MAX_QUERY_RESULTS,
  );
  await delay(100);
  const commitments = await autoPaginatingQuery(
    async (blockNumber: string) =>
      (
        await sdk.Commitments({
          blockNumber,
        })
      ).commitments,
    startingBlock.toString(),
    MAX_QUERY_RESULTS,
  );

  const filteredNullifiers = removeDuplicatesByID(nullifiers);
  const filteredUnshields = removeDuplicatesByID(unshields);
  const filteredCommitments = removeDuplicatesByID(commitments);
  
  console.log(`[QUICKSYNC-UTXO] Raw commitments fetched: ${commitments.length}`);
  console.log(`[QUICKSYNC-UTXO] After duplicate removal: ${filteredCommitments.length}`);
  
  const graphCommitmentBatches =
    createGraphCommitmentBatches(filteredCommitments);

  graphCommitmentBatches.sort(sortByTreeNumberAndStartPosition);
  
  // Diagnostic: Check treeNumber distribution
  const byTree = new Map<number, number>();
  for (const batch of graphCommitmentBatches) {
    const count = batch.commitments.length;
    byTree.set(batch.treeNumber, (byTree.get(batch.treeNumber) || 0) + count);
  }
  console.log(`[QUICKSYNC-UTXO] Commitments per treeNumber:`, Object.fromEntries(byTree));
  console.log(`[QUICKSYNC-UTXO] Total batches: ${graphCommitmentBatches.length}`);

  const nullifierEvents = formatGraphNullifierEventsV2(filteredNullifiers);
  const unshieldEvents = formatGraphUnshieldEventsV2(filteredUnshields);
  const commitmentEvents = formatGraphCommitmentEventsV2(
    graphCommitmentBatches,
  );
  
  const totalCommitmentsInEvents = commitmentEvents.reduce((sum, ev) => sum + (ev.commitments?.length || 0), 0);
  console.log(`[QUICKSYNC-UTXO] Commitment events created: ${commitmentEvents.length}`);
  console.log(`[QUICKSYNC-UTXO] Total commitments in events: ${totalCommitmentsInEvents}`);
  console.log(`[QUICKSYNC-UTXO] ✅ Events ready for SDK to apply (${commitmentEvents.length} events, ${totalCommitmentsInEvents} commitments)`);

  return { nullifierEvents, unshieldEvents, commitmentEvents };
};

const createGraphCommitmentBatches = (
  flattenedCommitments: GraphCommitmentV2[],
): GraphCommitmentBatchV2[] => {
  const graphCommitmentMap: MapType<GraphCommitmentBatchV2> = {};
  for (const commitment of flattenedCommitments) {
    const startPosition = commitment.batchStartTreePosition;
    const existingBatch = graphCommitmentMap[startPosition];
    if (isDefined(existingBatch)) {
      existingBatch.commitments.push(commitment);
    } else {
      graphCommitmentMap[commitment.batchStartTreePosition] = {
        commitments: [commitment],
        transactionHash: commitment.transactionHash,
        treeNumber: commitment.treeNumber,
        startPosition: commitment.batchStartTreePosition, // ✅ Map batchStartTreePosition to startPosition
        blockNumber: Number(commitment.blockNumber),
      };
    }
  }
  return removeUndefineds(Object.values(graphCommitmentMap));
};

const sortByTreeNumberAndStartPosition = (
  a: GraphCommitmentBatchV2,
  b: GraphCommitmentBatchV2,
) => {
  if (a.treeNumber < b.treeNumber) {
    return -1;
  }
  if (a.treeNumber > b.treeNumber) {
    return 1;
  }
  if (a.startPosition < b.startPosition) {
    return -1;
  }
  if (a.startPosition > b.startPosition) {
    return 1;
  }
  return 0;
};

const getBuiltGraphClient = async (
  networkName: NetworkName,
): Promise<MeshInstance> => {
  console.log('[GraphQL Mesh] getBuiltGraphClient called for network:', networkName);
  
  // For Sepolia, ALWAYS check if override is set and clear cache if needed
  // This ensures we use the correct endpoint even if mesh was cached
  if (networkName === NetworkName.EthereumSepolia) {
    // Note: process.env.REACT_APP_* is replaced by webpack at build time
    // Access directly without optional chaining on process.env
    const overrideURL = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_RAILGUN_SEPOLIA_V2_SUBGRAPH_URL) ||
                        (typeof window !== 'undefined' && (window as any).__OVERRIDE_SEPOLIA_V2_SUBGRAPH__);
    console.log('[GraphQL Mesh] Sepolia override check:', { overrideURL, hasWindow: typeof window !== 'undefined', windowValue: typeof window !== 'undefined' ? (window as any).__OVERRIDE_SEPOLIA_V2_SUBGRAPH__ : 'N/A' });
    
    if (overrideURL) {
      // Always clear cached mesh if override is set, to force recreation with new endpoint
      const existingMesh = meshes[networkName];
      console.log('[GraphQL Mesh] Existing mesh check:', { hasMesh: !!existingMesh, meshCount: Object.keys(meshes).length });
      
      if (existingMesh) {
        console.log('[GraphQL Mesh] Clearing cached Sepolia mesh to use override endpoint:', overrideURL);
        if (typeof existingMesh.destroy === 'function') {
          existingMesh.destroy();
        }
        delete meshes[networkName];
        console.log('[GraphQL Mesh] Mesh cleared, mesh count now:', Object.keys(meshes).length);
      } else {
        console.log('[GraphQL Mesh] No cached mesh found, will create new one with override:', overrideURL);
      }
    } else {
      console.log('[GraphQL Mesh] No override URL found, using default endpoint');
    }
  }
  
  const meshForNetwork = meshes[networkName];
  if (isDefined(meshForNetwork)) {
    console.log('[GraphQL Mesh] Returning cached mesh for:', networkName);
    return meshForNetwork;
  }
  
  console.log('[GraphQL Mesh] Creating new mesh for:', networkName);
  const sourceName = sourceNameForNetwork(networkName);
  console.log('[GraphQL Mesh] Source name:', sourceName);
  const meshOptions = await getMeshOptions();
  console.log('[GraphQL Mesh] getMeshOptions() returned, sources count:', meshOptions.sources?.length);
  
  // For Sepolia, patch the handler endpoint to use override if available
  if (networkName === NetworkName.EthereumSepolia && sourceName === 'sepolia') {
    const overrideURL = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_RAILGUN_SEPOLIA_V2_SUBGRAPH_URL) ||
                        (typeof window !== 'undefined' && (window as any).__OVERRIDE_SEPOLIA_V2_SUBGRAPH__);
    if (overrideURL) {
      console.log('[GraphQL Mesh] Patching sepolia handler endpoint to:', overrideURL);
      const sepoliaSource = meshOptions.sources.find(s => s.name === 'sepolia');
      if (sepoliaSource && sepoliaSource.handler && (sepoliaSource.handler as any).config) {
        const handlerConfig = (sepoliaSource.handler as any).config;
        handlerConfig.endpoint = overrideURL;
        
        // Also add customFetch to intercept at handler level
        if (typeof window !== 'undefined' && window.fetch) {
          const originalFetch = window.fetch;
          handlerConfig.customFetch = async (url: string, init?: any) => {
            const urlString = url?.toString() || '';
            if (urlString.includes('rail-squid.squids.live/squid-railgun-eth-sepolia-v2')) {
              console.log('[GraphQL Mesh] Handler customFetch intercepting:', urlString, '→', overrideURL);
              return originalFetch(overrideURL, init);
            }
            return originalFetch(url, init);
          };
        }
        
        console.log('[GraphQL Mesh] ✅ Handler endpoint and customFetch patched successfully');
        console.log('[GraphQL Mesh] 📊 Handler config endpoint:', handlerConfig.endpoint);
      } else {
        console.warn('[GraphQL Mesh] ⚠️ Could not patch handler config, sepolia source not found or handler missing');
      }
    }
  }
  
  const filteredSources = meshOptions.sources.filter(source => {
    return source.name === sourceName;
  });
  if (filteredSources.length !== 1) {
    throw new Error(
      `Expected exactly one source for network ${networkName}, found ${filteredSources.length}`,
    );
  }
  meshOptions.sources = [filteredSources[0]];
  const mesh = await getMesh(meshOptions);
  
  // After mesh creation, aggressively patch the handler's HTTP client if needed
  if (networkName === NetworkName.EthereumSepolia && sourceName === 'sepolia') {
    const overrideURL = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_RAILGUN_SEPOLIA_V2_SUBGRAPH_URL) ||
                        (typeof window !== 'undefined' && (window as any).__OVERRIDE_SEPOLIA_V2_SUBGRAPH__);
    if (overrideURL) {
      console.log('[GraphQL Mesh] Aggressively patching handler after mesh creation...');
      const sources = meshOptions.sources;
      if (sources && sources.length > 0 && sources[0].handler) {
        const handler = sources[0].handler as any;
        
        // Patch config
        if (handler.config) {
          console.log('[GraphQL Mesh] Handler config endpoint before:', handler.config.endpoint);
          handler.config.endpoint = overrideURL;
          console.log('[GraphQL Mesh] Handler config endpoint after:', handler.config.endpoint);
          
          // CRITICAL: Set customFetch to use window.fetch (bypasses @whatwg-node/fetch)
          if (typeof window !== 'undefined' && window.fetch) {
            handler.config.customFetch = async (url: string | URL, init?: any) => {
              const urlString = url?.toString() || '';
              console.log('[GraphQL Handler] customFetch (patched) called:', urlString);
              // Always use window.fetch to ensure our override works
              return window.fetch(url, init);
            };
            console.log('[GraphQL Mesh] ✅ Set handler.config.customFetch to use window.fetch');
          }
        }
        
        // Patch handler's internal fetch if it exists - CRITICAL: Use window.fetch to ensure our override works
        if (handler.fetch && typeof handler.fetch === 'function') {
          const originalFetch = handler.fetch.bind(handler);
          handler.fetch = async (url: string | URL, init?: any) => {
            const urlString = url?.toString() || '';
            if (urlString.includes('rail-squid.squids.live/squid-railgun-eth-sepolia-v2')) {
              console.log('[GraphQL Handler] Handler.fetch intercepting:', urlString, '→', overrideURL);
              // Use window.fetch directly to ensure our override is used
              return typeof window !== 'undefined' && window.fetch ? window.fetch(overrideURL, init) : originalFetch(overrideURL, init);
            }
            // Use window.fetch for all requests to ensure our override works
            return typeof window !== 'undefined' && window.fetch ? window.fetch(url, init) : originalFetch(url, init);
          };
          console.log('[GraphQL Mesh] ✅ Patched handler.fetch to use window.fetch');
        }
        
        // Patch handler's HTTP client if it exists - CRITICAL: Use window.fetch to ensure our override works
        if (handler.httpClient) {
          const httpClient = handler.httpClient;
          if (httpClient.fetch && typeof httpClient.fetch === 'function') {
            const originalClientFetch = httpClient.fetch.bind(httpClient);
            httpClient.fetch = async (url: string | URL, init?: any) => {
              const urlString = url?.toString() || '';
              if (urlString.includes('rail-squid.squids.live/squid-railgun-eth-sepolia-v2')) {
                console.log('[GraphQL Handler] httpClient.fetch intercepting:', urlString, '→', overrideURL);
                // Use window.fetch directly to ensure our override is used
                return typeof window !== 'undefined' && window.fetch ? window.fetch(overrideURL, init) : originalClientFetch(overrideURL, init);
              }
              // Use window.fetch for all requests to ensure our override works
              return typeof window !== 'undefined' && window.fetch ? window.fetch(url, init) : originalClientFetch(url, init);
            };
            console.log('[GraphQL Mesh] ✅ Patched handler.httpClient.fetch to use window.fetch');
          }
        }
        
        // Also try to patch the handler's request method
        if (handler.request && typeof handler.request === 'function') {
          const originalRequest = handler.request.bind(handler);
          handler.request = async (...args: any[]) => {
            // Try to intercept URL in request args
            const patchedArgs = args.map((arg: any) => {
              if (typeof arg === 'string' && arg.includes('rail-squid.squids.live/squid-railgun-eth-sepolia-v2')) {
                console.log('[GraphQL Handler] handler.request intercepting URL:', arg, '→', overrideURL);
                return overrideURL;
              }
              if (arg && typeof arg === 'object' && arg.url && arg.url.includes('rail-squid.squids.live/squid-railgun-eth-sepolia-v2')) {
                console.log('[GraphQL Handler] handler.request intercepting arg.url:', arg.url, '→', overrideURL);
                return { ...arg, url: overrideURL };
              }
              return arg;
            });
            return originalRequest(...patchedArgs);
          };
          console.log('[GraphQL Mesh] ✅ Patched handler.request');
        }
      }
    }
  }
  
  meshes[networkName] = mesh;
  const id = mesh.pubsub.subscribe('destroy', () => {
    meshes[networkName] = undefined;
    mesh.pubsub.unsubscribe(id);
  });
  return mesh;
};

const getBuiltGraphSDK = <TGlobalContext, TOperationContext>(
  networkName: NetworkName,
  globalContext?: TGlobalContext,
) => {
  const sdkRequester$ = getBuiltGraphClient(networkName).then(
    ({ sdkRequesterFactory }) => sdkRequesterFactory(globalContext),
  );
  return getSdk<TOperationContext, TGlobalContext>((...args) =>
    sdkRequester$.then(sdkRequester => sdkRequester(...args)),
  );
};
