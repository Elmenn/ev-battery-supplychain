import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_, ManyToOne as ManyToOne_, Index as Index_} from "typeorm"
import {Ciphertext} from "./ciphertext.model"

@Entity_()
export class LegacyCommitmentCiphertext {
    constructor(props?: Partial<LegacyCommitmentCiphertext>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Index_()
    @ManyToOne_(() => Ciphertext, {nullable: true})
    ciphertext!: Ciphertext

    @Column_("bytea", {array: true, nullable: false})
    ephemeralKeys!: (Uint8Array)[]

    @Column_("bytea", {array: true, nullable: false})
    memo!: (Uint8Array)[]
}
