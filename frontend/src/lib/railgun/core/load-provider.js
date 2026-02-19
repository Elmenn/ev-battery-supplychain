/**
 * Load Provider
 * 
 * Handles loading RPC providers for Railgun networks.
 * Converted from TypeScript to JavaScript.
 */

import {
  NETWORK_CONFIG,
  TXIDVersion,
  createFallbackProviderFromJsonConfig,
  isDefined,
} from '@railgun-community/shared-models';
import { sendMessage } from '../../../utils/logger.js';
import { reportAndSanitizeError } from '../../../utils/error.js';
import { WalletPOI } from '../../poi/wallet-poi.js';
import { getEngine } from './engine.js';
import {
  RailgunVersionedSmartContracts,
  createPollingJsonRpcProviderForListeners,
} from '@railgun-community/engine';
import {
  fallbackProviderMap,
  pollingProviderMap,
  setFallbackProviderForNetwork,
  setPollingProviderForNetwork,
} from './providers.js';
import { WalletPOINodeInterface } from '../../poi/wallet-poi-node-interface.js';

const createFallbackProviderForNetwork = async (
  networkName,
  fallbackProviderJsonConfig,
) => {
  const existingProvider = fallbackProviderMap[networkName];
  if (existingProvider) {
    return existingProvider;
  }
  const fallbackProvider = createFallbackProviderFromJsonConfig(
    fallbackProviderJsonConfig,
  );
  setFallbackProviderForNetwork(networkName, fallbackProvider);
  return fallbackProvider;
};

const createPollingProviderForNetwork = async (
  networkName,
  fallbackProvider,
  pollingInterval,
) => {
  const existingProvider = pollingProviderMap[networkName];
  if (existingProvider) {
    return existingProvider;
  }
  const network = NETWORK_CONFIG[networkName];
  if (!isDefined(network)) {
    throw new Error('No network found');
  }
  const pollingProvider = await createPollingJsonRpcProviderForListeners(
    fallbackProvider,
    network.chain.id,
    pollingInterval,
  );
  setPollingProviderForNetwork(networkName, pollingProvider);
  return pollingProvider;
};

const loadProviderForNetwork = async (
  chain,
  networkName,
  fallbackProviderJsonConfig,
  pollingInterval,
) => {
  sendMessage(`Load provider for network: ${networkName}`);

  const fallbackProvider = await createFallbackProviderForNetwork(
    networkName,
    fallbackProviderJsonConfig,
  );
  const pollingProvider = await createPollingProviderForNetwork(
    networkName,
    fallbackProvider,
    pollingInterval
  );

  const network = NETWORK_CONFIG[networkName];
  const {
    proxyContract,
    relayAdaptContract,
    poseidonMerkleAccumulatorV3Contract,
    poseidonMerkleVerifierV3Contract,
    tokenVaultV3Contract,
    deploymentBlockPoseidonMerkleAccumulatorV3,
    deploymentBlock,
    publicName,
    poi,
    supportsV3,
  } = network;
  if (!proxyContract) {
    throw new Error(`Could not find Proxy contract for network: ${publicName}`);
  }
  if (!relayAdaptContract) {
    throw new Error(
      `Could not find Relay Adapt contract for network: ${publicName}`,
    );
  }

  const engine = getEngine();
  if (!engine.isPOINode && isDefined(poi) && !WalletPOI.started) {
    throw new Error(
      'This network requires Proof Of Innocence. Pass "poiNodeURL" to startRailgunEngine to initialize POI before loading this provider.',
    );
  }

  const deploymentBlocks = {
    [TXIDVersion.V2_PoseidonMerkle]: deploymentBlock ?? 0,
    [TXIDVersion.V3_PoseidonMerkle]:
      deploymentBlockPoseidonMerkleAccumulatorV3 ?? 0,
  };

  // This function will set up the contracts for this chain.
  // Throws if provider does not respond.
  await engine.loadNetwork(
    chain,
    proxyContract,
    relayAdaptContract,
    poseidonMerkleAccumulatorV3Contract,
    poseidonMerkleVerifierV3Contract,
    tokenVaultV3Contract,
    fallbackProvider,
    pollingProvider,
    deploymentBlocks,
    poi?.launchBlock,
    supportsV3,
  );
};

/**
 * Note: The first provider listed in your fallback provider config is used as a polling provider
 * for new RAILGUN events (balance updates).
 */
export const loadProvider = async (
  fallbackProviderJsonConfig,
  networkName,
  pollingInterval = 15000,
) => {
  try {
    // Clean up any existing providers before replacing them.
    // This prevents stale polling loops (e.g. old RPC endpoints) from continuing in background.
    await fallbackProviderMap[networkName]?.destroy?.();
    pollingProviderMap[networkName]?.destroy?.();
    delete fallbackProviderMap[networkName];
    delete pollingProviderMap[networkName];

    const { chain, supportsV3 } = NETWORK_CONFIG[networkName];
    if (fallbackProviderJsonConfig.chainId !== chain.id) {
      throw new Error('Invalid chain ID');
    }

    await loadProviderForNetwork(
      chain,
      networkName,
      fallbackProviderJsonConfig,
      pollingInterval,
    );
    WalletPOINodeInterface.unpause(chain);
    const { shield: shieldFeeV2, unshield: unshieldFeeV2 } =
      await RailgunVersionedSmartContracts.fees(
        TXIDVersion.V2_PoseidonMerkle,
        chain,
      );

    if (supportsV3) {
      const { shield: shieldFeeV3, unshield: unshieldFeeV3 } =
        await RailgunVersionedSmartContracts.fees(
          TXIDVersion.V3_PoseidonMerkle,
          chain,
        );

      const feesSerialized = {
        shieldFeeV2: shieldFeeV2.toString(),
        unshieldFeeV2: unshieldFeeV2.toString(),
        shieldFeeV3: shieldFeeV3?.toString(),
        unshieldFeeV3: unshieldFeeV3?.toString(),
      };
      return { feesSerialized };
    }

    // Note: Shield and Unshield fees are in basis points.
    // NFT fee is in wei (though currently 0).
    const feesSerialized = {
      shieldFeeV2: shieldFeeV2.toString(),
      unshieldFeeV2: unshieldFeeV2.toString(),
      shieldFeeV3: undefined,
      unshieldFeeV3: undefined,
    };
    return { feesSerialized };
  } catch (err) {
    throw reportAndSanitizeError(loadProvider.name, err);
  }
};

export const unloadProvider = async (networkName) => {
  WalletPOINodeInterface.pause(NETWORK_CONFIG[networkName].chain);
  await fallbackProviderMap[networkName]?.destroy();
  pollingProviderMap[networkName]?.destroy();
  delete fallbackProviderMap[networkName];
  delete pollingProviderMap[networkName];
};

export const pauseAllPollingProviders = (excludeNetworkName) => {
  Object.keys(pollingProviderMap).forEach(networkName => {
    if (networkName === excludeNetworkName) {
      return;
    }
    const pollingProvider = pollingProviderMap[networkName];
    if (isDefined(pollingProvider) && !pollingProvider.paused) {
      pollingProvider.pause();
    }
  });
};

export const resumeIsolatedPollingProviderForNetwork = (networkName) => {
  pauseAllPollingProviders(networkName);
  const pollingProviderForNetwork = pollingProviderMap[networkName];
  if (
    isDefined(pollingProviderForNetwork) &&
    pollingProviderForNetwork.paused
  ) {
    pollingProviderForNetwork.resume();
  }
};

