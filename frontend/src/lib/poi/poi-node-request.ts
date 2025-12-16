import {
  TransactProofData,
  ValidateTxidMerklerootParams,
  SubmitTransactProofParams,
  GetMerkleProofsParams,
  MerkleProof,
  Chain,
  GetPOIsPerListParams,
  BlindedCommitmentData,
  POIsPerListMap,
  ValidatedRailgunTxidStatus,
  TXIDVersion,
  GetLatestValidatedRailgunTxidParams,
  SubmitLegacyTransactProofParams,
  ValidatePOIMerklerootsParams,
  SingleCommitmentProofsData,
  SubmitSingleCommitmentProofsParams,
  delay,
  POIJSONRPCMethod,
  promiseTimeout,
} from '@railgun-community/shared-models';
import axios, { AxiosError } from 'axios';
import { sendErrorMessage } from '../../utils';
import { LegacyTransactProofData } from '@railgun-community/engine';
import { JsonRpcError, JsonRpcPayload, JsonRpcResult } from 'ethers';

export class POINodeRequest {
  private nodeURLs: string[];

  constructor(nodeURLs: string[]) {
    this.nodeURLs = nodeURLs;
  }

  private currentNodeURLIndex = 0;

  private getNextNodeURL = () => {
    this.currentNodeURLIndex =
      (this.currentNodeURLIndex + 1) % this.nodeURLs.length;
    return this.getNodeURL(this.currentNodeURLIndex);
  };

  private getNodeURL = (nodeUrlAttemptIndex: number): string => {
    return `${this.nodeURLs[nodeUrlAttemptIndex]}`;
  };

  private static async jsonRpcRequest<
    Params extends any[] | Record<string, any>,
    ResponseData,
  >(
    url: string,
    method: POIJSONRPCMethod,
    params: Params,
  ): Promise<ResponseData> {
    const payload: JsonRpcPayload = {
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    };

    try {
      const { data }: { data: JsonRpcResult | JsonRpcError } = await axios.post(
        url,
        payload,
      );

      // Check if the response contains an error
      if ('error' in data) {
        throw new Error(data.error.message);
      }

      // Assume the result will always be in the expected ResponseData format
      return data.result as ResponseData;
    } catch (cause) {
      if (!(cause instanceof AxiosError)) {
        throw new Error('Non-error thrown in axios post request.', { cause });
      }
      const err = new Error(`POI request error ${url}`, { cause });
      sendErrorMessage(err);
      throw err;
    }
  }

  private async attemptRequestWithFallbacks<
    Params extends any[] | Record<string, any>,
    ResponseData,
  >(
    method: POIJSONRPCMethod,
    params: Params,
    nodeUrlAttemptIndex = 0,
    finalAttempt = false,
  ): Promise<ResponseData> {
    try {
      const url = this.getNodeURL(nodeUrlAttemptIndex);
      const res = await promiseTimeout(
        POINodeRequest.jsonRpcRequest<Params, ResponseData>(
          url,
          method,
          params,
        ),
        60_000,
      );
      return res;
    } catch (err) {
      if (finalAttempt) {
        throw err;
      }
      // If nodeUrlAttemptIndex is already at the last index, try one final time with the priority 0 nodeUrl
      if (nodeUrlAttemptIndex === this.nodeURLs.length - 1) {
        return this.attemptRequestWithFallbacks(
          method,
          params,
          0, // nodeUrlAttemptIndex
          true, // finalAttempt
        );
      }

      // Retry with next priority node URL.
      return this.attemptRequestWithFallbacks(
        method,
        params,
        nodeUrlAttemptIndex + 1, // nodeUrlAttemptIndex
        false, // finalAttempt
      );
    }
  }

  validateRailgunTxidMerkleroot = async (
    txidVersion: TXIDVersion,
    chain: Chain,
    tree: number,
    index: number,
    merkleroot: string,
  ): Promise<boolean> => {
    const method = POIJSONRPCMethod.ValidateTXIDMerkleroot;
    const isValid = await this.attemptRequestWithFallbacks<
      ValidateTxidMerklerootParams,
      boolean
    >(method, {
      chainType: chain.type.toString(),
      chainID: chain.id.toString(),
      txidVersion,
      tree,
      index,
      merkleroot,
    });
    return isValid;
  };

  getLatestValidatedRailgunTxid = async (
    txidVersion: TXIDVersion,
    chain: Chain,
  ): Promise<ValidatedRailgunTxidStatus> => {
    const method = POIJSONRPCMethod.ValidatedTXID;
    const status = await this.attemptRequestWithFallbacks<
      GetLatestValidatedRailgunTxidParams,
      ValidatedRailgunTxidStatus
    >(method, {
      chainType: chain.type.toString(),
      chainID: chain.id.toString(),
      txidVersion,
    });
    return status;
  };

  validatePOIMerkleroots = async (
    txidVersion: TXIDVersion,
    chain: Chain,
    listKey: string,
    poiMerkleroots: string[],
    retryCount = 0,
  ): Promise<boolean> => {
    try {
      const method = POIJSONRPCMethod.ValidatePOIMerkleroots;
      const validated = await this.attemptRequestWithFallbacks<
        ValidatePOIMerklerootsParams,
        boolean
      >(method, {
        chainType: chain.type.toString(),
        chainID: chain.id.toString(),
        txidVersion,
        listKey,
        poiMerkleroots,
      });
      return validated;
    } catch (cause) {
      if (retryCount < 3) {
        // Delay 2.5s and try again.
        await delay(2500);
        return this.validatePOIMerkleroots(
          txidVersion,
          chain,
          listKey,
          poiMerkleroots,
          retryCount + 1,
        );
      }
      throw new Error('Failed to validate POI merkleroots.', { cause });
    }
  };

  getPOIsPerList = async (
    txidVersion: TXIDVersion,
    chain: Chain,
    listKeys: string[],
    blindedCommitmentDatas: BlindedCommitmentData[],
  ): Promise<POIsPerListMap> => {
    const method = POIJSONRPCMethod.POIsPerList;
    console.log(`[POI-QUERY] Querying POI validation status from POI node...`);
    console.log(`[POI-QUERY] Chain: ${chain.type}:${chain.id}, Commitments: ${blindedCommitmentDatas.length}`);
    try {
      const poiStatusListMap = await this.attemptRequestWithFallbacks<
        GetPOIsPerListParams,
        POIsPerListMap
      >(method, {
        chainType: chain.type.toString(),
        chainID: chain.id.toString(),
        txidVersion,
        listKeys,
        blindedCommitmentDatas,
      });
      console.log(`[POI-QUERY] ✅ Received POI status for ${Object.keys(poiStatusListMap).length} commitments`);
      return poiStatusListMap;
    } catch (error: any) {
      console.error(`[POI-QUERY] ❌ Failed to query POI status: ${error?.message}`);
      throw error;
    }
  };

  getPOIMerkleProofs = async (
    txidVersion: TXIDVersion,
    chain: Chain,
    listKey: string,
    blindedCommitments: string[],
  ): Promise<MerkleProof[]> => {
    const method = POIJSONRPCMethod.MerkleProofs;

    const merkleProofs = await this.attemptRequestWithFallbacks<
      GetMerkleProofsParams,
      MerkleProof[]
    >(method, {
      chainType: chain.type.toString(),
      chainID: chain.id.toString(),
      txidVersion,
      listKey,
      blindedCommitments,
    });
    return merkleProofs;
  };

  submitPOI = async (
    txidVersion: TXIDVersion,
    chain: Chain,
    listKey: string,
    transactProofData: TransactProofData,
  ) => {
    const method = POIJSONRPCMethod.SubmitTransactProof;

    console.log(`[POI-SUBMIT] Submitting POI proof to POI node...`);
    console.log(`[POI-SUBMIT] Chain: ${chain.type}:${chain.id}, ListKey: ${listKey}`);
    console.log(`[POI-SUBMIT] TXID Merkleroot: ${transactProofData.txidMerkleroot}`);
    console.log(`[POI-SUBMIT] TXID Index: ${transactProofData.txidMerklerootIndex}`);
    console.log(`[POI-SUBMIT] Blinded Commitments: ${transactProofData.blindedCommitmentsOut.length}`);

    try {
      await this.attemptRequestWithFallbacks<SubmitTransactProofParams, void>(
        method,
        {
          chainType: chain.type.toString(),
          chainID: chain.id.toString(),
          txidVersion,
          listKey,
          transactProofData,
        },
      );
      console.log(`[POI-SUBMIT] ✅ POI proof submitted successfully`);
    } catch (error: any) {
      console.error(`[POI-SUBMIT] ❌ Failed to submit POI proof: ${error?.message}`);
      throw error;
    }
  };

  submitLegacyTransactProofs = async (
    txidVersion: TXIDVersion,
    chain: Chain,
    listKeys: string[],
    legacyTransactProofDatas: LegacyTransactProofData[],
  ) => {
    const method = POIJSONRPCMethod.SubmitLegacyTransactProofs;

    await this.attemptRequestWithFallbacks<
      SubmitLegacyTransactProofParams,
      void
    >(method, {
      chainType: chain.type.toString(),
      chainID: chain.id.toString(),
      txidVersion,
      listKeys,
      legacyTransactProofDatas,
    });
  };

  submitSingleCommitmentProof = async (
    txidVersion: TXIDVersion,
    chain: Chain,
    singleCommitmentProofsData: SingleCommitmentProofsData,
  ) => {
    const method = POIJSONRPCMethod.SubmitSingleCommitmentProofs;

    console.log(`[POI-SUBMIT] Submitting single commitment POI proofs to POI node...`);
    console.log(`[POI-SUBMIT] Chain: ${chain.type}:${chain.id}`);
    console.log(`[POI-SUBMIT] SingleCommitmentProofsData:`, JSON.stringify(singleCommitmentProofsData).substring(0, 200) + '...');

    try {
      // Log the full payload for debugging
      const params = {
        chainType: chain.type.toString(),
        chainID: chain.id.toString(),
        txidVersion,
        singleCommitmentProofsData,
      };
      console.log(`[POI-SUBMIT] Request params:`, {
        chainType: params.chainType,
        chainID: params.chainID,
        txidVersion: params.txidVersion,
        singleCommitmentProofsDataKeys: Object.keys(singleCommitmentProofsData || {}),
      });
      
      await this.attemptRequestWithFallbacks<
        SubmitSingleCommitmentProofsParams,
        void
      >(method, params);
      console.log(`[POI-SUBMIT] ✅ Single commitment POI proofs submitted successfully`);
      console.log(`[POI-SUBMIT] ✅ HTTP Response: 200 OK (no error thrown)`);
    } catch (error: any) {
      // Log detailed error information including HTTP status if available
      const errorMessage = error?.message || 'Unknown error';
      const errorStatus = error?.response?.status || error?.status || 'N/A';
      const errorData = error?.response?.data || error?.data || 'N/A';
      
      console.error(`[POI-SUBMIT] ❌ Failed to submit single commitment POI proofs`);
      console.error(`[POI-SUBMIT] ❌ Error message: ${errorMessage}`);
      console.error(`[POI-SUBMIT] ❌ HTTP Status: ${errorStatus}`);
      console.error(`[POI-SUBMIT] ❌ Response data:`, typeof errorData === 'string' ? errorData.substring(0, 500) : JSON.stringify(errorData).substring(0, 500));
      
      // Check for common error codes
      if (errorStatus === 401 || errorStatus === 403) {
        console.error(`[POI-SUBMIT] ⚠️  AUTH ERROR: POI node requires authentication (wallet signature or header)`);
      } else if (errorStatus === 200) {
        console.error(`[POI-SUBMIT] ⚠️  Got 200 but error thrown - check payload format (txid/leafIndex/listKey/head mismatch?)`);
      }
      
      throw error;
    }
  };
}
