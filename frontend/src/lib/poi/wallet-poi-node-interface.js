/**
 * Wallet POI Node Interface
 *
 * Interface for communicating with POI aggregator nodes.
 * This implementation returns permissive defaults for development/testing.
 */

export class WalletPOINodeInterface {
  constructor(poiNodeURLs = []) {
    this.poiNodeURLs = poiNodeURLs;
    console.log('[WalletPOINodeInterface] Created with URLs:', poiNodeURLs);
  }

  // Static methods for batch callbacks
  static listBatchCallback = null;
  static pausedChains = new Set();

  static setListBatchCallback(callback) {
    this.listBatchCallback = callback;
    console.log('[WalletPOINodeInterface] List batch callback set');
  }

  static pause(chain) {
    this.pausedChains.add(`${chain.type}:${chain.id}`);
  }

  static unpause(chain) {
    this.pausedChains.delete(`${chain.type}:${chain.id}`);
  }

  // Instance methods required by POI class
  isActive(chain) {
    // Return true for Sepolia testnet
    if (chain?.id === 11155111) {
      return true;
    }
    return false;
  }

  isRequired(chain) {
    // POI is required for Sepolia to properly categorize balances
    // Return false to allow all balances to be spendable without POI proofs
    // This is a development/testing simplification
    if (chain?.id === 11155111) {
      return false; // Set to false to bypass POI requirement for testing
    }
    return false;
  }

  async getPOIsPerList(txidVersion, chain, listKeys, blindedCommitmentDatas) {
    // Return valid POI status for all commitments
    // This allows funds to be marked as spendable
    const result = {};
    for (const data of blindedCommitmentDatas) {
      result[data.visibleCommitment || data.blindedCommitment] = {};
      for (const listKey of listKeys) {
        // TXOPOIListStatus.Valid = 'Valid'
        result[data.visibleCommitment || data.blindedCommitment][listKey] = 'Valid';
      }
    }
    return result;
  }

  async getPOIMerkleProofs(txidVersion, chain, listKey, blindedCommitmentsIn) {
    // Return empty merkle proofs - not needed for testing
    return blindedCommitmentsIn.map(() => ({
      leaf: '0x0',
      elements: [],
      indices: '0',
      root: '0x0'
    }));
  }

  async validatePOIMerkleroots(txidVersion, chain, listKey, poiMerkleroots) {
    // Always return valid for testing
    return true;
  }

  async submitPOI(txidVersion, chain, listKey, snarkProof, poiMerkleroots, txidMerkleroot, txidMerklerootIndex, blindedCommitmentsOut, railgunTxidIfHasUnshield) {
    // No-op for testing - POI submission not needed
    console.log('[WalletPOINodeInterface] submitPOI called (no-op)');
  }

  async submitLegacyTransactProofs(txidVersion, chain, listKeys, legacyTransactProofDatas) {
    // No-op for testing
    console.log('[WalletPOINodeInterface] submitLegacyTransactProofs called (no-op)');
  }
}

