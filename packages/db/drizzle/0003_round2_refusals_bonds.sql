ALTER TABLE "jobs" ADD COLUMN "end_reason" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "accept_window_ns" numeric;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "accept_by" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "bond" numeric;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "bond_refunded" boolean;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "bond_settled_amount" numeric;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "bond_settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "supply_snapshot" numeric;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "executable_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "chain_status" text;
