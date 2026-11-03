CREATE TABLE "reduction_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"percent" smallint NOT NULL,
	"baseline_amount" "bytea" NOT NULL,
	"currency" char(3) NOT NULL,
	"baseline_months" smallint DEFAULT 3 NOT NULL,
	"start_month" char(7) NOT NULL,
	"end_month" char(7),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reduction_goals_percent_check" CHECK ("reduction_goals"."percent" between 1 and 90),
	CONSTRAINT "reduction_goals_months_check" CHECK ("reduction_goals"."end_month" is null or "reduction_goals"."end_month" >= "reduction_goals"."start_month")
);
--> statement-breakpoint
ALTER TABLE "reduction_goals" ADD CONSTRAINT "reduction_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reduction_goals" ADD CONSTRAINT "reduction_goals_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reduction_goals_active_uq" ON "reduction_goals" USING btree ("user_id","category_id") WHERE "reduction_goals"."end_month" is null;