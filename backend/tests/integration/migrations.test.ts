import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../src/infrastructure/database/migrate.js";
import { TEST_DATABASE_URL } from "../helpers/test-config.js";

describe("migrations oficiais", () => {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it("criam exatamente as tabelas do modelo", async () => {
    const { rows } = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    expect(rows.map((row) => row.table_name)).toEqual([
      "action_history",
      "app_logs",
      "categories",
      "password_reset_tokens",
      "sessions",
      "system_settings",
      "tags",
      "transaction_tags",
      "transactions",
      "transfers",
      "users",
      "wallets",
    ]);
  });

  it("usam PK composta em transaction_tags e BYTEA nos valores financeiros", async () => {
    const pk = await client.query<{ column_name: string }>(`
      select a.attname as column_name
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.conrelid = 'transaction_tags'::regclass and c.contype = 'p'
      order by a.attname`);
    expect(pk.rows.map((row) => row.column_name)).toEqual(["tag_id", "transaction_id"]);

    const money = await client.query<{ table_name: string; column_name: string; data_type: string }>(`
      select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public'
        and column_name in ('amount', 'balance', 'initial_balance', 'source_amount', 'target_amount', 'snapshot')`);
    // transactions.amount, wallets.balance/initial_balance, transfers.source/target_amount, action_history.snapshot
    expect(money.rows.length).toBe(6);
    for (const column of money.rows) expect(column.data_type).toBe("bytea");
  });

  it("criam índices únicos sem diferenciar maiúsculas e o índice da listagem cronológica", async () => {
    const { rows } = await client.query<{ indexname: string; indexdef: string }>(
      "select indexname, indexdef from pg_indexes where schemaname = 'public'",
    );
    const byName = new Map(rows.map((row) => [row.indexname, row.indexdef]));
    expect(byName.get("users_email_lower_uq")).toMatch(/UNIQUE.*lower\(\(?email/);
    expect(byName.get("wallets_user_name_uq")).toMatch(/UNIQUE.*lower\(\(?name/);
    expect(byName.get("categories_user_name_uq")).toMatch(/WHERE/);
    expect(byName.get("transactions_user_date_idx")).toMatch(/date DESC.*created_at DESC.*id DESC/);
  });

  it("semeiam categorias predefinidas (R07) e a configuração de manutenção", async () => {
    const categories = await client.query<{ name: string }>(
      "select name from categories where user_id is null order by system_key",
    );
    expect(categories.rows.map((row) => row.name)).toEqual(
      expect.arrayContaining(["Alimentação", "Transporte", "Lazer", "Moradia", "Saúde"]),
    );
    const settings = await client.query("select * from system_settings");
    expect(settings.rows).toHaveLength(1);
  });

  it("rejeitam dados que violam as restrições", async () => {
    await expect(client.query("insert into system_settings (id) values (2)")).rejects.toMatchObject({ code: "23514" });
    await expect(
      client.query("insert into categories (name) values ('Sem dono e sem chave')"),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("são idempotentes: reaplicar não executa nada novamente", async () => {
    await runMigrations(TEST_DATABASE_URL);
    const { rows } = await client.query("select count(*)::int as total from drizzle.__drizzle_migrations");
    expect(rows[0].total).toBe(2);
  });
});
