import { Pool, PoolClient } from "pg";

export class TestDatabase {
  private pool: Pool;
  private client: PoolClient | null = null;

  constructor(databaseUrl: string) {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required");
    }
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async connect(): Promise<void> {
    if (this.client) {
      throw new Error("Already connected");
    }
    this.client = await this.pool.connect();
  }

  async startTransaction(): Promise<void> {
    if (!this.client) {
      throw new Error("Must call connect() first");
    }
    await this.client.query("BEGIN");
  }

  async rollback(): Promise<void> {
    if (!this.client) {
      throw new Error("Must call connect() first");
    }
    await this.client.query("ROLLBACK");
  }

  async commit(): Promise<void> {
    if (!this.client) {
      throw new Error("Must call connect() first");
    }
    await this.client.query("COMMIT");
  }

  async query(text: string, values?: unknown[]): Promise<unknown[]> {
    if (!this.client) {
      throw new Error("Must call connect() first");
    }
    const result = await this.client.query(text, values);
    return result.rows;
  }

  async close(): Promise<void> {
    try {
      if (this.client) {
        await this.client.release();
        this.client = null;
      }
    } finally {
      await this.pool.end();
    }
  }
}

export async function withTestDatabase<T>(
  databaseUrl: string,
  fn: (db: TestDatabase) => Promise<T>
): Promise<T> {
  const db = new TestDatabase(databaseUrl);

  try {
    await db.connect();
    return await fn(db);
  } finally {
    await db.close();
  }
}
