-- Login por biometria com chave do aparelho (R40), tema do app no perfil (R42) e
-- tipo da categoria (receita/despesa) para validar a coerência das transações.
CREATE TABLE "biometric_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_name" varchar(80) NOT NULL,
	"public_key" text NOT NULL,
	"key_type" varchar(10) NOT NULL,
	"key_fingerprint" char(64) NOT NULL,
	"challenge_hash" char(64),
	"challenge_expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "biometric_credentials_key_type_check" CHECK ("biometric_credentials"."key_type" in ('rsa', 'ec'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme" varchar(10) DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "type" varchar(10);--> statement-breakpoint
ALTER TABLE "biometric_credentials" ADD CONSTRAINT "biometric_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "biometric_credentials_user_id_idx" ON "biometric_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "biometric_credentials_user_key_uq" ON "biometric_credentials" USING btree ("user_id","key_fingerprint") WHERE "biometric_credentials"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_theme_check" CHECK ("users"."theme" in ('system', 'light', 'dark'));--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_type_check" CHECK ("categories"."type" is null or "categories"."type" in ('income', 'expense'));--> statement-breakpoint
-- Categorias predefinidas: "Salário" é de receitas; "Outros" (tipo nulo) vale para receitas e despesas.
UPDATE "categories" SET "type" = 'expense' WHERE "system_key" IN ('food', 'transport', 'leisure', 'housing', 'health', 'education');--> statement-breakpoint
UPDATE "categories" SET "type" = 'income' WHERE "system_key" = 'salary';