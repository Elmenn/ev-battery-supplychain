import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, Index as Index_} from "typeorm"
import * as marshal from "./marshal"

@Index_(["blockNumber", "nullifier"], {unique: false})
@Entity_()
export class Nullifier {
    constructor(props?: Partial<Nullifier>) {
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

    @Column_("bytea", {nullable: false})
    nullifier!: Uint8Array
}
