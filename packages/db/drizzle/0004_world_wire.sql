CREATE TABLE "compute_weather" (
	"date" date PRIMARY KEY NOT NULL,
	"index_bps" integer NOT NULL,
	"avg_change_bps" integer NOT NULL,
	"inputs" jsonb NOT NULL,
	"source" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"chain_status" text DEFAULT 'pending' NOT NULL,
	"tx_hash" text,
	"posted_at" timestamp with time zone,
	"chain_error" text,
	CONSTRAINT "compute_weather_index_range" CHECK ("compute_weather"."index_bps" BETWEEN 5000 AND 20000)
);
--> statement-breakpoint
CREATE TABLE "world_news" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"domain" text NOT NULL,
	"source" text NOT NULL,
	"language" text,
	"source_country" text,
	"snippet" text,
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tag_status" text DEFAULT 'unscored' NOT NULL,
	"companies" text[] DEFAULT '{}'::text[] NOT NULL,
	"services" text[] DEFAULT '{}'::text[] NOT NULL,
	"sentiment" smallint,
	"reason" text,
	"tagged_by" text,
	"tagged_at" timestamp with time zone,
	"tag_attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "world_news_url_uq" UNIQUE("url"),
	CONSTRAINT "world_news_sentiment_range" CHECK ("world_news"."sentiment" IS NULL OR ("world_news"."sentiment" BETWEEN -2 AND 2))
);
--> statement-breakpoint
CREATE TABLE "world_prices" (
	"symbol" text NOT NULL,
	"date" date NOT NULL,
	"open" double precision,
	"high" double precision,
	"low" double precision,
	"close" double precision NOT NULL,
	"volume" bigint,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_prices_symbol_date_pk" PRIMARY KEY("symbol","date")
);
--> statement-breakpoint
CREATE INDEX "world_news_published_idx" ON "world_news" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "world_news_status_idx" ON "world_news" USING btree ("tag_status","published_at");--> statement-breakpoint
CREATE INDEX "world_news_companies_gin" ON "world_news" USING gin ("companies");--> statement-breakpoint
CREATE INDEX "world_prices_date_idx" ON "world_prices" USING btree ("date");
