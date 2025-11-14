import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"
import {Ciphertext} from "./ciphertext.model"

@Entity_()
export class CommitmentCiphertext {
    constructor(props?: Partial<CommitmentCiphertext>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @ManyToOne_(() => Ciphertext, {nullable: true})
    ciphertext!: Ciphertext

    @Column_("bytea", {nullable: false})
    blindedSenderViewingKey!: Uint8Array

    @Column_("bytea", {nullable: false})
    blindedReceiverViewingKey!: Uint8Array

    @Column_("bytea", {nullable: false})
    annotationData!: Uint8Array

    @Column_("bytea", {nullable: false})
    memo!: Uint8Array
}
