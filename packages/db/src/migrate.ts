import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { databaseUrl } from "./env";

export const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");

export async function runMigrations(url: string = databaseUrl()): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runMigrations()
    .then(() => {
      console.log("migrations applied");
    })
    .catch((err: unknown) => {
      console.error("migration failed:", err);
      process.exit(1);
    });
}
