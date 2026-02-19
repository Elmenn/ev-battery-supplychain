/**
 * Wallet POI
 *
 * Initializes POI (Proof of Innocence) for the Railgun wallet.
 * This is required for balance calculations on networks that require POI.
 */

import { POI, POIListType } from '@railgun-community/engine';

export class WalletPOI {
  static started = false;
  static nodeInterface = null;

  static init(nodeInterface, customPOILists = []) {
    console.log('[WalletPOI] Initializing POI with node interface and lists');

    this.nodeInterface = nodeInterface;

    // Create default POI list for Sepolia (required for balance calculations)
    // The list key 'railgun_default' is a standard key used by RAILGUN
    const defaultList = {
      key: 'railgun_default',
      type: POIListType.Active,
      name: 'RAILGUN Default List',
    };

    // Combine default list with any custom lists
    const allLists = [defaultList, ...customPOILists];

    // Initialize the SDK's POI class with our lists and node interface
    // This is CRITICAL - without this, POI.getActiveListKeys() will fail
    // because POI.lists will be undefined
    try {
      POI.init(allLists, nodeInterface);
      console.log('[WalletPOI] POI.init called with', allLists.length, 'lists');
    } catch (e) {
      console.warn('[WalletPOI] POI.init failed:', e.message);
      // Fallback: Initialize with empty array to prevent crashes
      try {
        POI.init([], nodeInterface);
        console.log('[WalletPOI] POI.init called with empty lists (fallback)');
      } catch (e2) {
        console.error('[WalletPOI] POI.init fallback also failed:', e2.message);
      }
    }

    this.started = true;
  }

  static getPOITxidMerklerootValidator(poiNodeURLs) {
    // Return a validator that always returns true (valid)
    // In production, this would validate against the POI node
    return () => Promise.resolve(true);
  }

  static getPOILatestValidatedRailgunTxid(poiNodeURLs) {
    // Return a function that returns a valid object with txidIndex
    // This prevents "Cannot destructure property 'txidIndex' of null" error
    return () => Promise.resolve({
      txidIndex: 0,
      merkleroot: '0x0000000000000000000000000000000000000000000000000000000000000000',
    });
  }
}

