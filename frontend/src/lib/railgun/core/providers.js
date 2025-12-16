/**
 * Provider Management
 * 
 * Manages fallback and polling providers for different networks.
 * Converted from TypeScript to JavaScript.
 */

import { NetworkName, isDefined } from '@railgun-community/shared-models';
import { PollingJsonRpcProvider } from '@railgun-community/engine';
import { FallbackProvider } from 'ethers';

export const fallbackProviderMap = {};
export const pollingProviderMap = {};

export const getFallbackProviderForNetwork = (networkName) => {
  const provider = fallbackProviderMap[networkName];
  if (!isDefined(provider)) {
    throw new Error(`Provider not yet loaded for network ${networkName}`);
  }
  return provider;
};

export const getPollingProviderForNetwork = (networkName) => {
  const provider = pollingProviderMap[networkName];
  if (!isDefined(provider)) {
    throw new Error(
      `Polling provider not yet loaded for network ${networkName}`,
    );
  }
  return provider;
};

export const setFallbackProviderForNetwork = (networkName, provider) => {
  fallbackProviderMap[networkName] = provider;
};

export const setPollingProviderForNetwork = (networkName, provider) => {
  pollingProviderMap[networkName] = provider;
};
