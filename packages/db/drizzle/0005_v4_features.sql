CREATE TABLE "ai_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"service" text NOT NULL,
	"company" text,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"error" text,
	"request_id" text,
	CONSTRAINT "ai_usage_tokens_nonneg" CHECK ("ai_usage"."prompt_tokens" >= 0 AND "ai_usage"."completion_tokens" >= 0 AND "ai_usage"."total_tokens" >= 0)
);
--> statement-breakpoint
CREATE TABLE "anchors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"root" text NOT NULL,
	"tx_hash" text NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_bids" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"task_id" bigint NOT NULL,
	"ticker" text NOT NULL,
	"company" text NOT NULL,
	"price" numeric NOT NULL,
	"eta_seconds" integer NOT NULL,
	"pitch" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_tasks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"poster" text NOT NULL,
	"service" text NOT NULL,
	"text" text NOT NULL,
	"input_hash" text NOT NULL,
	"input_uri" text NOT NULL,
	"budget" numeric NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"accepted_bid_id" bigint,
	"accepted_at" timestamp with time zone,
	"job_id" integer,
	"job_company" text,
	"ordered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "call_questions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"epoch" integer NOT NULL,
	"user_id" uuid,
	"account" text NOT NULL,
	"text" text NOT NULL,
	"asker_shares" numeric DEFAULT '0' NOT NULL,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"answer" text,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "company_dna" (
	"ticker" text PRIMARY KEY NOT NULL,
	"commit" text,
	"seed" text,
	"reveal_at" timestamp with time zone,
	"committed_tx" text,
	"smarts" smallint,
	"care" smallint,
	"appetite" smallint,
	"risk" smallint,
	"salt" text,
	"revealed_at" timestamp with time zone,
	"reveal_tx" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "control_changes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"account" text,
	"previous" text,
	"pct" double precision NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"tx_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "control_state" (
	"ticker" text PRIMARY KEY NOT NULL,
	"controller" text,
	"top_holder" text,
	"pct" double precision DEFAULT 0 NOT NULL,
	"since" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower" text NOT NULL,
	"followee" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_followee_pk" PRIMARY KEY("follower","followee")
);
--> statement-breakpoint
CREATE TABLE "market_events" (
	"id" integer PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"service" text,
	"multiplier_bps" integer,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"tx_hash" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"ticker" text,
	"actor" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"dedupe_key" text
);
--> statement-breakpoint
CREATE TABLE "prediction_rounds" (
	"ticker" text NOT NULL,
	"epoch" integer NOT NULL,
	"actual" numeric NOT NULL,
	"count" integer NOT NULL,
	"root" text NOT NULL,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anchor_status" text DEFAULT 'pending' NOT NULL,
	"anchor_tx" text,
	"anchor_error" text,
	"anchor_attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "prediction_rounds_ticker_epoch_pk" PRIMARY KEY("ticker","epoch")
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"epoch" integer NOT NULL,
	"account" text NOT NULL,
	"user_id" uuid,
	"price" numeric NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locks_at" timestamp with time zone NOT NULL,
	"actual" numeric,
	"error_pct" double precision,
	"score" double precision,
	"scored_at" timestamp with time zone,
	"leaf" text
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"account" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_entries" (
	"season_id" integer NOT NULL,
	"account" text NOT NULL,
	"user_id" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"start_value" numeric NOT NULL,
	"top_up" numeric,
	"top_up_tx" text,
	"final_value" numeric,
	"final_return" double precision,
	CONSTRAINT "season_entries_season_id_account_pk" PRIMARY KEY("season_id","account")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" integer PRIMARY KEY NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"anchor_root" text,
	"anchor_status" text,
	"anchor_tx" text,
	"anchor_error" text
);
--> statement-breakpoint
CREATE INDEX "ai_usage_at_idx" ON "ai_usage" USING btree ("at");--> statement-breakpoint
CREATE INDEX "ai_usage_company_idx" ON "ai_usage" USING btree ("company","at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_request_uq" ON "ai_usage" USING btree ("service","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "anchors_receipt_log_uq" ON "anchors" USING btree ("receipt_id","log_index");--> statement-breakpoint
CREATE INDEX "anchors_kind_ref_idx" ON "anchors" USING btree ("kind","ref");--> statement-breakpoint
CREATE UNIQUE INDEX "board_bids_task_ticker_uq" ON "board_bids" USING btree ("task_id","ticker");--> statement-breakpoint
CREATE INDEX "board_bids_task_idx" ON "board_bids" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "board_tasks_status_idx" ON "board_tasks" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "board_tasks_poster_idx" ON "board_tasks" USING btree ("poster","created_at");--> statement-breakpoint
CREATE INDEX "board_tasks_input_idx" ON "board_tasks" USING btree ("input_hash");--> statement-breakpoint
CREATE INDEX "call_questions_ticker_epoch_idx" ON "call_questions" USING btree ("ticker","epoch");--> statement-breakpoint
CREATE INDEX "call_questions_user_idx" ON "call_questions" USING btree ("user_id","asked_at");--> statement-breakpoint
CREATE INDEX "call_questions_status_idx" ON "call_questions" USING btree ("ticker","status");--> statement-breakpoint
CREATE INDEX "control_changes_ticker_idx" ON "control_changes" USING btree ("ticker","at");--> statement-breakpoint
CREATE INDEX "follows_followee_idx" ON "follows" USING btree ("followee");--> statement-breakpoint
CREATE INDEX "market_events_ends_idx" ON "market_events" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "notifications_account_idx" ON "notifications" USING btree ("account","id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "prediction_rounds_anchor_idx" ON "prediction_rounds" USING btree ("anchor_status");--> statement-breakpoint
CREATE UNIQUE INDEX "predictions_round_account_uq" ON "predictions" USING btree ("ticker","epoch","account");--> statement-breakpoint
CREATE INDEX "predictions_account_idx" ON "predictions" USING btree ("account","created_at");--> statement-breakpoint
CREATE INDEX "predictions_unscored_idx" ON "predictions" USING btree ("scored_at","ticker","epoch");--> statement-breakpoint
CREATE INDEX "push_subscriptions_account_idx" ON "push_subscriptions" USING btree ("account");--> statement-breakpoint
CREATE INDEX "season_entries_account_idx" ON "season_entries" USING btree ("account");
