import { assert } from 'console';
import { EvmProcessorLog } from './evm-log';
import { bigIntToPaddedHexString, hexStringToBytes, padTo32BytesStart } from './utils';

export const idFrom2PaddedBigInts = (
    param0: bigint,
    param1: bigint,
): string => {
    // Convert to hexString, pad to end.
    const bytes0 = padTo32BytesStart(bigIntToPaddedHexString(param0)).substring(2);
    const bytes1 = padTo32BytesStart(bigIntToPaddedHexString(param1)).substring(2);

    return `0x${bytes0}${bytes1}`;
};

export const idFrom3PaddedBigInts = (param0: bigint, param1: bigint, param2: bigint): string => {
    const bytes0 = padTo32BytesStart(bigIntToPaddedHexString(param0)).substring(2);
    const bytes1 = padTo32BytesStart(bigIntToPaddedHexString(param1)).substring(2);
    const bytes2 = padTo32BytesStart(bigIntToPaddedHexString(param2)).substring(2);
    return `0x${bytes0}${bytes1}${bytes2}`;
}

function toI32(x: number): Buffer {
    const self = new Uint8Array(4);
    self[0] = x;
    self[1] = (x >> 8);
    self[2] = (x >> 16);
    self[3] = (x >> 24);
    return Buffer.from(self);
}
export const idFromEventLogIndex = (e: EvmProcessorLog): string => {
    assert(e.logIndex >= -Math.pow(2, 31) && e.logIndex <= Math.pow(2, 31) - 1);
    const logIndex = toI32(e.logIndex).toString('hex');
    return e.transaction.hash.concat(logIndex);
}
