import { EntityTarget } from "typeorm";
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
import { PersistableBatch } from "../db/bulk-writer";

type EntityConstructor<T> = EntityTarget<T> & { name: string };

type StorageMap = Map<string, Map<string, unknown>>;

export class MemoryStore {
  private storage: StorageMap = new Map();
  private dirtyEntities = new Set<string>();

  constructor(seed?: PersistableBatch) {
    if (seed) {
      this.seedFromBatch(seed);
    }
  }

  async upsert<T>(entities: T | T[]): Promise<void> {
    const list = Array.isArray(entities) ? entities : [entities];
    for (const entity of list) {
      if (entity == null) continue;
      const ctor = (entity as any).constructor;
      const entityName = ctor.name;
      const id = (entity as any).id as string;
      if (!id) {
        throw new Error(`Entity ${entityName} is missing id`);
      }
      let records = this.storage.get(entityName);
      if (!records) {
        records = new Map();
        this.storage.set(entityName, records);
      }
      records.set(id, entity);
      this.dirtyEntities.add(entityName);
    }
  }

  async findOneBy<T>(
    entity: EntityConstructor<T>,
    where: Partial<Record<keyof T, unknown>>
  ): Promise<T | undefined> {
    const entityName = entity.name;
    const records = this.storage.get(entityName);
    if (!records) return undefined;

    if ("id" in where && where.id != null) {
      return records.get(where.id as string) as T | undefined;
    }

    for (const record of records.values()) {
      let match = true;
      for (const [key, value] of Object.entries(where)) {
        if ((record as any)[key] !== value) {
          match = false;
          break;
        }
      }
      if (match) {
        return record as T;
      }
    }

    return undefined;
  }

  seedFromBatch(batch: PersistableBatch): void {
    Object.entries(batch).forEach(([key, value]) => {
      if (!value) return;
      for (const entity of value) {
        const ctorName = (entity as any).constructor.name;
        let records = this.storage.get(ctorName);
        if (!records) {
          records = new Map();
          this.storage.set(ctorName, records);
        }
        records.set((entity as any).id, entity);
      }
    });
  }

  extractPersistableBatch(): PersistableBatch {
    const batch: PersistableBatch = {};

    const assign = <T>(entity: EntityConstructor<T>, key: keyof PersistableBatch) => {
      const records = this.storage.get(entity.name);
      if (!records || records.size === 0) return;
      if (!this.dirtyEntities.has(entity.name)) return;
      (batch as any)[key] = Array.from(records.values()) as T[];
    };

    assign(Token, "tokens");
    assign(CommitmentBatchEventNew, "commitmentBatchEvents");
    assign(Nullifier, "nullifiers");
    assign(Ciphertext, "ciphertexts");
    assign(LegacyCommitmentCiphertext, "legacyCommitmentCiphertexts");
    assign(CommitmentCiphertext, "commitmentCiphertexts");
    assign(LegacyEncryptedCommitment, "legacyEncryptedCommitments");
    assign(CommitmentPreimage, "commitmentPreimages");
    assign(LegacyGeneratedCommitment, "legacyGeneratedCommitments");
    assign(ShieldCommitment, "shieldCommitments");
    assign(TransactCommitment, "transactCommitments");
    assign(Transaction, "transactions");
    assign(Unshield, "unshields");
    assign(VerificationHash, "verificationHashes");

    return batch;
  }

  getVerificationHash(): VerificationHash | undefined {
    const records = this.storage.get(VerificationHash.name);
    if (!records) return undefined;
    return records.get("0x") as VerificationHash | undefined;
  }

  clearDirty(): void {
    this.dirtyEntities.clear();
  }
}

