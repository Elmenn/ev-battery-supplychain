import { assertNotNull } from '@subsquid/evm-processor';
import { Contract as PoseidonT4 } from './abi/PoseidonT4'

export const poseidonT4Hash = async (
    ctx: any,
    address: BigInt,
    tokenHash: BigInt,
    value: BigInt,
) => {
    const contractAddress = assertNotNull(process.env.RAILGUN_POSEIDONT4_CONTRACT_ADDRESS);
    let lastBatchBlockHeader = ctx.blocks[ctx.blocks.length - 1].header
    const contract = new PoseidonT4(ctx, lastBatchBlockHeader, contractAddress);
    let result = await contract["poseidon(uint256[3])"]([address as bigint, tokenHash as bigint, value as bigint]);
    return result as BigInt;
};

export const getNoteHash = async (
    ctx: any,
    npk: BigInt,
    tokenHash: BigInt,
    value: BigInt,
): Promise<BigInt> => {
    const result = await poseidonT4Hash(ctx, npk, tokenHash, value);
    return result;
};
