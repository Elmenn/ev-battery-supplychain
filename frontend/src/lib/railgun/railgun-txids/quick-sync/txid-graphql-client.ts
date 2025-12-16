import { NetworkName, isDefined } from '@railgun-community/shared-models';
import type { MeshInstance } from '@graphql-mesh/runtime';
import { getMesh } from '@graphql-mesh/runtime';
import type { GetMeshOptions } from '@graphql-mesh/runtime';
import { getMeshOptions, getSdk } from '../graphql';

const meshes: MapType<MeshInstance> = {};

const txsSubgraphSourceNameForNetwork = (networkName: NetworkName): string => {
  switch (networkName) {
    case NetworkName.Ethereum:
      return 'txs-ethereum';
    case NetworkName.EthereumSepolia:
      return 'txs-sepolia';
    case NetworkName.BNBChain:
      return 'txs-bsc';
    case NetworkName.Arbitrum:
      return 'txs-arbitrum';
    case NetworkName.Polygon:
      return 'txs-matic';
    case NetworkName.PolygonAmoy:
    case NetworkName.PolygonMumbai_DEPRECATED:
    case NetworkName.ArbitrumGoerli_DEPRECATED:
    case NetworkName.EthereumGoerli_DEPRECATED:
    case NetworkName.EthereumRopsten_DEPRECATED:
    case NetworkName.Hardhat:
    default:
      throw new Error('No railgun-transaction subsquid for this network');
  }
};

const buildMeshOptionsForNetwork = async (
  networkName: NetworkName,
): Promise<GetMeshOptions> => {
  const sourceName = txsSubgraphSourceNameForNetwork(networkName);
  const meshOptions = await getMeshOptions();
  const filteredSources = meshOptions.sources.filter(source => source.name === sourceName);
  if (filteredSources.length !== 1) {
    throw new Error(
      `Expected exactly one source for network ${networkName}, found ${filteredSources.length}`,
    );
  }

  meshOptions.sources = [filteredSources[0]];
  return meshOptions;
};

export const getTxidGraphMesh = async (
  networkName: NetworkName,
): Promise<MeshInstance> => {
  const cachedMesh = meshes[networkName];
  if (isDefined(cachedMesh)) {
    return cachedMesh;
  }

  const meshOptions = await buildMeshOptionsForNetwork(networkName);
  const mesh = await getMesh(meshOptions);

  meshes[networkName] = mesh;
  const subscriptionId = mesh.pubsub.subscribe('destroy', () => {
    meshes[networkName] = undefined;
    mesh.pubsub.unsubscribe(subscriptionId);
  });

  return mesh;
};

export const getTxidGraphSDK = <TGlobalContext, TOperationContext>(
  networkName: NetworkName,
  globalContext?: TGlobalContext,
) => {
  const sdkRequester$ = getTxidGraphMesh(networkName).then(({ sdkRequesterFactory }) =>
    sdkRequesterFactory(globalContext),
  );

  return getSdk<TOperationContext, TGlobalContext>((...args) =>
    sdkRequester$.then(sdkRequester => sdkRequester(...args)),
  );
};


