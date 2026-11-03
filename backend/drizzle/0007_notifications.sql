CREATE TABLE "notification_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"daily_reminder_enabled" boolean DEFAULT true NOT NULL,
	"daily_reminder_hour" smallint DEFAULT 20 NOT NULL,
	"goal_reminders_enabled" boolean DEFAULT true NOT NULL,
	"bill_reminders_enabled" boolean DEFAULT true NOT NULL,
	"alerts_push_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_settings_hour_check" CHECK ("notification_settings"."daily_reminder_hour" between 0 and 23)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" varchar(40) NOT NULL,
	"title" varchar(120) NOT NULL,
	"body" varchar(300) NOT NULL,
	"entity_type" varchar(20),
	"entity_id" uuid,
	"data" jsonb,
	"dedupe_key" varchar(160) NOT NULL,
	"read_at" timestamp with time zone,
	"push_status" varchar(10) DEFAULT 'none' NOT NULL,
	"push_attempts" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('budget_warning', 'budget_exceeded', 'daily_limit_exceeded', 'reduction_exceeded', 'unusual_transaction', 'low_balance', 'goal_achieved', 'goal_deadline', 'daily_reminder', 'bill_reminder')),
	CONSTRAINT "notifications_push_status_check" CHECK ("notifications"."push_status" in ('none', 'pending', 'sent', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "push_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" varchar(10) DEFAULT 'android' NOT NULL,
	"device_name" varchar(80),
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_devices_platform_check" CHECK ("push_devices"."platform" in ('android'))
);
--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_uq" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "notifications_push_pending_idx" ON "notifications" USING btree ("created_at") WHERE "notifications"."push_status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "push_devices_token_uq" ON "push_devices" USING btree ("token");--> statement-breakpoint
CREATE INDEX "push_devices_user_idx" ON "push_devices" USING btree ("user_id") WHERE "push_devices"."revoked_at" is null;