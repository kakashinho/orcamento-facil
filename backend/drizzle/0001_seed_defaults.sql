-- Dados de referência da Sprint 1.
-- unaccent: busca por descrição sem diferenciar acentos (R10). Extensão "trusted" desde o PostgreSQL 13.
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
-- Categorias predefinidas (R07). IDs fixos para que o aplicativo e os testes possam referenciá-las.
INSERT INTO "categories" ("id", "user_id", "system_key", "name") VALUES
  ('00000000-0000-4000-8000-000000000001', NULL, 'food', 'Alimentação'),
  ('00000000-0000-4000-8000-000000000002', NULL, 'transport', 'Transporte'),
  ('00000000-0000-4000-8000-000000000003', NULL, 'leisure', 'Lazer'),
  ('00000000-0000-4000-8000-000000000004', NULL, 'housing', 'Moradia'),
  ('00000000-0000-4000-8000-000000000005', NULL, 'health', 'Saúde'),
  ('00000000-0000-4000-8000-000000000006', NULL, 'education', 'Educação'),
  ('00000000-0000-4000-8000-000000000007', NULL, 'salary', 'Salário'),
  ('00000000-0000-4000-8000-000000000008', NULL, 'other', 'Outros')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Linha única de configuração do sistema (modo de manutenção — R72).
INSERT INTO "system_settings" ("id", "maintenance_enabled") VALUES (1, false) ON CONFLICT DO NOTHING;
