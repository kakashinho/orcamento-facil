import { eq, sql } from "drizzle-orm";
import type { DbTransaction } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { users } from "../../../infrastructure/database/schema.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { isUniqueViolation } from "../../../shared/errors/pg-errors.js";
import type { NewUserRecord, UserRecord } from "../types/user.types.js";

function translateUniqueViolation(error: unknown): never {
  if (isUniqueViolation(error, "users_email_lower_uq")) throw new DuplicateEntryError("email");
  if (isUniqueViolation(error, "users_username_lower_uq")) throw new DuplicateEntryError("username");
  throw error;
}

export class UserRepository extends Repository {
  async create(input: NewUserRecord, tx?: DbTransaction): Promise<UserRecord> {
    try {
      const [row] = await this.executor(tx).insert(users).values(input).returning();
      return row!;
    } catch (error) {
      translateUniqueViolation(error);
    }
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    return row;
  }

  /** E-mail e nome de usuário são únicos sem diferenciar maiúsculas. */
  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const [row] = await this.db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
    return row;
  }

  async findByUsername(username: string): Promise<UserRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = ${username.toLowerCase()}`);
    return row;
  }

  /** Incremento atômico (sem corrida entre tentativas simultâneas); devolve o total. */
  async incrementFailedLoginAttempts(id: string, now: Date): Promise<number> {
    const [row] = await this.db
      .update(users)
      .set({ failedLoginAttempts: sql`${users.failedLoginAttempts} + 1`, updatedAt: now })
      .where(eq(users.id, id))
      .returning({ failedLoginAttempts: users.failedLoginAttempts });
    return row?.failedLoginAttempts ?? 0;
  }

  async lock(id: string, until: Date): Promise<void> {
    await this.db.update(users).set({ lockedUntil: until, failedLoginAttempts: 0 }).where(eq(users.id, id));
  }

  /** Zera o contador de falhas e o bloqueio; opcionalmente promove a administrador. */
  async recordSuccessfulLogin(id: string, now: Date, promoteToAdmin: boolean): Promise<UserRecord | undefined> {
    const [row] = await this.db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, ...(promoteToAdmin ? { role: "admin" } : {}), updatedAt: now })
      .where(eq(users.id, id))
      .returning();
    return row;
  }

  async updatePassword(id: string, passwordHash: string, now: Date, tx?: DbTransaction): Promise<void> {
    await this.executor(tx)
      .update(users)
      .set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null, updatedAt: now })
      .where(eq(users.id, id));
  }

  async update(id: string, changes: Partial<NewUserRecord>): Promise<UserRecord | undefined> {
    try {
      const [row] = await this.db.update(users).set(changes).where(eq(users.id, id)).returning();
      return row;
    } catch (error) {
      translateUniqueViolation(error);
    }
  }
}
