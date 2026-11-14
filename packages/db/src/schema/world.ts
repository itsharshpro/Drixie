import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
} from "drizzle-orm/pg-core";
import { tstz } from "./columns";

export type WorldTagStatus = "unscored" | "scored" | "failed";

export const worldNews = pgTable(
  "world_news",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    url: text("url").notNull().unique("world_news_url_uq"),
    title: text("title").notNull(),

    domain: text("domain").notNull(),

    source: text("source").notNull(),

    language: text("language"),
    sourceCountry: text("source_country"),

    snippet: text("snippet"),
    publishedAt: tstz("published_at").notNull(),
    fetchedAt: tstz("fetched_at").notNull().defaultNow(),

    tagStatus: text("tag_status").$type<WorldTagStatus>().notNull().default("unscored"),

    companies: text("companies").array().notNull().default(sql`'{}'::text[]`),

    services: text("services").array().notNull().default(sql`'{}'::text[]`),

    sentiment: smallint("sentiment"),

    reason: text("reason"),

    taggedBy: text("tagged_by"),
    taggedAt: tstz("tagged_at"),
    tagAttempts: integer("tag_attempts").notNull().default(0),
  },
  (t) => [
    index("world_news_published_idx").on(t.publishedAt),
    index("world_news_status_idx").on(t.tagStatus, t.publishedAt),
    index("world_news_companies_gin").using("gin", t.companies),
    check("world_news_sentiment_range", sql`${t.sentiment} IS NULL OR (${t.sentiment} BETWEEN -2 AND 2)`),
  ],
);

export const worldPrices = pgTable(
  "world_prices",
  {
    symbol: text("symbol").notNull(),

    date: date("date", { mode: "string" }).notNull(),
    open: doublePrecision("open"),
    high: doublePrecision("high"),
    low: doublePrecision("low"),
    close: doublePrecision("close").notNull(),
    volume: bigint("volume", { mode: "number" }),

    source: text("source").notNull(),
    fetchedAt: tstz("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.date] }), index("world_prices_date_idx").on(t.date)],
);

