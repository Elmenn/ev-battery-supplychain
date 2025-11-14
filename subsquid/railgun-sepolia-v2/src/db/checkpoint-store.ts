import { DataSource } from "typeorm";

export type CheckpointPayload = {
  blockNumber: number;
  commitmentTreeNumber: number;
  commitmentTreePosition: number;
  transactionIndex?: number;
};

export type CheckpointRecord = CheckpointPayload & {
  updatedAt: Date;
};

const TABLE_NAME = "ingest_checkpoint";

export class CheckpointStore {
  private readonly table: string;

  constructor(private readonly dataSource: DataSource) {
    const schema = (dataSource.options as any).schema;
    this.table = schema ? `"${schema}"."${TABLE_NAME}"` : `"${TABLE_NAME}"`;
  }

  async init(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        id TEXT PRIMARY KEY,
        block_number BIGINT NOT NULL,
        commitment_tree_number INTEGER NOT NULL,
        commitment_tree_position BIGINT NOT NULL,
        transaction_index INTEGER,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  async load(id: string): Promise<CheckpointRecord | undefined> {
    const rows = await this.dataSource.query(
      `SELECT block_number, commitment_tree_number, commitment_tree_position, transaction_index, updated_at
       FROM ${this.table}
       WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return undefined;
    }

    const row = rows[0];
    return {
      blockNumber: Number(row.block_number),
      commitmentTreeNumber: Number(row.commitment_tree_number),
      commitmentTreePosition: Number(row.commitment_tree_position),
      transactionIndex:
        row.transaction_index != null ? Number(row.transaction_index) : undefined,
      updatedAt: new Date(row.updated_at),
    };
  }

  async save(id: string, payload: CheckpointPayload): Promise<void> {
    await this.dataSource.query(
      `
      INSERT INTO ${this.table} (id, block_number, commitment_tree_number, commitment_tree_position, transaction_index, updated_at)
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (id)
      DO UPDATE SET
        block_number = excluded.block_number,
        commitment_tree_number = excluded.commitment_tree_number,
        commitment_tree_position = excluded.commitment_tree_position,
        transaction_index = excluded.transaction_index,
        updated_at = now()
    `,
      [
        id,
        payload.blockNumber,
        payload.commitmentTreeNumber,
        payload.commitmentTreePosition,
        payload.transactionIndex ?? null,
      ]
    );
  }
}

