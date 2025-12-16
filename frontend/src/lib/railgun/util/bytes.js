/**
 * Bytes Utilities
 * 
 * Utility functions for byte manipulation.
 * Converted from TypeScript to JavaScript.
 */

import {
  ByteLength,
  ByteUtils,
  fromUTF8String,
  toUTF8String,
  Database,
} from '@railgun-community/engine';

export const parseRailgunTokenAddress = (tokenAddress) => {
  return ByteUtils.formatToByteLength(tokenAddress, ByteLength.Address, true);
};

export const getRandomBytes = (length) => {
  return ByteUtils.randomHex(length);
};

export const bytesToHex = (bytes) => {
  return Buffer.from(bytes).toString('hex');
};

export { ByteLength, ByteUtils, fromUTF8String, toUTF8String, Database };

