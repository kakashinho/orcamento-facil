import { eq } from "drizzle-orm";
import { Repository } from "../../../infrastructure/database/repository.js";
import { systemSettings } from "../../../infrastructure/database/schema.js";
import type { SystemSettingsRecord } from "../types/system.types.js";

/** Linha única de configuração (id = 1), semeada pela migration. */
export class SystemSettingsRepository extends Repository {
  async get(): Promise<SystemSettingsRecord | undefined> {
    const [row] = await this.db
      .select({
        maintenanceEnabled: systemSettings.maintenanceEnabled,
        maintenanceMessage: systemSettings.maintenanceMessage,
        updatedAt: systemSettings.updatedAt,
      })
      .from(systemSettings)
      .where(eq(systemSettings.id, 1));
    return row;
  }

  async saveMaintenance(input: { enabled: boolean; message: string | null; updatedBy: string; now: Date }): Promise<void> {
    const values = {
      maintenanceEnabled: input.enabled,
      maintenanceMessage: input.message,
      updatedBy: input.updatedBy,
      updatedAt: input.now,
    };
    await this.db
      .insert(systemSettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: systemSettings.id, set: values });
  }
}
