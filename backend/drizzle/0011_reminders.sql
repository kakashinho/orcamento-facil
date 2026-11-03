CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(80) NOT NULL,
	"amount" "bytea",
	"currency" char(3),
	"frequency" varchar(10) NOT NULL,
	"anchor_day" smallint NOT NULL,
	"next_due_date" date NOT NULL,
	"series_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"last_notified_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_frequency_check" CHECK ("reminders"."frequency" in ('weekly', 'monthly', 'yearly')),
	CONSTRAINT "reminders_anchor_check" CHECK ("reminders"."anchor_day" between 1 and 31),
	CONSTRAINT "reminders_currency_check" CHECK (("reminders"."amount" is null) = ("reminders"."currency" is null))
);
--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_series_id_transaction_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."transaction_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("next_due_date") WHERE "reminders"."active";--> statement-breakpoint
CREATE INDEX "reminders_user_idx" ON "reminders" USING btree ("user_id");