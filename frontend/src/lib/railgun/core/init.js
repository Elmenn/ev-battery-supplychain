/**
 * Railgun Engine Initialization
 * 
 * Initializes and manages the Railgun Engine.
 * Converted from TypeScript to JavaScript.
 */

import {
  RailgunEngine,
  EngineEvent,
  MerkletreeHistoryScanEventData,
  POIList,
  POIListType,
  UTXOScanDecryptBalancesCompleteEventData,
  AbstractWallet,
  POIMerklerootsValidator,
} from '@railgun-community/engine';
import {
  MerkletreeScanUpdateEvent,
  isDefined,
} from '@railgun-community/shared-models';
import { sendErrorMessage, sendMessage } from '../../../utils/logger.js';
import {
  artifactGetterDownloadJustInTime,
  setArtifactStore,
  setUseNativeArtifacts,
} from './artifacts.js';
import { ArtifactStore } from '../../artifacts/artifact-store.js';
import { reportAndSanitizeError } from '../../../utils/error.js';
import { quickSyncEventsGraph } from '../quick-sync/quick-sync-events.js';
import { quickSyncRailgunTransactionsV2 } from '../railgun-txids/railgun-txid-sync-graph-v2.js';
import { WalletPOI } from '../../poi/wallet-poi.js';
import {
  WalletPOINodeInterface,
} from '../../poi/wallet-poi-node-interface.js';
import { setEngine, getEngine, hasEngine } from './engine.js';
import { onBalancesUpdate } from '../wallets/balance-update.js';
import { POIValidator } from '../../poi/index.js';

// Export BatchListUpdateEvent type (will be resolved at runtime)
export { WalletPOINodeInterface };

const createEngineDebugger = (verboseScanLogging) => {
  return {
    log: (msg) => {
      // SDK debug logs disabled - too verbose
      // Uncomment the line below if you need to debug SDK internal messages
      // console.log(`[SDK-DEBUG] ${msg}`);
      sendMessage(msg);
    },
    error: (error) => {
      // Enhanced error logging to capture SDK errors
      const errorMessage = error?.message || '';
      const errorString = JSON.stringify(error || {});
      
      // CRITICAL PATCH: Detect slow-sync errors and suppress them
      // The SDK tries slow-sync at 50% when it detects a gap, but the gap is false
      // (write queue hasn't flushed yet). Slow-sync fails due to RPC limits.
      // By suppressing this error in the debugger, we prevent the SDK from resetting the scan.
      const isSlowSyncError = 
        errorMessage.includes('Failed to scan V2 events') ||
        errorMessage.includes('invalid block range params') ||
        errorMessage.includes('eth_getLogs') ||
        errorString.includes('invalid block range params');
      
      if (isSlowSyncError) {
        console.warn(`[SDK-ERROR] ⚠️  Slow-sync error detected (suppressing to prevent scan reset):`);
        console.warn(`[SDK-ERROR]    Message: ${errorMessage}`);
        console.warn(`[SDK-ERROR]    This is expected on Sepolia - write queue hasn't flushed yet`);
        console.warn(`[SDK-ERROR]    Quick-sync should continue and complete naturally`);
        console.warn(`[SDK-ERROR]    NOT logging to SDK error handler to prevent scan reset`);
        // Don't call sendErrorMessage - this prevents SDK from resetting
        return;
      }
      
      // For other errors, log normally
      console.error(`[SDK-ERROR] ⚠️  SDK Internal Error (this may cause scan resets):`);
      console.error(`[SDK-ERROR]    Message: ${error.message}`);
      console.error(`[SDK-ERROR]    Stack: ${error.stack || 'no stack trace'}`);
      console.error(`[SDK-ERROR]    Name: ${error.name}`);
      console.error(`[SDK-ERROR]    Full error:`, error);
      sendErrorMessage(error);
    },
    verboseScanLogging,
  };
};

export const setOnUTXOMerkletreeScanCallback = (onUTXOMerkletreeScanCallback) => {
  const engine = getEngine();
  engine.on(
    EngineEvent.UTXOMerkletreeHistoryScanUpdate,
    ({ chain, scanStatus, progress }) =>
      onUTXOMerkletreeScanCallback({
        scanStatus,
        chain,
        progress: progress ?? 0.0,
      }),
  );
};

export const setOnTXIDMerkletreeScanCallback = (onTXIDMerkletreeScanCallback) => {
  const engine = getEngine();
  engine.on(
    EngineEvent.TXIDMerkletreeHistoryScanUpdate,
    ({ chain, scanStatus, progress }) =>
      onTXIDMerkletreeScanCallback({
        scanStatus,
        chain,
        progress: progress ?? 0.0,
      }),
  );
};

const setOnUTXOScanDecryptBalancesCompleteListener = () => {
  const engine = getEngine();
  engine.on(
    EngineEvent.UTXOScanDecryptBalancesComplete,
    ({
      txidVersion,
      chain,
      walletIdFilter,
    }) => {
      const updateWalletBalances = async () => {
        let walletsToUpdate = Object.values(engine.wallets);
        if (isDefined(walletIdFilter)) {
          walletsToUpdate = walletsToUpdate.filter(wallet =>
            walletIdFilter.includes(wallet.id),
          );
        }

        // await onBalancesUpdate calls for each wallet
        await Promise.all(
          walletsToUpdate.map(wallet =>
            onBalancesUpdate(txidVersion, wallet, chain),
          ),
        );

        // emit event to notify listeners that UTXOMerkletreeHistoryScan is complete
        engine.emitScanEventHistoryComplete(txidVersion, chain);
      };

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      updateWalletBalances();
    },
  );
};

export const setBatchListCallback = (onBatchListCallback) => {
  WalletPOINodeInterface.setListBatchCallback(onBatchListCallback);
};

export const pausePPOIBatchingForChain = (chain) => {
  WalletPOINodeInterface.pause(chain);
};

export const resumePPOIBatching = (chain) => {
  WalletPOINodeInterface.unpause(chain);
};

/**
 *
 * @param {string} walletSource - Name for your wallet implementation. Encrypted and viewable in private transaction history. Maximum of 16 characters, lowercase.
 * @param {AbstractLevelDOWN} db - LevelDOWN compatible database for storing encrypted wallets.
 * @param {boolean} shouldDebug - Whether to forward Engine debug logs to Logger.
 * @param {ArtifactStore} artifactStore - Persistent store for downloading large artifact files. See Wallet SDK Developer Guide for platform implementations.
 * @param {boolean} useNativeArtifacts - Whether to download native C++ or web-assembly artifacts. TRUE for mobile. FALSE for nodejs and browser.
 * @param {boolean} skipMerkletreeScans - Whether to skip merkletree syncs and private balance scans. Only set to TRUE in shield-only applications that don't load private wallets or balances.
 * @param {string[]} poiNodeURLs - List of POI aggregator node URLs, in order of priority.
 * @param {POIList[]} customPOILists - POI lists to use for additional wallet protections after default lists.
 * @param {boolean} verboseScanLogging - Verbose scan logging
 * @returns {Promise<void>}
 */
export const startRailgunEngine = async (
  walletSource,
  db,
  shouldDebug,
  artifactStore,
  useNativeArtifacts,
  skipMerkletreeScans,
  poiNodeURLs,
  customPOILists,
  verboseScanLogging = true,
) => {
  if (hasEngine()) {
    return;
  }
  try {
    setArtifactStore(artifactStore);
    setUseNativeArtifacts(useNativeArtifacts);

    const engine = await RailgunEngine.initForWallet(
      walletSource,
      db,
      artifactGetterDownloadJustInTime,
      quickSyncEventsGraph,
      quickSyncRailgunTransactionsV2,
      WalletPOI.getPOITxidMerklerootValidator(poiNodeURLs),
      WalletPOI.getPOILatestValidatedRailgunTxid(poiNodeURLs),
      shouldDebug ? createEngineDebugger(verboseScanLogging) : undefined,
      skipMerkletreeScans,
    );
    setEngine(engine);

    setOnUTXOScanDecryptBalancesCompleteListener();

    if (isDefined(poiNodeURLs)) {
      const poiNodeInterface = new WalletPOINodeInterface(poiNodeURLs);
      WalletPOI.init(poiNodeInterface, customPOILists ?? []);
    }
  } catch (err) {
    throw reportAndSanitizeError(startRailgunEngine.name, err);
  }
};

export const startRailgunEngineForPOINode = async (
  db,
  shouldDebug,
  artifactStore,
  validatePOIMerkleroots,
) => {
  if (hasEngine()) {
    return;
  }
  try {
    setArtifactStore(artifactStore);
    setUseNativeArtifacts(false);

    POIValidator.initForPOINode(validatePOIMerkleroots);

    const engine = await RailgunEngine.initForPOINode(
      db,
      artifactGetterDownloadJustInTime,
      quickSyncEventsGraph,
      quickSyncRailgunTransactionsV2,
      shouldDebug
        ? createEngineDebugger(false)
        : undefined,
    );
    setEngine(engine);
  } catch (err) {
    throw reportAndSanitizeError(startRailgunEngineForPOINode.name, err);
  }
};

export const stopRailgunEngine = async () => {
  if (!hasEngine()) {
    return;
  }
  await getEngine()?.unload();
  setEngine(undefined);
};

export { POIList, POIListType };

