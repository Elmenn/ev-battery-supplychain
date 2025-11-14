import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, Index as Index_, ManyToOne as ManyToOne_} from "typeorm"
import * as marshal from "./marshal"
import {CommitmentType} from "./_commitmentType"
import {CommitmentPreimage} from "./commitmentPreimage.model"

@Index_(["blockNumber", "treePosition"], {unique: false})
@Entity_()
export class LegacyGeneratedCommitment {
    constructor(props?: Partial<LegacyGeneratedCommitment>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
    blockNumber!: bigint

    @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
    blockTimestamp!: bigint

    @Column_("bytea", {nullable: false})
    transactionHash!: Uint8Array

    @Column_("int4", {nullable: false})
    treeNumber!: number

    @Column_("int4", {nullable: false})
    batchStartTreePosition!: number

    @Column_("int4", {nullable: false})
    treePosition!: number

    @Column_("varchar", {length: 25, nullable: false})
    commitmentType!: CommitmentType

    @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
    hash!: bigint

    @Index_()
    @ManyToOne_(() => CommitmentPreimage, {nullable: true})
    preimage!: CommitmentPreimage

    @Column_("bytea", {array: true, nullable: false})
    encryptedRandom!: (Uint8Array)[]
}
