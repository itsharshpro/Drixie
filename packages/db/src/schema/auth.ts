import { boolean, index, jsonb, pgTable, text, uniqueIndex, uuid, bigint } from "drizzle-orm/pg-core";
import { bytea, tstz } from "./columns";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    handle: text("handle"),
    email: text("email"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_handle_uq").on(t.handle), uniqueIndex("users_email_uq").on(t.email)],
);

export const passkeys = pgTable(
  "passkeys",
  {
    id: text("id").primaryKey(), // credential id (base64url)
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    webauthnUserId: text("webauthn_user_id").notNull(),
    publicKey: bytea("public_key").notNull(),
    counter: bigint("counter", { mode: "number" }).notNull().default(0),
    transports: jsonb("transports").$type<string[]>().notNull().default([]),
    deviceType: text("device_type"),
    backedUp: boolean("backed_up").notNull().default(false),
    createdAt: tstz("created_at").notNull().defaultNow(),
    lastUsedAt: tstz("last_used_at"),
  },
  (t) => [index("passkeys_user_idx").on(t.userId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: tstz("created_at").notNull().defaultNow(),
    expiresAt: tstz("expires_at").notNull(),
    lastSeenAt: tstz("last_seen_at").notNull().defaultNow(),
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const emailTokens = pgTable(
  "email_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: text("email").notNull(),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
    createdAt: tstz("created_at").notNull().defaultNow(),

    requestedBy: uuid("requested_by"),

    browserHash: text("browser_hash"),
  },
  (t) => [index("email_tokens_email_idx").on(t.email, t.createdAt)],
);

export const authChallenges = pgTable(
  "auth_challenges",
  {
    challenge: text("challenge").primaryKey(),

    kind: text("kind").$type<"register" | "login" | "account">().notNull(),
    userId: uuid("user_id"),
    handle: text("handle"),
    webauthnUserId: text("webauthn_user_id"),
    expiresAt: tstz("expires_at").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("auth_challenges_expires_idx").on(t.expiresAt)],
);

export const playerAccounts = pgTable(
  "player_accounts",
  {
    accountId: text("account_id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    handle: text("handle").notNull(),
    publicKey: text("public_key").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),

    createdIp: text("created_ip"),

    funded: boolean("funded").notNull().default(true),
  },
  (t) => [
    uniqueIndex("player_accounts_user_uq").on(t.userId),
    uniqueIndex("player_accounts_handle_uq").on(t.handle),
    index("player_accounts_ip_idx").on(t.createdIp, t.createdAt),
    index("player_accounts_created_idx").on(t.createdAt),
  ],
);
