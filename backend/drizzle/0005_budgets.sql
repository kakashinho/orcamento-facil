CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"period" varchar(10) NOT NULL,
	"amount" "bytea" NOT NULL,
	"currency" char(3) NOT NULL,
	"valid_from" char(7) NOT NULL,
	"valid_to" char(7),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_period_check" CHECK ("budgets"."period" in ('monthly', 'daily')),
	CONSTRAINT "budgets_valid_from_check" CHECK ("budgets"."valid_from" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "budgets_valid_to_check" CHECK ("budgets"."valid_to" is null or ("budgets"."valid_to" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and "budgets"."valid_to" >= "budgets"."valid_from"))
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_active_uq" ON "budgets" USING btree ("user_id","category_id","period") WHERE "budgets"."valid_to" is null;--> statement-breakpoint
CREATE INDEX "budgets_user_idx" ON "budgets" USING btree ("user_id","valid_from");