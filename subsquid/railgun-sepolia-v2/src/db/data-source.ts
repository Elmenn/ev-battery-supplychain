import { DataSource } from "typeorm";
import * as model from "../model";

type NullableString = string | undefined | null;

const DEFAULT_PORT = 5432;

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    if (fallback != null) return fallback;
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

function parsePort(value: NullableString): number {
  if (value == null || value.length === 0) {
    return DEFAULT_PORT;
  }
  const port = Number.parseInt(value, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid DB_PORT value "${value}"`);
  }
  return port;
}

function collectEntities(): Function[] {
  const entities: Function[] = [];
  for (const value of Object.values(model)) {
    if (
      typeof value === "function" &&
      value.name &&
      value.prototype &&
      value.prototype.constructor === value
    ) {
      entities.push(value);
    }
  }
  return entities;
}

export async function createDataSource(): Promise<DataSource> {
  const host = requireEnv("DB_HOST", "localhost");
  const port = parsePort(process.env.DB_PORT);
  const username = requireEnv("DB_USER", "postgres");
  const password = requireEnv("DB_PASS", "postgres");
  const database = requireEnv("DB_NAME", "squid");
  const schema = process.env.DB_SCHEMA;

  const sslMode = process.env.DB_SSL?.toLowerCase();
  let ssl: boolean | { rejectUnauthorized: boolean } | undefined;
  if (sslMode === "true") {
    ssl = true;
  } else if (sslMode === "false" || sslMode == null) {
    ssl = undefined;
  } else if (sslMode === "no-verify") {
    ssl = { rejectUnauthorized: false };
  }

  const dataSource = new DataSource({
    type: "postgres",
    host,
    port,
    username,
    password,
    database,
    schema,
    entities: collectEntities(),
    synchronize: false,
    logging: process.env.TYPEORM_LOGGING === "true",
    ssl,
  });

  await dataSource.initialize();
  return dataSource;
}

