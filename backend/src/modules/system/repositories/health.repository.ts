import { sql } from "drizzle-orm";
import { Repository } from "../../../infrastructure/database/repository.js";

export class HealthRepository extends Repository {
  /** Consulta mínima para confirmar que o banco responde. */
  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }
}
