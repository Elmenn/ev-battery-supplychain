import {Entity as Entity_, Column as Column_, PrimaryColumn as PrimaryColumn_} from "typeorm"
import {TokenType} from "./_tokenType"

@Entity_()
export class Token {
    constructor(props?: Partial<Token>) {
        Object.assign(this, props)
    }

    @PrimaryColumn_()
    id!: string

    @Column_("varchar", {length: 7, nullable: false})
    tokenType!: TokenType

    @Column_("bytea", {nullable: false})
    tokenAddress!: Uint8Array

    @Column_("text", {nullable: false})
    tokenSubID!: string
}
