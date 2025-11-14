import { functions } from "./abi/RailgunSmartWallet";
import { CommitmentBatchEventNew, Token, Transaction, VerificationHash } from "./model";
import { SNARK_PRIME_BIG_INT, bigIntToPad32Bytes, bigIntToPaddedBytes, bigIntToPaddedHexString, calculateRailgunTransactionVerificationHash, hexStringToBytes, padTo32BytesStart } from "./utils";
import { idFrom2PaddedBigInts, idFrom3PaddedBigInts } from "./id";
import { createToken } from "./token";
import { keccak256, AbiCoder } from "ethers";
import { ProcessingContext } from "./pipeline/context";

const bufferToUint8Array = (buffer: Buffer): Uint8Array =>
  new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

const getBoundParamsHashLegacy = (
    boundParams: any
): string => {

    const abi = AbiCoder.defaultAbiCoder();

    const params = abi.encode(
        ['tuple(uint16 treeNumber, uint8 withdraw, address adaptContract, bytes32 adaptParams, tuple(uint256[4] ciphertext, uint256[2] ephemeralKeys, uint256[] memo)[] commitmentCiphertext) _boundParams'],
        [boundParams]);

    const hashed = keccak256(params);
    const modulo = BigInt(hashed) % SNARK_PRIME_BIG_INT;
    return bigIntToPaddedHexString(modulo);
}

const getBoundParamsHash = (
    boundParams: any
): string => {

    const abi = AbiCoder.defaultAbiCoder();

    const params = abi.encode(
        ['tuple(uint16 treeNumber, uint48 minGasPrice, uint8 unshield, uint64 chainID, address adaptContract, bytes32 adaptParams, tuple(bytes32[4] ciphertext, bytes32 blindedSenderViewingKey, bytes32 blindedReceiverViewingKey, bytes annotationData, bytes memo)[] commitmentCiphertext) boundParams'],
        [boundParams]);

    const hashed = keccak256(params);
    const modulo = BigInt(hashed) % SNARK_PRIME_BIG_INT;
    return bigIntToPaddedHexString(modulo);
}

// I don't know,this just works, please don't hate me
// This is only used for legacy transaction which doesn't follow any
// other pattern than this.
const bigIntToBytesUnconventional = (data: bigint): Buffer => {
    const hexString = data.toString(16);
    const first = parseInt(hexString[0], 16);
    if (hexString.length % 2 == 0) {
        if (first > 7)
            return bigIntToPad32Bytes(data);
        else
            return bigIntToPaddedBytes(data);
    }
    else
        return bigIntToPaddedBytes(data);
}

type ProcessParams = {
    input: string;
    blockNumber: number;
    blockTimestamp: number;
    transactionIndex: number;
    transactionHash: string;
};

async function ensureVerificationHash(ctx: ProcessingContext): Promise<Uint8Array> {
    let lastVerificationHash = await ctx.store.findOneBy(VerificationHash, { id: '0x' });
    if (lastVerificationHash == undefined) {
        lastVerificationHash = new VerificationHash({
            id: '0x',
            verificationHash: bufferToUint8Array(hexStringToBytes('0x'))
        });
    }
    return lastVerificationHash.verificationHash;
}

async function updateVerificationHash(ctx: ProcessingContext, value: Uint8Array): Promise<void> {
    const latestVerificationHash = new VerificationHash({
        id: '0x',
        verificationHash: value
    });
    await ctx.store.upsert(latestVerificationHash);
}

async function loadCommitmentBatchInfo(
    ctx: ProcessingContext,
    blockNumber: bigint,
    transactionIndex: number
): Promise<{ batchStartTreePosition: bigint; treeNumber: bigint }> {
    const commitmentBatchId = idFrom2PaddedBigInts(blockNumber, BigInt(transactionIndex));
    let batchStartTreePosition = 99999n;
    let treeNumber = 99999n;

    let commitmentBatchEventNew = await ctx.store.findOneBy(CommitmentBatchEventNew, {
        id: commitmentBatchId
    });
    if (commitmentBatchEventNew == null) {
        console.log(`CommitmentBatchEventNew not found for block ${blockNumber}, index: ${transactionIndex} `)
    }
    else {
        batchStartTreePosition = commitmentBatchEventNew.batchStartTreePosition;
        treeNumber = commitmentBatchEventNew.treeNumber;
    }
    return { batchStartTreePosition, treeNumber };
}

export const processLegacyTransactionInput = async (
    params: ProcessParams,
    ctx: ProcessingContext
): Promise<{
    tokens: Map<string, Token>;
    transactions: Array<Transaction>;
}> => {
    const data = functions['transact((((uint256,uint256),(uint256[2],uint256[2]),(uint256,uint256)),uint256,uint256[],uint256[],(uint16,uint8,address,bytes32,(uint256[4],uint256[2],uint256[])[]),(uint256,(uint8,address,uint256),uint120),address)[])']
        .decode(params.input);

    let curVerificationHash = await ensureVerificationHash(ctx);

    const blockNumber = BigInt(params.blockNumber);
    const transactionIndex = params.transactionIndex;
    const { batchStartTreePosition: initialBatchStartTreePosition, treeNumber } =
        await loadCommitmentBatchInfo(ctx, blockNumber, transactionIndex);

    let batchStartTreePosition = initialBatchStartTreePosition;

    const tokens = new Map<string, Token>();
    const transactions = new Array<Transaction>();
    if (data._transactions.length > 0) {
        for (let i = 0; i < data._transactions.length; ++i) {
            const id = idFrom3PaddedBigInts(
                blockNumber,
                BigInt(transactionIndex),
                BigInt(i)
            );

            const { tokenType, tokenAddress, tokenSubID } = data._transactions[i].withdrawPreimage.token;
            const token = createToken(tokenType, tokenAddress, tokenSubID);
            tokens.set(token.id, token);

            const merkleRootBuffer = bigIntToBytesUnconventional(data._transactions[i].merkleRoot).reverse();
            const merkleRoot = bufferToUint8Array(merkleRootBuffer);
            const nullifiers = data._transactions[i].nullifiers;
            const commitments = data._transactions[i].commitments;

            const verificationHexString = `0x${Buffer.from(curVerificationHash).toString('hex')}`;
            curVerificationHash = bufferToUint8Array(
                hexStringToBytes(
                    calculateRailgunTransactionVerificationHash(
                        verificationHexString,
                        bigIntToPaddedHexString(nullifiers[0])
                    )
                )
            );

            const transaction = new Transaction({
                id,
                blockNumber,
                transactionHash: bufferToUint8Array(hexStringToBytes(params.transactionHash)),
                merkleRoot,
                nullifiers: nullifiers.map((nullifier) =>
                    bufferToUint8Array(bigIntToBytesUnconventional(nullifier))
                ),
                commitments: commitments.map((commitment) =>
                    bufferToUint8Array(bigIntToBytesUnconventional(commitment))
                ),
                hasUnshield: data._transactions[i].boundParams.withdraw != 0,
                utxoTreeIn: BigInt(data._transactions[i].boundParams.treeNumber),
                boundParamsHash: bufferToUint8Array(
                    hexStringToBytes(getBoundParamsHashLegacy(data._transactions[i].boundParams))
                ),
                utxoTreeOut: treeNumber,
                utxoBatchStartPositionOut: batchStartTreePosition,
                unshieldToken: token,
                unshieldToAddress: bufferToUint8Array(
                    bigIntToPaddedBytes(data._transactions[i].withdrawPreimage.npk)
                ),
                unshieldValue: data._transactions[i].withdrawPreimage.value,
                blockTimestamp: BigInt(Math.floor(params.blockTimestamp / 1000)),
                verificationHash: curVerificationHash
            });

            transactions.push(transaction);
            batchStartTreePosition = BigInt(data._transactions[i].commitments.length) + batchStartTreePosition - (data._transactions[i].boundParams.withdraw != 0 ? 1n : 0n)
        }

        await updateVerificationHash(ctx, curVerificationHash);
    }

    return {
        tokens,
        transactions
    };
}
export const processTransactionInput = async (
    params: ProcessParams,
    ctx: ProcessingContext
): Promise<{
    tokens: Map<string, Token>;
    transactions: Array<Transaction>;
}> => {
    const data = functions['transact((((uint256,uint256),(uint256[2],uint256[2]),(uint256,uint256)),bytes32,bytes32[],bytes32[],(uint16,uint72,uint8,uint64,address,bytes32,(bytes32[4],bytes32,bytes32,bytes,bytes)[]),(bytes32,(uint8,address,uint256),uint120))[])']
        .decode(params.input);

    let curVerificationHash = await ensureVerificationHash(ctx);

    const blockNumber = BigInt(params.blockNumber);
    const transactionIndex = params.transactionIndex;
    const { batchStartTreePosition: initialBatchStartTreePosition, treeNumber } =
        await loadCommitmentBatchInfo(ctx, blockNumber, transactionIndex);

    let batchStartTreePosition = initialBatchStartTreePosition;

    const tokens = new Map<string, Token>();
    const transactions = new Array<Transaction>();
    if (data._transactions.length > 0) {
        for (let i = 0; i < data._transactions.length; ++i) {
            const merkleRoot = data._transactions[i].merkleRoot;
            const nullifiers = data._transactions[i].nullifiers;
            const commitments = data._transactions[i].commitments;

            const verificationHexString = `0x${Buffer.from(curVerificationHash).toString('hex')}`;
            curVerificationHash = bufferToUint8Array(
                hexStringToBytes(
                    calculateRailgunTransactionVerificationHash(
                        verificationHexString,
                        bigIntToPaddedHexString(BigInt(nullifiers[0]))
                    )
                )
            );

            const { tokenType, tokenAddress, tokenSubID } = data._transactions[i].unshieldPreimage.token;
            const token = createToken(tokenType, tokenAddress, tokenSubID);
            tokens.set(token.id, token);

            const id = idFrom3PaddedBigInts(
                blockNumber,
                BigInt(transactionIndex),
                BigInt(i)
            );
            const npk = data._transactions[i].unshieldPreimage.npk;
            const unshieldToAddress = `0x${npk.slice(-40)}`;
            const transaction = new Transaction({
                id,
                blockNumber,
                transactionHash: bufferToUint8Array(hexStringToBytes(params.transactionHash)),
                merkleRoot: bufferToUint8Array(hexStringToBytes(padTo32BytesStart(merkleRoot))),
                nullifiers: nullifiers.map((nullifier) =>
                    bufferToUint8Array(hexStringToBytes(padTo32BytesStart(nullifier)))
                ),
                commitments: commitments.map((commitment) =>
                    bufferToUint8Array(hexStringToBytes(padTo32BytesStart(commitment)))
                ),
                hasUnshield: data._transactions[i].boundParams.unshield != 0,
                utxoTreeIn: BigInt(data._transactions[i].boundParams.treeNumber),
                boundParamsHash: bufferToUint8Array(
                    hexStringToBytes(getBoundParamsHash(data._transactions[i].boundParams))
                ),
                utxoTreeOut: treeNumber,
                utxoBatchStartPositionOut: batchStartTreePosition,
                unshieldToken: token,
                unshieldToAddress: bufferToUint8Array(hexStringToBytes(unshieldToAddress)),
                unshieldValue: data._transactions[i].unshieldPreimage.value,
                blockTimestamp: BigInt(Math.floor(params.blockTimestamp / 1000)),
                verificationHash: curVerificationHash
            });

            transactions.push(transaction);
            batchStartTreePosition = BigInt(data._transactions[i].commitments.length) + batchStartTreePosition - (data._transactions[i].boundParams.unshield != 0 ? 1n : 0n)
        }

        await updateVerificationHash(ctx, curVerificationHash);
    }

    return {
        tokens,
        transactions
    };
};

export const handleLegacyTransactionCall = async (trace: any, ctx: ProcessingContext) => {
    return processLegacyTransactionInput(
        {
            input: trace.action.input,
            blockNumber: trace.block.height,
            blockTimestamp: trace.block.timestamp,
            transactionIndex: trace.transactionIndex,
            transactionHash: trace.transaction.hash,
        },
        ctx
    );
};

export const handleTransactionCall = async (trace: any, ctx: ProcessingContext) => {
    return processTransactionInput(
        {
            input: trace.action.input,
            blockNumber: trace.block.height,
            blockTimestamp: trace.block.timestamp,
            transactionIndex: trace.transactionIndex,
            transactionHash: trace.transaction.hash,
        },
        ctx
    );
};
