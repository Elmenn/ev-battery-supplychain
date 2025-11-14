import { assert } from "console";
import { isHexString, keccak256 } from "ethers";

export const SNARK_PRIME_BIG_INT = BigInt(
    '21888242871839275222246405745257275088548364400416034343698204186575808495617',
);

export const padTo32BytesStart = (data: string): string => {
    const padded = data
        .substring(2)
        .padStart(64, '0');
    return `0x${padded}`;
};

export function bigIntToPaddedHexString(data: bigint): string {
    const hex = data.toString(16);
    const padded = hex.length % 2 === 0 ? hex : '0' + hex;
    return `0x${padded}`;
}

export function bigIntToPad32Bytes(data: bigint): Buffer {
    const padded = data.toString(16).padStart(64, '0');
    return Buffer.from(padded, 'hex');
}

export function bigIntToPaddedBytes(data: bigint): Buffer {
    const hex = data.toString(16);
    const padded = hex.length % 2 === 0 ? hex : '0' + hex;
    return Buffer.from(padded, 'hex');
}

export function hexStringToBytes(data: string): Buffer {
    assert(isHexString(data));
    assert(data.length % 2 == 0);
    return Buffer.from(data.substring(2), 'hex');
}

export const padHexStringToEven = (hexString: string): string => {
    const stripped = hexString.substring(2);
    const padded = stripped.length % 2 === 0 ? stripped : '0' + stripped;
    return `0x${padded}`;
};

export const reverseBytes = (bytes: string): string => {
    return `0x${bytes.substring(2).split("").reverse().join("")}`;
};

export const reversedBytesToBigInt = (bytes: string): BigInt => {
    return BigInt(reverseBytes(bytes));
};

export const calculateRailgunTransactionVerificationHash = (
    previousVerificationHash: string,
    firstNullifier: string
): string => {

    const prefix = previousVerificationHash == '0x' ? '' : padTo32BytesStart(previousVerificationHash).substring(2);
    const suffix = padTo32BytesStart(firstNullifier).substring(2);
    const combinedData = `0x${prefix}${suffix}`;
    return padTo32BytesStart(keccak256(combinedData))
};
