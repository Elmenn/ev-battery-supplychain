/**
 * Railgun Wallets
 * 
 * Functions for creating, loading, and managing Railgun wallets.
 * Converted from TypeScript to JavaScript.
 */

import {
  RailgunWallet,
  EngineEvent,
  RailgunEngine,
  ByteUtils,
  ViewOnlyWallet,
} from '@railgun-community/engine';
import {
  NETWORK_CONFIG,
  isDefined,
} from '@railgun-community/shared-models';
import { onBalancesUpdate, onWalletPOIProofProgress } from './balance-update.js';
import { reportAndSanitizeError } from '../../../utils/error.js';
import { getAddress } from 'ethers';
import { getEngine } from '../core/engine.js';

export const awaitWalletScan = (walletID, chain) => {
  const wallet = walletForID(walletID);
  return new Promise((resolve, reject) =>
    wallet.once(
      EngineEvent.WalletDecryptBalancesComplete,
      ({ chain: returnedChain }) =>
        returnedChain.type === chain.type && returnedChain.id === chain.id
          ? resolve(returnedChain)
          : reject(),
    ),
  );
};

export const awaitMultipleWalletScans = async (walletID, chain, numScans) => {
  let i = 0;
  while (i < numScans) {
    // eslint-disable-next-line no-await-in-loop
    await awaitWalletScan(walletID, chain);
    i += 1;
  }
  return Promise.resolve();
};

export const walletForID = (id) => {
  const engine = getEngine();
  const wallet = engine.wallets[id];
  if (!isDefined(wallet)) {
    throw new Error('No RAILGUN wallet for ID');
  }
  return wallet;
};

export const fullWalletForID = (id) => {
  const wallet = walletForID(id);
  if (!(wallet instanceof RailgunWallet)) {
    throw new Error('Can not load View-Only wallet.');
  }
  return wallet;
};

export const viewOnlyWalletForID = (id) => {
  const wallet = walletForID(id);
  if (!(wallet instanceof ViewOnlyWallet)) {
    throw new Error('Can only load View-Only wallet.');
  }
  return wallet;
};

const subscribeToEvents = (wallet) => {
  wallet.on(
    EngineEvent.WalletDecryptBalancesComplete,
    ({ txidVersion, chain }) => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      onBalancesUpdate(txidVersion, wallet, chain);
    },
  );
  wallet.on(
    EngineEvent.POIProofUpdate,
    ({
      status,
      txidVersion,
      chain,
      progress,
      listKey,
      txid,
      railgunTxid,
      index,
      totalCount,
      errorMsg,
    }) => {
      onWalletPOIProofProgress(
        status,
        txidVersion,
        wallet,
        chain,
        progress,
        listKey,
        txid,
        railgunTxid,
        index,
        totalCount,
        errorMsg,
      );
    },
  );
};

const addressForWallet = (wallet) => {
  return wallet.getAddress();
};

const infoForWallet = (wallet) => {
  const railgunAddress = addressForWallet(wallet);
  return {
    id: wallet.id,
    railgunAddress,
  };
};

const getExistingWallet = (railgunWalletID) => {
  try {
    const existingWallet = walletForID(railgunWalletID);
    return existingWallet;
  } catch (_err) {
    return undefined;
  }
};

const loadExistingWallet = async (encryptionKey, railgunWalletID, isViewOnlyWallet) => {
  const existingWallet = getExistingWallet(railgunWalletID);
  if (existingWallet) {
    return infoForWallet(existingWallet);
  }
  const engine = getEngine();
  let wallet;

  if (isViewOnlyWallet) {
    wallet = await engine.loadExistingViewOnlyWallet(
      encryptionKey,
      railgunWalletID,
    );
  } else {
    wallet = await engine.loadExistingWallet(encryptionKey, railgunWalletID);
  }

  subscribeToEvents(wallet);
  return infoForWallet(wallet);
};

const createWallet = async (
  encryptionKey,
  mnemonic,
  creationBlockNumbers,
  railgunWalletDerivationIndex,
) => {
  const formattedCreationBlockNumbers =
    formatCreationBlockNumbers(creationBlockNumbers);

  const engine = getEngine();
  const wallet = await engine.createWalletFromMnemonic(
    encryptionKey,
    mnemonic,
    railgunWalletDerivationIndex ?? 0,
    formattedCreationBlockNumbers,
  );
  subscribeToEvents(wallet);
  return infoForWallet(wallet);
};

const createViewOnlyWallet = async (
  encryptionKey,
  shareableViewingKey,
  creationBlockNumbers,
) => {
  const formattedCreationBlockNumbers =
    formatCreationBlockNumbers(creationBlockNumbers);

  const engine = getEngine();
  const wallet = await engine.createViewOnlyWalletFromShareableViewingKey(
    encryptionKey,
    shareableViewingKey,
    formattedCreationBlockNumbers,
  );
  subscribeToEvents(wallet);
  return infoForWallet(wallet);
};

export const createRailgunWallet = async (
  encryptionKey,
  mnemonic,
  creationBlockNumbers,
  railgunWalletDerivationIndex,
) => {
  try {
    return await createWallet(
      encryptionKey,
      mnemonic,
      creationBlockNumbers,
      railgunWalletDerivationIndex,
    );
  } catch (err) {
    throw reportAndSanitizeError(createRailgunWallet.name, err);
  }
};

export const createViewOnlyRailgunWallet = async (
  encryptionKey,
  shareableViewingKey,
  creationBlockNumbers,
) => {
  try {
    return await createViewOnlyWallet(
      encryptionKey,
      shareableViewingKey,
      creationBlockNumbers,
    );
  } catch (err) {
    throw reportAndSanitizeError(createViewOnlyRailgunWallet.name, err);
  }
};

export const loadWalletByID = async (
  encryptionKey,
  railgunWalletID,
  isViewOnlyWallet,
) => {
  try {
    return await loadExistingWallet(
      encryptionKey,
      railgunWalletID,
      isViewOnlyWallet,
    );
  } catch (err) {
    const sanitizedError = reportAndSanitizeError(loadWalletByID.name, err);
    throw new Error(`Could not load RAILGUN wallet`, { cause: sanitizedError });
  }
};

export const unloadWalletByID = (railgunWalletID) => {
  try {
    const engine = getEngine();
    engine.unloadWallet(railgunWalletID);
  } catch (err) {
    throw new Error('Could not unload RAILGUN wallet.', { cause: err });
  }
};

export const deleteWalletByID = async (railgunWalletID) => {
  try {
    const engine = getEngine();
    await engine.deleteWallet(railgunWalletID);
  } catch (err) {
    throw new Error('Could not delete RAILGUN wallet.', { cause: err });
  }
};

export const getWalletMnemonic = async (encryptionKey, railgunWalletID) => {
  const { db } = getEngine();
  // Reload wallet to ensure that encryption key is valid.
  const walletData = await RailgunWallet.getEncryptedData(
    db,
    encryptionKey,
    railgunWalletID,
  );

  if (!walletData.mnemonic) {
    throw new Error('No mnemonic for wallet.');
  }
  return walletData.mnemonic;
};

export const getRailgunWalletAddressData = (address) => {
  assertValidRailgunAddress(address);
  return RailgunEngine.decodeAddress(address);
};

export const getRailgunWalletPrivateViewingKey = (railgunWalletID) => {
  const wallet = walletForID(railgunWalletID);
  return wallet.getViewingKeyPair().privateKey;
};

export const signWithWalletViewingKey = async (railgunWalletID, message) => {
  const wallet = walletForID(railgunWalletID);
  const signature = await wallet.signWithViewingKey(
    ByteUtils.hexStringToBytes(message),
  );
  return ByteUtils.hexlify(signature);
};

export const assertValidRailgunAddress = (address) => {
  if (!validateRailgunAddress(address)) {
    throw new Error('Invalid RAILGUN address.');
  }
};

export const validateRailgunAddress = (address) => {
  try {
    return RailgunEngine.decodeAddress(address) != null;
  } catch (err) {
    return false;
  }
};

export const assertValidEthAddress = (address) => {
  if (!validateEthAddress(address)) {
    throw new Error('Invalid wallet address.');
  }
};

export const validateEthAddress = (address) => {
  try {
    getAddress(address);
    return true;
  } catch (err) {
    return false;
  }
};

export const getRailgunAddress = (railgunWalletID) => {
  try {
    const wallet = walletForID(railgunWalletID);
    return wallet.getAddress();
  } catch (err) {
    reportAndSanitizeError(getRailgunAddress.name, err);
    return undefined;
  }
};

export const getWalletShareableViewingKey = async (railgunWalletID) => {
  try {
    const wallet = walletForID(railgunWalletID);
    return wallet.generateShareableViewingKey();
  } catch (err) {
    reportAndSanitizeError(getWalletShareableViewingKey.name, err);
    return undefined;
  }
};

const formatCreationBlockNumbers = (creationBlockNumbers) => {
  // Format creationBlockNumbers from client side { <NetworkName>: <BlockNumber> } map to @railgun-community/engine's number[][] type
  if (!creationBlockNumbers) return undefined;

  const formattedCreationBlockNumbers = [];
  const networksNames = Object.keys(creationBlockNumbers);

  for (const networkName of networksNames) {
    const network = NETWORK_CONFIG[networkName];

    const blockNumber = creationBlockNumbers[networkName];
    if (!isDefined(blockNumber)) {
      continue;
    }

    formattedCreationBlockNumbers[network.chain.type] ??= [];
    formattedCreationBlockNumbers[network.chain.type][network.chain.id] =
      blockNumber;
  }

  return formattedCreationBlockNumbers;
};

