import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_} from "typeorm"

@Entity_()
export class Ciphertext {
    constructor(props?: Partial<Ciphertext>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Column_("bytea", {nullable: false})
    iv!: Uint8Array

    @Column_("bytea", {nullable: false})
    tag!: Uint8Array

    @Column_("bytea", {array: true, nullable: false})
    data!: (Uint8Array)[]
}
