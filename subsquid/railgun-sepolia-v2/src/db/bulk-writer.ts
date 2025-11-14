import {
  DataSource,
  EntityTarget,
  ObjectLiteral,
  QueryRunner,
} from "typeorm";
import {
  Ciphertext,
  CommitmentBatchEventNew,
  CommitmentCiphertext,
  CommitmentPreimage,
  LegacyCommitmentCiphertext,
  LegacyEncryptedCommitment,
  LegacyGeneratedCommitment,
  Nullifier,
  ShieldCommitment,
  Token,
  Transaction,
  TransactCommitment,
  Unshield,
  VerificationHash,
} from "../model";

export type PersistableBatch = {
  tokens?: Token[];
  commitmentPreimages?: CommitmentPreimage[];
  ciphertexts?: Ciphertext[];
  legacyCommitmentCiphertexts?: LegacyCommitmentCiphertext[];
  commitmentCiphertexts?: CommitmentCiphertext[];
  legacyEncryptedCommitments?: LegacyEncryptedCommitment[];
  legacyGeneratedCommitments?: LegacyGeneratedCommitment[];
  transactCommitments?: TransactCommitment[];
  shieldCommitments?: ShieldCommitment[];
  transactions?: Transaction[];
  nullifiers?: Nullifier[];
  unshields?: Unshield[];
  commitmentBatchEvents?: CommitmentBatchEventNew[];
  verificationHashes?: VerificationHash[];
};

const UPSERT_BATCH_SIZE = 500;

export class BulkWriter {
  constructor(private readonly dataSource: DataSource) {}

  async persist(batch: PersistableBatch): Promise<void> {
    if (this.isBatchEmpty(batch)) {
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.upsert(queryRunner, Token, batch.tokens);
      await this.upsert(queryRunner, CommitmentBatchEventNew, batch.commitmentBatchEvents);
      await this.upsert(queryRunner, Nullifier, batch.nullifiers);
      await this.upsert(queryRunner, Ciphertext, batch.ciphertexts);
      await this.upsert(queryRunner, LegacyCommitmentCiphertext, batch.legacyCommitmentCiphertexts);
      await this.upsert(queryRunner, CommitmentCiphertext, batch.commitmentCiphertexts);
      await this.upsert(queryRunner, LegacyEncryptedCommitment, batch.legacyEncryptedCommitments);
      await this.upsert(queryRunner, CommitmentPreimage, batch.commitmentPreimages);
      await this.upsert(queryRunner, LegacyGeneratedCommitment, batch.legacyGeneratedCommitments);
      await this.upsert(queryRunner, ShieldCommitment, batch.shieldCommitments);
      await this.upsert(queryRunner, TransactCommitment, batch.transactCommitments);
      await this.upsert(queryRunner, Transaction, batch.transactions);
      await this.upsert(queryRunner, Unshield, batch.unshields);
      await this.upsert(queryRunner, VerificationHash, batch.verificationHashes);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async upsert<T extends ObjectLiteral>(
    queryRunner: QueryRunner,
    entity: EntityTarget<T>,
    records: T[] | undefined
  ): Promise<void> {
    if (!records || records.length === 0) return;

    const connection = queryRunner.manager.connection;
    const metadata = connection.getMetadata(entity);

    const columns = metadata.columns.filter((column) => !column.isGenerated);
    const updateColumns = columns
      .filter((column) => !column.isPrimary)
      .map((column) => `"${column.databaseName}" = excluded."${column.databaseName}"`);

    const conflict = updateColumns.length
      ? `("id") DO UPDATE SET ${updateColumns.join(", ")}`
      : `("id") DO NOTHING`;

    for (const chunk of chunkArray(records, UPSERT_BATCH_SIZE)) {
      await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into(entity as EntityTarget<ObjectLiteral>)
        .values(chunk)
        .onConflict(conflict)
        .execute();
    }
  }

  private isBatchEmpty(batch: PersistableBatch): boolean {
    return Object.values(batch).every((value) => !value || value.length === 0);
  }
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

