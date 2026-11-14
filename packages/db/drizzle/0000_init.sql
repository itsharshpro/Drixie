CREATE TABLE "blocks_cursor" (
	"id" text PRIMARY KEY NOT NULL,
	"height" bigint NOT NULL,
	"block_hash" text,
	"block_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events_raw" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"signer" text NOT NULL,
	"block_height" bigint NOT NULL,
	"block_timestamp_ns" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"contract" text NOT NULL,
	"standard" text NOT NULL,
	"version" text NOT NULL,
	"event" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"ticker" text PRIMARY KEY NOT NULL,
	"account" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"service" text DEFAULT '' NOT NULL,
	"founder" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_block" bigint,
	"created_tx" text
);
--> statement-breakpoint
CREATE TABLE "company_state" (
	"ticker" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"price" numeric DEFAULT '0' NOT NULL,
	"twap" numeric DEFAULT '0' NOT NULL,
	"pool_near" numeric DEFAULT '0' NOT NULL,
	"pool_shares" numeric DEFAULT '0' NOT NULL,
	"treasury" numeric DEFAULT '0' NOT NULL,
	"total_supply" numeric DEFAULT '0' NOT NULL,
	"service_price" numeric DEFAULT '0' NOT NULL,
	"price_min" numeric DEFAULT '0' NOT NULL,
	"price_max" numeric DEFAULT '0' NOT NULL,
	"spend_cap_per_epoch" numeric DEFAULT '0' NOT NULL,
	"spent_this_epoch" numeric DEFAULT '0' NOT NULL,
	"ipo_raised" numeric DEFAULT '0' NOT NULL,
	"ipo_shares_sold" numeric DEFAULT '0' NOT NULL,
	"ipo_closes_at" timestamp with time zone,
	"current_epoch" integer DEFAULT 0 NOT NULL,
	"last_rung_epoch" integer DEFAULT -1 NOT NULL,
	"next_bell_at" timestamp with time zone,
	"founder" text,
	"job_count" integer DEFAULT 0 NOT NULL,
	"params" jsonb NOT NULL,
	"strategy" jsonb,
	"rights" jsonb,
	"liquidation" jsonb,
	"raw" jsonb NOT NULL,
	"block_height" bigint,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dividends" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"account" text NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"tx_hash" text NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holders" (
	"company" text NOT NULL,
	"account" text NOT NULL,
	"balance" numeric DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holders_company_account_pk" PRIMARY KEY("company","account")
);
--> statement-breakpoint
CREATE TABLE "letters" (
	"company" text NOT NULL,
	"epoch" integer NOT NULL,
	"uri" text NOT NULL,
	"hash" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"tx_hash" text NOT NULL,
	CONSTRAINT "letters_company_epoch_pk" PRIMARY KEY("company","epoch")
);
--> statement-breakpoint
CREATE TABLE "price_points" (
	"company" text NOT NULL,
	"resolution" integer NOT NULL,
	"t" timestamp with time zone NOT NULL,
	"open" numeric NOT NULL,
	"high" numeric NOT NULL,
	"low" numeric NOT NULL,
	"close" numeric NOT NULL,
	"volume" numeric DEFAULT '0' NOT NULL,
	"trades" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "price_points_company_resolution_t_pk" PRIMARY KEY("company","resolution","t")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"company" text NOT NULL,
	"epoch" integer NOT NULL,
	"revenue_raw" numeric NOT NULL,
	"revenue_counted" numeric NOT NULL,
	"costs" numeric NOT NULL,
	"founder_fee" numeric NOT NULL,
	"protocol_fee" numeric NOT NULL,
	"profit" numeric NOT NULL,
	"buyback_near" numeric NOT NULL,
	"burned_shares" numeric NOT NULL,
	"dividend_near" numeric NOT NULL,
	"retained" numeric NOT NULL,
	"treasury_after" numeric NOT NULL,
	"runway_x100" numeric,
	"status" text NOT NULL,
	"tip" numeric DEFAULT '0' NOT NULL,
	"ringer" text NOT NULL,
	"tx_hash" text NOT NULL,
	"block_height" bigint NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "reports_company_epoch_pk" PRIMARY KEY("company","epoch")
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"account" text NOT NULL,
	"kind" text NOT NULL,
	"side" text NOT NULL,
	"near" numeric NOT NULL,
	"shares" numeric NOT NULL,
	"fee" numeric DEFAULT '0' NOT NULL,
	"price_after" numeric,
	"at" timestamp with time zone NOT NULL,
	"block_height" bigint NOT NULL,
	"tx_hash" text NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_content" (
	"hash" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"mime" text DEFAULT 'text/plain; charset=utf-8' NOT NULL,
	"body" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_outputs" (
	"company" text NOT NULL,
	"job_id" integer NOT NULL,
	"output_hash" text NOT NULL,
	"qa_passed" boolean,
	"qa_metric" text,
	"qa_score" double precision,
	"qa_judge" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_outputs_company_job_id_pk" PRIMARY KEY("company","job_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"company" text NOT NULL,
	"job_id" integer NOT NULL,
	"buyer" text NOT NULL,
	"buyer_is_agent" boolean DEFAULT false NOT NULL,
	"service" text NOT NULL,
	"price" numeric NOT NULL,
	"status" text NOT NULL,
	"input_hash" text NOT NULL,
	"input_uri" text DEFAULT '' NOT NULL,
	"output_hash" text,
	"output_uri" text,
	"attestation" text,
	"ordered_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"rating" integer,
	"counted" boolean,
	"epoch" integer,
	"auto_accepted" boolean,
	"refund" numeric,
	"tx_hash" text NOT NULL,
	"deliver_tx" text,
	"accept_tx" text,
	"gas_burnt" numeric DEFAULT '0' NOT NULL,
	"block_height" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_company_job_id_pk" PRIMARY KEY("company","job_id")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"buyer_company" text NOT NULL,
	"supplier_company" text NOT NULL,
	"supplier_job_id" integer NOT NULL,
	"service" text DEFAULT '' NOT NULL,
	"what" text NOT NULL,
	"price" numeric NOT NULL,
	"first_quote" numeric,
	"counter" numeric,
	"negotiated_accepted" boolean,
	"reason" text,
	"passed_check" boolean,
	"status" text NOT NULL,
	"transcript_hash" text NOT NULL,
	"tx_hash" text NOT NULL,
	"accepted_at" timestamp with time zone,
	"accept_tx" text
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"company" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"reason" text,
	"amount" numeric,
	"account" text,
	"tx_hash" text NOT NULL,
	"block_height" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auctions" (
	"token_id" text PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"highest_bid" numeric DEFAULT '0' NOT NULL,
	"highest_bidder" text,
	"bids" integer DEFAULT 0 NOT NULL,
	"settled" boolean DEFAULT false NOT NULL,
	"winner" text,
	"final_amount" numeric,
	"started_at" timestamp with time zone NOT NULL,
	"started_tx" text NOT NULL,
	"settled_tx" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charter_transfers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"token_id" text NOT NULL,
	"from_account" text,
	"to_account" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"tx_hash" text NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL,
	"entry" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charters" (
	"token_id" text PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"owner" text NOT NULL,
	"pending_fees" numeric DEFAULT '0' NOT NULL,
	"fees_earned" numeric DEFAULT '0' NOT NULL,
	"fees_paid" numeric DEFAULT '0' NOT NULL,
	"minted_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"company" text NOT NULL,
	"proposal_id" integer NOT NULL,
	"proposer" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"yes" numeric DEFAULT '0' NOT NULL,
	"no" numeric DEFAULT '0' NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"executed" boolean DEFAULT false NOT NULL,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"tx_hash" text NOT NULL,
	CONSTRAINT "proposals_company_proposal_id_pk" PRIMARY KEY("company","proposal_id")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"proposal_id" integer NOT NULL,
	"voter" text NOT NULL,
	"support" boolean NOT NULL,
	"weight" numeric NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"tx_hash" text NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_challenges" (
	"challenge" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid,
	"handle" text,
	"webauthn_user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"webauthn_user_id" text NOT NULL,
	"public_key" "bytea" NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"device_type" text,
	"backed_up" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "player_accounts" (
	"account_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"public_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_accounts" ADD CONSTRAINT "player_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_raw_receipt_log_uq" ON "events_raw" USING btree ("receipt_id","log_index");--> statement-breakpoint
CREATE INDEX "events_raw_contract_height_idx" ON "events_raw" USING btree ("contract","block_height");--> statement-breakpoint
CREATE INDEX "events_raw_event_idx" ON "events_raw" USING btree ("event","at");--> statement-breakpoint
CREATE INDEX "events_raw_height_idx" ON "events_raw" USING btree ("block_height");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_account_uq" ON "companies" USING btree ("account");--> statement-breakpoint
CREATE INDEX "company_state_status_idx" ON "company_state" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "dividends_receipt_log_uq" ON "dividends" USING btree ("receipt_id","log_index");--> statement-breakpoint
CREATE INDEX "dividends_account_idx" ON "dividends" USING btree ("account","at");--> statement-breakpoint
CREATE INDEX "dividends_company_idx" ON "dividends" USING btree ("company","at");--> statement-breakpoint
CREATE INDEX "holders_company_balance_idx" ON "holders" USING btree ("company","balance");--> statement-breakpoint
CREATE INDEX "holders_account_idx" ON "holders" USING btree ("account");--> statement-breakpoint
CREATE INDEX "reports_at_idx" ON "reports" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "trades_receipt_log_uq" ON "trades" USING btree ("receipt_id","log_index");--> statement-breakpoint
CREATE INDEX "trades_company_at_idx" ON "trades" USING btree ("company","at");--> statement-breakpoint
CREATE INDEX "trades_account_company_idx" ON "trades" USING btree ("account","company","at");--> statement-breakpoint
CREATE INDEX "job_content_kind_idx" ON "job_content" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "jobs_company_ordered_idx" ON "jobs" USING btree ("company","ordered_at");--> statement-breakpoint
CREATE INDEX "jobs_buyer_idx" ON "jobs" USING btree ("buyer","ordered_at");--> statement-breakpoint
CREATE INDEX "jobs_ordered_idx" ON "jobs" USING btree ("ordered_at");--> statement-breakpoint
CREATE INDEX "jobs_accepted_idx" ON "jobs" USING btree ("accepted_at");--> statement-breakpoint
CREATE INDEX "receipts_at_idx" ON "receipts" USING btree ("at");--> statement-breakpoint
CREATE INDEX "receipts_buyer_idx" ON "receipts" USING btree ("buyer_company","at");--> statement-breakpoint
CREATE INDEX "receipts_supplier_idx" ON "receipts" USING btree ("supplier_company","at");--> statement-breakpoint
CREATE INDEX "activity_at_idx" ON "activity" USING btree ("at","id");--> statement-breakpoint
CREATE INDEX "activity_company_at_idx" ON "activity" USING btree ("company","at");--> statement-breakpoint
CREATE INDEX "activity_kind_at_idx" ON "activity" USING btree ("kind","at");--> statement-breakpoint
CREATE INDEX "activity_account_at_idx" ON "activity" USING btree ("account","at");--> statement-breakpoint
CREATE INDEX "auctions_settled_idx" ON "auctions" USING btree ("settled","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "charter_transfers_uq" ON "charter_transfers" USING btree ("receipt_id","log_index","token_id","entry");--> statement-breakpoint
CREATE INDEX "charter_transfers_token_idx" ON "charter_transfers" USING btree ("token_id","at");--> statement-breakpoint
CREATE INDEX "charters_owner_idx" ON "charters" USING btree ("owner");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_receipt_log_uq" ON "votes" USING btree ("receipt_id","log_index");--> statement-breakpoint
CREATE INDEX "votes_proposal_idx" ON "votes" USING btree ("company","proposal_id");--> statement-breakpoint
CREATE INDEX "auth_challenges_expires_idx" ON "auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "email_tokens_email_idx" ON "email_tokens" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "passkeys_user_idx" ON "passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_accounts_user_uq" ON "player_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_accounts_handle_uq" ON "player_accounts" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_uq" ON "users" USING btree ("handle");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");
