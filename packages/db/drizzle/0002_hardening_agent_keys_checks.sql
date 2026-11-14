CREATE TABLE "job_checks" (
	"company" text NOT NULL,
	"job_id" integer NOT NULL,
	"metric" text NOT NULL,
	"passed" boolean NOT NULL,
	"score" double precision NOT NULL,
	"judge" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_checks_company_job_id_metric_pk" PRIMARY KEY("company","job_id","metric")
);
--> statement-breakpoint
CREATE TABLE "agent_keys" (
	"company_account" text PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"user_id" uuid NOT NULL,
	"public_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_tokens" ADD COLUMN "browser_hash" text;--> statement-breakpoint
ALTER TABLE "player_accounts" ADD COLUMN "created_ip" text;--> statement-breakpoint
ALTER TABLE "player_accounts" ADD COLUMN "funded" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_keys" ADD CONSTRAINT "agent_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_keys_user_idx" ON "agent_keys" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "job_content_creator_idx" ON "job_content" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "player_accounts_ip_idx" ON "player_accounts" USING btree ("created_ip","created_at");--> statement-breakpoint
CREATE INDEX "player_accounts_created_idx" ON "player_accounts" USING btree ("created_at");
