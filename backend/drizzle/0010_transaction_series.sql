CREATE TABLE "transaction_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" varchar(12) NOT NULL,
	"type" varchar(10) NOT NULL,
	"frequency" varchar(10) NOT NULL,
	"wallet_id" uuid NOT NULL,
	"category_id" uuid,
	"description" varchar(200) NOT NULL,
	"tag_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"amount" "bytea" NOT NULL,
	"installments" smallint,
	"start_date" date NOT NULL,
	"anchor_day" smallint NOT NULL,
	"end_date" date,
	"next_date" date,
	"generated_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(10) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_series_kind_check" CHECK ("transaction_series"."kind" in ('recurring', 'installment')),
	CONSTRAINT "transaction_series_type_check" CHECK ("transaction_series"."type" in ('income', 'expense')),
	CONSTRAINT "transaction_series_frequency_check" CHECK ("transaction_series"."frequency" in ('weekly', 'monthly', 'yearly')),
	CONSTRAINT "transaction_series_status_check" CHECK ("transaction_series"."status" in ('active', 'ended', 'cancelled')),
	CONSTRAINT "transaction_series_anchor_check" CHECK ("transaction_series"."anchor_day" between 1 and 31),
	CONSTRAINT "transaction_series_installments_check" CHECK (("transaction_series"."kind" = 'installment') = ("transaction_series"."installments" is not null)),
	CONSTRAINT "transaction_series_installment_shape_check" CHECK ("transaction_series"."kind" <> 'installment' or ("transaction_series"."type" = 'expense' and "transaction_series"."frequency" = 'monthly' and "transaction_series"."end_date" is null and "transaction_series"."installments" between 2 and 72))
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "series_occurrence" integer;--> statement-breakpoint
ALTER TABLE "transaction_series" ADD CONSTRAINT "transaction_series_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_series" ADD CONSTRAINT "transaction_series_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_series" ADD CONSTRAINT "transaction_series_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_series_due_idx" ON "transaction_series" USING btree ("next_date") WHERE "transaction_series"."status" = 'active';--> statement-breakpoint
CREATE INDEX "transaction_series_user_idx" ON "transaction_series" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "transaction_series_wallet_idx" ON "transaction_series" USING btree ("wallet_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_series_id_transaction_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."transaction_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_series_occurrence_uq" ON "transactions" USING btree ("series_id","series_occurrence") WHERE "transactions"."series_id" is not null;