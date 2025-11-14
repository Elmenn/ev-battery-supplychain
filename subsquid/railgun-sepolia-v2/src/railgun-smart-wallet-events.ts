import { Ciphertext, CommitmentBatchEventNew, CommitmentCiphertext, CommitmentPreimage, CommitmentType, LegacyCommitmentCiphertext, LegacyEncryptedCommitment, LegacyGeneratedCommitment, Nullifier, ShieldCommitment, Token, TokenType, TransactCommitment, Unshield } from "./model";
import { EvmProcessorLog } from "./evm-log";
import { events } from "./abi/RailgunSmartWallet";
import { idFrom2PaddedBigInts, idFromEventLogIndex } from "./id";
import { bigIntToPad32Bytes, bigIntToPaddedBytes, bigIntToPaddedHexString, hexStringToBytes, padHexStringToEven, padTo32BytesStart} from "./utils";
import { getCiphertextData, getCiphertextIV, getCiphertextTag } from "./ciphertext";
import { createToken } from "./token";
import { getNoteHash } from "./hash";
import { ProcessingContext } from "./pipeline/context";

function extractNullifierData(evmLog: any): { treeNumber: bigint, nullifier: bigint[] } {
    if (evmLog.topics[0] === events.Nullified.topic) {
        const { treeNumber, nullifier } = events.Nullified.decode(evmLog);
        return {
            treeNumber: BigInt(treeNumber),
            nullifier: nullifier.map(n => BigInt(n))
        };
    }
    else if (evmLog.topics[0] === events.Nullifiers.topic) {
        return events.Nullifiers.decode(evmLog);
    }
    throw new Error("Unsupported topic");
}

/*
 *  ciphertexts: BigInt represented as hex string starting with 0x
*/
function parseCiphertext(id: string, ciphertexts: string[]): Ciphertext {
    const iv = getCiphertextIV(ciphertexts);
    const tag = getCiphertextTag(ciphertexts);
    const data = getCiphertextData(ciphertexts);
    const cipherText = new Ciphertext({
        id,
        iv,
        tag,
        data
    });
    return cipherText;
}

export function handleNullifier(e: EvmProcessorLog): Array<Nullifier> {
    const data = extractNullifierData(e);
    const treeNumber = data.treeNumber;
    const nullifiers = data.nullifier;

    let nullified = new Array<Nullifier>();
    for (let i = 0; i < nullifiers.length; i++) {
        // Convert nullifier from bigInt to hex
        const id = idFrom2PaddedBigInts(treeNumber, nullifiers[i]);

        // Making compatible with subgraph
        const nullifier = (e.topics[0] === events.Nullified.topic) ? padTo32BytesStart(bigIntToPaddedHexString(nullifiers[i])) : bigIntToPaddedHexString(nullifiers[i]);
        nullified.push(new Nullifier({
            id,
            blockNumber: BigInt(e.block.height),
            blockTimestamp: BigInt(e.block.timestamp) / 1000n,
            transactionHash: hexStringToBytes(e.transaction.hash),
            treeNumber: Number(treeNumber),
            nullifier: hexStringToBytes(nullifier)
        }));
    }

    return nullified;
}

export async function handleCommitmentBatch(e: EvmProcessorLog, ctx: ProcessingContext): Promise<{
    ciphertexts: Array<Ciphertext>,
    lcc: Array<LegacyCommitmentCiphertext>,
    lec: Array<LegacyEncryptedCommitment>
}> {
    const data = events.CommitmentBatch.decode(e);

    const ciphertexts = new Array<Ciphertext>();
    const legacyCommitmentCiphertexts = new Array<LegacyCommitmentCiphertext>();
    const legacyEncrpytedCommitments = new Array<LegacyEncryptedCommitment>();

    const ciphertextStructs = data.ciphertext;
    for (let i = 0; i < ciphertextStructs.length; ++i) {
        const ciphertextStruct = ciphertextStructs[i];
        const treePosition = data.startPosition + BigInt(i);
        const id = idFrom2PaddedBigInts(data.treeNumber, treePosition);
        const ciphertext = parseCiphertext(id, ciphertextStruct.ciphertext.map(ct => bigIntToPaddedHexString(ct)));
        ciphertexts.push(ciphertext);

        const legacyCommitmentCiphertext = new LegacyCommitmentCiphertext(
            {
                id,
                ciphertext,
                ephemeralKeys: ciphertextStruct.ephemeralKeys.map(key => bigIntToPaddedBytes(key)),
                memo: ciphertextStruct.memo.map(memo => bigIntToPaddedBytes(memo)),
            }
        );
        legacyCommitmentCiphertexts.push(legacyCommitmentCiphertext);

        legacyEncrpytedCommitments.push(new LegacyEncryptedCommitment({
            id,
            blockNumber: BigInt(e.block.height),
            blockTimestamp: BigInt(e.block.timestamp) / 1000n,
            transactionHash: hexStringToBytes(e.transaction.hash),
            treeNumber: Number(data.treeNumber),
            batchStartTreePosition: Number(data.startPosition),
            treePosition: Number(treePosition),
            commitmentType: CommitmentType.LegacyEncryptedCommitment,
            hash: data.hash[i],
            ciphertext: legacyCommitmentCiphertext
        }));
    }

    const id = idFrom2PaddedBigInts(BigInt(e.block.height), BigInt(e.transactionIndex));
    await ctx.store.upsert(new CommitmentBatchEventNew({ id, treeNumber: data.treeNumber, batchStartTreePosition: data.startPosition }));

    return {
        ciphertexts,
        lcc: legacyCommitmentCiphertexts,
        lec: legacyEncrpytedCommitments,
    };
}

export async function handleGeneratedCommitmentBatch(
    e: EvmProcessorLog,
    ctx: ProcessingContext
): Promise<{
    tokens: Map<string, Token>,
    legacyGeneratedCommitments: Array<LegacyGeneratedCommitment>
    commitmentPreImages: Array<CommitmentPreimage>
}> {
    const data = events.GeneratedCommitmentBatch.decode(e);
    const commitments = data.commitments;

    const tokens = new Map<string, Token>();
    const legacyGeneratedCommitments = new Array<LegacyGeneratedCommitment>();
    const commitmentPreImages = new Array<CommitmentPreimage>();

    for (let i = 0; i < commitments.length; i++) {
        const commitment = commitments[i];

        const treePosition = data.startPosition + BigInt(i);
        const id = idFrom2PaddedBigInts(data.treeNumber, treePosition);

        const { tokenType, tokenAddress, tokenSubID } = commitment.token;
        const token = createToken(tokenType, tokenAddress, tokenSubID);
        tokens.set(token.id, token);

        const preimage = new CommitmentPreimage({
            id,
            npk: hexStringToBytes(bigIntToPaddedHexString(commitment.npk)),
            token,
            value: commitment.value
        });

        commitmentPreImages.push(preimage);

        const commitmentHash = await getNoteHash(
            ctx,
            commitment.npk,
            BigInt(token.id),
            commitment.value,
        );

        const legacyGeneratedCommitment = new LegacyGeneratedCommitment({
            id,
            blockNumber: BigInt(e.block.height),
            blockTimestamp: BigInt(e.block.timestamp) / 1000n,
            transactionHash: hexStringToBytes(e.transaction.hash),
            treeNumber: Number(data.treeNumber),
            batchStartTreePosition: Number(data.startPosition),
            treePosition: Number(treePosition),
            commitmentType: CommitmentType.LegacyGeneratedCommitment,
            hash: commitmentHash as bigint,
            preimage,
            encryptedRandom: data.encryptedRandom[i].map(random => bigIntToPaddedBytes(random)),
        });
        legacyGeneratedCommitments.push(legacyGeneratedCommitment);
    }

    const id = idFrom2PaddedBigInts(BigInt(e.block.height), BigInt(e.transactionIndex));
    await ctx.store.upsert(new CommitmentBatchEventNew({ id, treeNumber: data.treeNumber, batchStartTreePosition: data.startPosition }));

    return { tokens, legacyGeneratedCommitments, commitmentPreImages };
}

export async function handleTransact(e: EvmProcessorLog, ctx: ProcessingContext): Promise<{
    ciphertexts: Array<Ciphertext>,
    transactCommitments: Array<TransactCommitment>,
    commitmentCiphertexts: Array<CommitmentCiphertext>
}> {
    const data = events.Transact.decode(e);
    const ciphertextStructs = data.ciphertext;

    const ciphertexts = new Array<Ciphertext>();
    const transactCommitments = new Array<TransactCommitment>();
    const commitmentCiphertexts = new Array<CommitmentCiphertext>();

    for (let i = 0; i < ciphertextStructs.length; i++) {
        const ciphertextStruct = ciphertextStructs[i];

        const treePosition = data.startPosition + BigInt(i);
        const id = idFrom2PaddedBigInts(data.treeNumber, treePosition);
        const ciphertext = parseCiphertext(id, ciphertextStruct.ciphertext.map((ct) => padHexStringToEven(ct)));
        ciphertexts.push(ciphertext);

        const commitmentCiphertext = new CommitmentCiphertext({
            id,
            ciphertext,
            blindedSenderViewingKey: hexStringToBytes(ciphertextStruct.blindedSenderViewingKey),
            blindedReceiverViewingKey: hexStringToBytes(ciphertextStruct.blindedReceiverViewingKey),
            annotationData: hexStringToBytes(ciphertextStruct.annotationData),
            memo: hexStringToBytes(ciphertextStruct.memo),
        });
        commitmentCiphertexts.push(commitmentCiphertext);

        transactCommitments.push(new TransactCommitment({
            id,
            blockNumber: BigInt(e.block.height),
            blockTimestamp: BigInt(e.block.timestamp) / 1000n,
            transactionHash: hexStringToBytes(e.transaction.hash),
            treeNumber: Number(data.treeNumber),
            batchStartTreePosition: Number(data.startPosition),
            treePosition: Number(treePosition),
            commitmentType: CommitmentType.TransactCommitment,
            hash: BigInt(data.hash[i]),
            ciphertext: commitmentCiphertext
        }));
    }

    const id = idFrom2PaddedBigInts(BigInt(e.block.height), BigInt(e.transactionIndex));
    await ctx.store.upsert(new CommitmentBatchEventNew({ id, treeNumber: data.treeNumber, batchStartTreePosition: data.startPosition }));

    return {
        ciphertexts,
        transactCommitments,
        commitmentCiphertexts
    };
}

export function handleUnshield(e: EvmProcessorLog): {
    token: Token,
    unshield: Unshield
} {
    const data = events.Unshield.decode(e);
    const id = idFromEventLogIndex(e);

    const { tokenType, tokenAddress, tokenSubID } = data.token;
    const token = createToken(tokenType, tokenAddress, tokenSubID);

    const unshield = new Unshield({
        id,
        blockNumber: BigInt(e.block.height),
        blockTimestamp: BigInt(e.block.timestamp) / 1000n,
        transactionHash: hexStringToBytes(e.transaction.hash),
        to: hexStringToBytes(data.to),
        token,
        amount: data.amount,
        fee: data.fee,
        eventLogIndex: BigInt(e.logIndex)
    })

    return { token, unshield };
}

export async function handleShield(e: EvmProcessorLog, ctx: ProcessingContext): Promise<{
    tokens: Map<string, Token>,
    commitmentPreimages: Array<CommitmentPreimage>
    shieldCommitments: Array<ShieldCommitment>
}> {
    let data = null;
    if (e.topics[0] === events['Shield(uint256,uint256,(bytes32,(uint8,address,uint256),uint120)[],(bytes32[3],bytes32)[],uint256[])'].topic) {
        data = events['Shield(uint256,uint256,(bytes32,(uint8,address,uint256),uint120)[],(bytes32[3],bytes32)[],uint256[])'].decode(e);
    }
    else if (e.topics[0] === events['Shield(uint256,uint256,(bytes32,(uint8,address,uint256),uint120)[],(bytes32[3],bytes32)[])'].topic) {
        data = events['Shield(uint256,uint256,(bytes32,(uint8,address,uint256),uint120)[],(bytes32[3],bytes32)[])'].decode(e) // ShieldLegacyPreMar23
    }
    else throw new Error("Undefined shield event");

    const commitments = data.commitments;
    let tokens = new Map<string, Token>();
    let commitmentPreimages = new Array<CommitmentPreimage>();
    let shieldCommitments = new Array<ShieldCommitment>();

    for (let i = 0; i < commitments.length; i++) {
        const commitment = commitments[i];

        const treePosition = data.startPosition + BigInt(i)
        const id = idFrom2PaddedBigInts(data.treeNumber, treePosition);

        const { tokenType, tokenAddress, tokenSubID } = commitment.token;
        const token = createToken(tokenType, tokenAddress, tokenSubID);
        tokens.set(token.id, token);

        const preimage = new CommitmentPreimage({
            id,
            npk: hexStringToBytes(commitment.npk),
            token,
            value: commitment.value
        });
        commitmentPreimages.push(preimage);

        const commitmentHash = await getNoteHash(
            ctx,
            BigInt(commitment.npk),
            BigInt(token.id),
            commitment.value,
        );

        // fee is not present in new LegacyShield
        const fee = (data as any).fees ? (data as any).fees[i] : null;
        const encryptedBundle = data.shieldCiphertext[i].encryptedBundle.map(bundle => bigIntToPad32Bytes(BigInt(bundle)));
        const shieldCommitment = new ShieldCommitment({
            id,
            blockNumber: BigInt(e.block.height),
            blockTimestamp: BigInt(e.block.timestamp) / 1000n,
            transactionHash: hexStringToBytes(e.transaction.hash),
            treeNumber: Number(data.treeNumber),
            batchStartTreePosition: Number(data.startPosition),
            treePosition: Number(treePosition),
            commitmentType: CommitmentType.ShieldCommitment,
            hash: commitmentHash as bigint,
            preimage,
            encryptedBundle,
            shieldKey: hexStringToBytes(data.shieldCiphertext[i].shieldKey),
            fee
        });
        shieldCommitments.push(shieldCommitment);
    }

    return {
        tokens,
        commitmentPreimages,
        shieldCommitments
    };
}

/*
// Engine V3 (Nov 2022)
export async function handleShieldLegacyPreMar23(e: EvmProcessorLog, ctx: any): Promise<{
    tokens: Map<string, Token>,
    commitmentPreimages: Array<CommitmentPreimage>
    shieldCommitments: Array<ShieldCommitment>
}> {
    const data = events['Shield(uint256,uint256,(bytes32,(uint8,address,uint256),uint120)[],(bytes32[3],bytes32)[])'].decode(e);
    const commitments = data.commitments;

    let tokens = new Map<string, Token>();
    let commitmentPreimages = new Array<CommitmentPreimage>();
    let shieldCommitments = new Array<ShieldCommitment>();

    for (let i = 0; i < commitments.length; i++) {
        const commitment = commitments[i];
        const treePosition = data.startPosition + BigInt(i)
        const id = idFrom2PaddedBigInts(data.treeNumber, treePosition);

        const { tokenType, tokenAddress, tokenSubID } = commitment.token;
        const token = createToken(tokenType, tokenAddress, tokenSubID);
        tokens.set(token.id, token);

        const preimage = new CommitmentPreimage({
            id,
            npk: hexStringToBytes(commitment.npk),
            token,
            value: commitment.value
        });
        commitmentPreimages.push(preimage);

        const commitmentHash = await getNoteHash(
            ctx,
            BigInt(commitment.npk),
            BigInt(token.id),
            commitment.value,
        );

        const encryptedBundle = data.shieldCiphertext[i].encryptedBundle.map(bundle => bigIntToPaddedBytes(BigInt(bundle)));
        const shieldCommitment = new ShieldCommitment({
            id,
            blockNumber: BigInt(e.block.height),
            blockTimestamp: BigInt(e.block.timestamp),
            transactionHash: hexStringToBytes(e.transaction.hash),
            treeNumber: Number(data.treeNumber),
            batchStartTreePosition: Number(data.startPosition),
            treePosition: Number(treePosition),
            commitmentType: CommitmentType.ShieldCommitment,
            hash: commitmentHash as bigint,
            preimage,
            encryptedBundle,
            shieldKey: hexStringToBytes(data.shieldCiphertext[i].shieldKey),
            fee: null
        });
        shieldCommitments.push(shieldCommitment);
    }
    return { tokens, commitmentPreimages, shieldCommitments };
}
*/