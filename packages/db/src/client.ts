import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index";
import { databaseUrl } from "./env";

export type Schema = typeof schema;
export type Db = PostgresJsDatabase<Schema>;

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export interface DbHandle {
  db: Db;
  sql: postgres.Sql;
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  url?: string;
  max?: number;

  appName?: string;
}

export function createDb(opts: CreateDbOptions = {}): DbHandle {
  const url = opts.url ?? databaseUrl();
  const sql = postgres(url, {
    max: opts.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
    connection: { application_name: opts.appName ?? "listed" },
  });
  const db = drizzle(sql, { schema });
  return { db, sql, close: () => sql.end({ timeout: 5 }) };
}
