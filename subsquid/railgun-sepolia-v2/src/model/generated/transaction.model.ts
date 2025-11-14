import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"
import * as marshal from "./marshal"
import {Token} from "./token.model"

@Entity_()
export class Transaction {
    constructor(props?: Partial<Transaction>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
    blockNumber!: bigint

    @Column_("bytea", {nullable: false})
    transactionHash!: Uint8Array

    @Column_("bytea", {nullable: false})
    merkleRoot!: Uint8Array

    @Column_("bytea", {array: true, nullable: false})
    nullifiers!: (Uint8Array)[]

    @Column_("bytea", {array: true, nullable: false})
    commitments!: (Uint8Array)[]

    @Column_("bytea", {nullable: false})
    boundParamsHash!: Uint8Array

    @Column_("bool", {nullable: false})
    hasUnshield!: boolean

    @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
    utxoTreeIn!: bigint

    @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
    utxoTreeOut!: bigint

    @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
    utxoBatchStartPositionOut!: bigint

    @Index_()
    @ManyToOne_(() => Token, {nullable: true})
    unshieldToken!: Token

    @Column_("bytea", {nullable: false})
    unshieldToAddress!: Uint8Array

    @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
    unshieldValue!: bigint

    @Column_("numeric", {transformer: marshal.bigintTransformer, nullable: false})
    blockTimestamp!: bigint

    @Column_("bytea", {nullable: false})
    verificationHash!: Uint8Array
}
