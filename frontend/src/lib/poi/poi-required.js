/**
 * POI Required
 * 
 * Checks if POI (Proof of Innocence) is required for a network.
 * Converted from TypeScript to JavaScript.
 */

import { NetworkName, NETWORK_CONFIG, isDefined } from '@railgun-community/shared-models';

export class POIRequired {
  static async isRequiredForNetwork(networkName) {
    const network = NETWORK_CONFIG[networkName];
    if (!isDefined(network)) {
      return false;
    }
    // POI is required if the network has POI configuration
    return isDefined(network.poi);
  }
}

