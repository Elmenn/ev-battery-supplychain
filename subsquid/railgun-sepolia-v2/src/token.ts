import { Token, TokenType } from "./model";
import { bigIntToPaddedHexString, hexStringToBytes, padHexStringToEven, padTo32BytesStart, SNARK_PRIME_BIG_INT } from "./utils";
import { keccak256 } from "ethers";

// Refer to utils RailgunCommunity/Engine (note-utils.ts)
const getTokenDataHashNFT = (
    tokenType: number,
    tokenAddress: string,
    tokenSubID: bigint,
): string => {
    const tokenTypeBytes = padTo32BytesStart(bigIntToPaddedHexString(BigInt(tokenType)));
    const tokenAddressBytes = padTo32BytesStart(tokenAddress);
    const tokenSubIDBytes = padTo32BytesStart(bigIntToPaddedHexString(tokenSubID));

    // keccak256 hash of the token data.
    const combinedData = Buffer.concat([hexStringToBytes(tokenTypeBytes),
    hexStringToBytes(tokenAddressBytes),
    hexStringToBytes(tokenSubIDBytes)]);

    const hashed = keccak256(combinedData);
    const modulo = BigInt(hashed) % SNARK_PRIME_BIG_INT;
    return padHexStringToEven(`0x${modulo.toString(16)}`);
};

export const getTokenHash = (
    tokenType: number,
    tokenAddress: string,
    tokenSubID: bigint,
): string => {

    switch (Number(tokenType)) {
        case 0: // TokenType.ERC20:
            return padTo32BytesStart(tokenAddress);
        case 1: // TokenType.ERC721:
        case 2: // TokenType.ERC1155:
            return getTokenDataHashNFT(tokenType, tokenAddress, tokenSubID);
    }
    throw new Error('Unhandled token type');

};

export const getTokenTypeEnum = (tokenType: number): TokenType => {
    switch (Number(tokenType)) {
        case 0:
            return TokenType.ERC20;
        case 1:
            return TokenType.ERC721;
        case 2:
            return TokenType.ERC1155;
    }
    console.log(tokenType);
    throw new Error('Unhandled token type');
};


export function createToken(tokenType: number, tokenAddress: string, tokenSubID: bigint): Token {
    const tokenId = getTokenHash(tokenType, tokenAddress, tokenSubID).toLowerCase();
    return new Token({
        id: tokenId,
        tokenType: getTokenTypeEnum(tokenType),
        tokenAddress: hexStringToBytes(tokenAddress),
        tokenSubID: bigIntToPaddedHexString(tokenSubID)
    });
}