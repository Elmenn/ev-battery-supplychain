import { Chain } from '@railgun-community/engine';
import { POINodeRequest } from './poi-node-request';
import { TXIDVersion, isDefined } from '@railgun-community/shared-models';

export class WalletPOIRequester {
  private poiNodeRequest: Optional<POINodeRequest>;

  constructor(poiNodeURLs?: string[]) {
    this.poiNodeRequest = isDefined(poiNodeURLs)
      ? new POINodeRequest(poiNodeURLs)
      : undefined;
  }

  async validateRailgunTxidMerkleroot(
    txidVersion: TXIDVersion,
    chain: Chain,
    tree: number,
    index: number,
    merkleroot: string,
  ): Promise<boolean> {
    if (!this.poiNodeRequest) {
      return false;
    }
    return this.poiNodeRequest.validateRailgunTxidMerkleroot(
      txidVersion,
      chain,
      tree,
      index,
      merkleroot,
    );
  }

  async getLatestValidatedRailgunTxid(
    txidVersion: TXIDVersion,
    chain: Chain,
  ): Promise<{ txidIndex: Optional<number>; merkleroot: Optional<string> }> {
    if (!this.poiNodeRequest) {
      console.log('[POI-REQUESTER] No POI node configured, returning undefined');
      return { txidIndex: undefined, merkleroot: undefined };
    }
    try {
      const txidStatus = await this.poiNodeRequest.getLatestValidatedRailgunTxid(
        txidVersion,
        chain,
      );
      // Log the FULL response object to see all available fields
      console.log(`[POI-REQUESTER] 📋 FULL ValidatedRailgunTxidStatus response:`, JSON.stringify(txidStatus, null, 2));
      console.log(`[POI-REQUESTER] POI node returned: txidIndex=${txidStatus.validatedTxidIndex}, hasMerkleroot=${!!txidStatus.validatedMerkleroot}`);
      // Log all keys to see what fields are available
      console.log(`[POI-REQUESTER] Available fields:`, Object.keys(txidStatus));
      return {
        txidIndex: txidStatus.validatedTxidIndex,
        merkleroot: txidStatus.validatedMerkleroot,
      };
    } catch (error: any) {
      console.error(`[POI-REQUESTER] ⚠️  Failed to get latest validated txid from POI node:`, error?.message);
      console.error(`[POI-REQUESTER] ⚠️  This may prevent TXID sync from working. Engine may require POI validation.`);
      // Return undefined to indicate POI node is unavailable
      // Engine might still work if it can initialize tree without POI validation
      return { txidIndex: undefined, merkleroot: undefined };
    }
  }
}
