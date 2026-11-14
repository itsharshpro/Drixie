CREATE TABLE "fund_balances" (
	"fund" text NOT NULL,
	"account" text NOT NULL,
	"coins" numeric DEFAULT '0' NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"first_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fund_balances_fund_account_pk" PRIMARY KEY("fund","account")
);
--> statement-breakpoint
CREATE TABLE "fund_bells" (
	"bell" integer PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"prices_hash" text,
	"spy" double precision,
	"tx_hash" text
);
--> statement-breakpoint
CREATE TABLE "fund_brain_bills" (
	"id" text PRIMARY KEY NOT NULL,
	"fund" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"bell" integer,
	"tier" text NOT NULL,
	"think" text DEFAULT 'normal' NOT NULL,
	"ai_cost_usd" double precision DEFAULT 0 NOT NULL,
	"multiplier" double precision DEFAULT 20000 NOT NULL,
	"usd" double precision NOT NULL,
	"charged_bell" integer
);
--> statement-breakpoint
CREATE TABLE "fund_candles" (
	"fund" text NOT NULL,
	"interval" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume_usd" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "fund_candles_fund_interval_bucket_pk" PRIMARY KEY("fund","interval","bucket")
);
--> statement-breakpoint
CREATE TABLE "fund_commits" (
	"fund" text NOT NULL,
	"bell" integer NOT NULL,
	"hash" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"revealed" boolean DEFAULT false NOT NULL,
	"tx_hash" text,
	CONSTRAINT "fund_commits_fund_bell_pk" PRIMARY KEY("fund","bell")
);
--> statement-breakpoint
CREATE TABLE "fund_cross_holdings" (
	"holder" text NOT NULL,
	"target" text NOT NULL,
	"coins" numeric DEFAULT '0' NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fund_cross_holdings_holder_target_pk" PRIMARY KEY("holder","target")
);
--> statement-breakpoint
CREATE TABLE "fund_cursor" (
	"id" text PRIMARY KEY NOT NULL,
	"contract" text NOT NULL,
	"height" bigint NOT NULL,
	"block_hash" text,
	"deployed_at" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"fund" text,
	"account" text,
	"data" jsonb NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"block_height" bigint NOT NULL,
	"tx_hash" text NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_fees" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fund" text NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric DEFAULT '0' NOT NULL,
	"usd" double precision,
	"to" text,
	"quarter" integer,
	"at" timestamp with time zone NOT NULL,
	"tx_hash" text NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_nav_history" (
	"fund" text NOT NULL,
	"bell" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"nav_micro" numeric NOT NULL,
	"value_micro" numeric NOT NULL,
	"nav" double precision NOT NULL,
	"value_usd" double precision NOT NULL,
	"supply" numeric,
	"spy" double precision,
	"tx_hash" text,
	CONSTRAINT "fund_nav_history_fund_bell_pk" PRIMARY KEY("fund","bell")
);
--> statement-breakpoint
CREATE TABLE "fund_nfts" (
	"token_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"owner" text NOT NULL,
	"fund" text,
	"title" text NOT NULL,
	"description" text,
	"edition" integer,
	"bell" integer,
	"season" integer,
	"badge_kind" text,
	"soulbound" boolean DEFAULT false NOT NULL,
	"extra" jsonb,
	"burned" boolean DEFAULT false NOT NULL,
	"minted_at" timestamp with time zone NOT NULL,
	"tx_hash" text
);
--> statement-breakpoint
CREATE TABLE "fund_notes" (
	"fund" text NOT NULL,
	"bell" integer NOT NULL,
	"note" text NOT NULL,
	"think" text DEFAULT 'normal' NOT NULL,
	"tier" text DEFAULT 'primary' NOT NULL,
	"autopilot" boolean DEFAULT false NOT NULL,
	"adjusted" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "fund_notes_fund_bell_pk" PRIMARY KEY("fund","bell")
);
--> statement-breakpoint
CREATE TABLE "fund_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"fund" text NOT NULL,
	"account" text NOT NULL,
	"side" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"amount" numeric NOT NULL,
	"amount_usd" double precision DEFAULT 0 NOT NULL,
	"filled" numeric,
	"fill_nav_micro" numeric,
	"fill_bell" integer,
	"exit_load_bps" integer,
	"queued_at" timestamp with time zone NOT NULL,
	"filled_at" timestamp with time zone,
	"tx_hash" text,
	"fill_tx_hash" text
);
--> statement-breakpoint
CREATE TABLE "fund_promises" (
	"fund" text NOT NULL,
	"season" integer NOT NULL,
	"target_bps" integer NOT NULL,
	"bond_bps" integer NOT NULL,
	"bond_coins" numeric,
	"status" text DEFAULT 'open' NOT NULL,
	"compensation" numeric,
	"user_return_bps" integer,
	"set_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"tx_hash" text,
	CONSTRAINT "fund_promises_fund_season_pk" PRIMARY KEY("fund","season")
);
--> statement-breakpoint
CREATE TABLE "fund_quarters" (
	"season" integer NOT NULL,
	"quarter" integer NOT NULL,
	"closed_at" timestamp with time zone,
	"winner" text,
	"results" jsonb,
	"spy_ret" double precision,
	"tx_hash" text,
	CONSTRAINT "fund_quarters_season_quarter_pk" PRIMARY KEY("season","quarter")
);
--> statement-breakpoint
CREATE TABLE "fund_reputation_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fund" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"delta" double precision NOT NULL,
	"score" double precision NOT NULL,
	"reason" text NOT NULL,
	"bell" integer,
	"source" text NOT NULL,
	"key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_reputation_scores" (
	"fund" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"score" double precision NOT NULL,
	"anchored" boolean DEFAULT false NOT NULL,
	"quarter" integer,
	"root" text,
	"tx_hash" text,
	CONSTRAINT "fund_reputation_scores_fund_at_pk" PRIMARY KEY("fund","at")
);
--> statement-breakpoint
CREATE TABLE "fund_seasons" (
	"season" integer PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone,
	"bell_secs" integer DEFAULT 900 NOT NULL,
	"quarter_secs" integer DEFAULT 86400 NOT NULL,
	"quarters" smallint DEFAULT 4 NOT NULL,
	"game_usd_per_near" double precision DEFAULT 100 NOT NULL,
	"settled_at" timestamp with time zone,
	"winner" text,
	"dna_revealed" boolean DEFAULT false NOT NULL,
	"start_values" jsonb,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "fund_seat_auctions" (
	"fund" text PRIMARY KEY NOT NULL,
	"open" boolean DEFAULT true NOT NULL,
	"high_bidder" text,
	"high_bid" numeric,
	"ends_at" timestamp with time zone,
	"winner" text,
	"settled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_trades" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fund" text NOT NULL,
	"account" text NOT NULL,
	"kind" text NOT NULL,
	"near_amount" numeric DEFAULT '0' NOT NULL,
	"coin_amount" numeric DEFAULT '0' NOT NULL,
	"price_usd" double precision,
	"usd" double precision,
	"at" timestamp with time zone NOT NULL,
	"tx_hash" text NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_weights_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fund" text NOT NULL,
	"bell" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"weights" jsonb NOT NULL,
	"cash_bps" integer DEFAULT 0 NOT NULL,
	"prev_weights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prev_cash_bps" integer DEFAULT 0 NOT NULL,
	"turnover_bps" integer DEFAULT 0 NOT NULL,
	"note" text,
	"edition" integer,
	"tx_hash" text NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mandate" text NOT NULL,
	"manager" text NOT NULL,
	"caps" jsonb NOT NULL,
	"seed_usd" double precision DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"supply" numeric DEFAULT '0' NOT NULL,
	"manager_stake" numeric DEFAULT '0' NOT NULL,
	"nav_micro" numeric DEFAULT '10000000' NOT NULL,
	"value_micro" numeric DEFAULT '0' NOT NULL,
	"last_bell" integer,
	"weights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cash_bps" integer DEFAULT 0 NOT NULL,
	"reputation" double precision DEFAULT 60 NOT NULL,
	"brain_tier" text DEFAULT 'primary' NOT NULL,
	"pool_near" numeric DEFAULT '0' NOT NULL,
	"pool_coin" numeric DEFAULT '0' NOT NULL,
	"pool_fee_bps" integer DEFAULT 30 NOT NULL,
	"dna" jsonb,
	"dna_committed" boolean DEFAULT false NOT NULL,
	"last_note" text,
	"raw" jsonb,
	"created_at" timestamp with time zone,
	"created_tx" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_profiles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account" text,
	"answers" jsonb NOT NULL,
	"profile" text NOT NULL,
	"points" smallint NOT NULL,
	"recommended" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fund_balances_account_idx" ON "fund_balances" USING btree ("account");--> statement-breakpoint
CREATE INDEX "fund_brain_bills_fund_at_idx" ON "fund_brain_bills" USING btree ("fund","at");--> statement-breakpoint
CREATE UNIQUE INDEX "fund_events_receipt_uq" ON "fund_events" USING btree ("receipt_id","log_index");--> statement-breakpoint
CREATE INDEX "fund_events_event_at_idx" ON "fund_events" USING btree ("event","at");--> statement-breakpoint
CREATE INDEX "fund_events_fund_at_idx" ON "fund_events" USING btree ("fund","at");--> statement-breakpoint
CREATE INDEX "fund_events_at_idx" ON "fund_events" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "fund_fees_receipt_uq" ON "fund_fees" USING btree ("receipt_id","log_index","kind");--> statement-breakpoint
CREATE INDEX "fund_fees_fund_idx" ON "fund_fees" USING btree ("fund","at");--> statement-breakpoint
CREATE INDEX "fund_nav_history_at_idx" ON "fund_nav_history" USING btree ("at");--> statement-breakpoint
CREATE INDEX "fund_nfts_owner_idx" ON "fund_nfts" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "fund_nfts_kind_fund_idx" ON "fund_nfts" USING btree ("kind","fund");--> statement-breakpoint
CREATE UNIQUE INDEX "fund_nfts_basket_edition_uq" ON "fund_nfts" USING btree ("fund","edition") WHERE kind = 'basket';--> statement-breakpoint
CREATE INDEX "fund_notes_at_idx" ON "fund_notes" USING btree ("at");--> statement-breakpoint
CREATE INDEX "fund_orders_account_idx" ON "fund_orders" USING btree ("account","queued_at");--> statement-breakpoint
CREATE INDEX "fund_orders_fund_idx" ON "fund_orders" USING btree ("fund","status");--> statement-breakpoint
CREATE UNIQUE INDEX "fund_reputation_events_key_uq" ON "fund_reputation_events" USING btree ("key");--> statement-breakpoint
CREATE INDEX "fund_reputation_events_fund_at_idx" ON "fund_reputation_events" USING btree ("fund","at");--> statement-breakpoint
CREATE UNIQUE INDEX "fund_trades_receipt_uq" ON "fund_trades" USING btree ("receipt_id","log_index","kind");--> statement-breakpoint
CREATE INDEX "fund_trades_fund_at_idx" ON "fund_trades" USING btree ("fund","at");--> statement-breakpoint
CREATE INDEX "fund_trades_account_idx" ON "fund_trades" USING btree ("account","at");--> statement-breakpoint
CREATE UNIQUE INDEX "fund_weights_history_receipt_uq" ON "fund_weights_history" USING btree ("receipt_id","log_index");--> statement-breakpoint
CREATE INDEX "fund_weights_history_fund_bell_idx" ON "fund_weights_history" USING btree ("fund","bell");--> statement-breakpoint
CREATE INDEX "fund_weights_history_at_idx" ON "fund_weights_history" USING btree ("at");--> statement-breakpoint
CREATE INDEX "risk_profiles_account_idx" ON "risk_profiles" USING btree ("account","created_at");
