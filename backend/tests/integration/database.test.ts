import { describe, it, expect } from "vitest";
import { withTestDatabase } from "./support/test-database.js";

describe("Integration — Database Isolation", () => {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  it("should connect to test database and execute query", async () => {
    if (!testDatabaseUrl) {
      throw new Error("TEST_DATABASE_URL not set");
    }

    await withTestDatabase(testDatabaseUrl, async (db) => {
      // SELECT 1 to verify connection works
      const result = await db.query("SELECT 1 as value");
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect((result[0] as { value: number }).value).toBe(1);
    });
  });

  it("should demonstrate transaction and rollback", async () => {
    if (!testDatabaseUrl) {
      throw new Error("TEST_DATABASE_URL not set");
    }

    // Create temporary test table for demonstration
    await withTestDatabase(testDatabaseUrl, async (db) => {
      // Create temp table (will be deleted at end of transaction)
      await db.query(`
        CREATE TEMPORARY TABLE test_data (
          id SERIAL PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);

      // Test 1: Start transaction, insert, and verify data is there
      await db.startTransaction();
      await db.query("INSERT INTO test_data (value) VALUES ($1)", ["test_value"]);

      const resultBeforeRollback = await db.query("SELECT * FROM test_data");
      expect(resultBeforeRollback.length).toBe(1);
      expect((resultBeforeRollback[0] as { value: string }).value).toBe("test_value");

      // Rollback the transaction
      await db.rollback();

      // Test 2: Verify data is gone after rollback
      const resultAfterRollback = await db.query("SELECT * FROM test_data");
      expect(resultAfterRollback.length).toBe(0);
    });
  });

  it("should isolate transactions between sequential tests", async () => {
    if (!testDatabaseUrl) {
      throw new Error("TEST_DATABASE_URL not set");
    }

    await withTestDatabase(testDatabaseUrl, async (db) => {
      await db.query(`
        CREATE TEMPORARY TABLE test_isolation (
          id SERIAL PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);

      await db.startTransaction();
      await db.query("INSERT INTO test_isolation (value) VALUES ($1)", ["first"]);
      await db.rollback();

      const result = await db.query("SELECT * FROM test_isolation");
      expect(result.length).toBe(0);
    });
  });
});
