import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { users } from "../../db/schema.js";
import type { Clock } from "../../infra/clock.js";
import { isValidTimeZone } from "../../shared/dates.js";
import { errors } from "../../shared/errors.js";
import { isUniqueViolation } from "../../shared/pg-errors.js";
import type { ExchangeRateService } from "../exchange-rates/exchange-rate.service.js";
import { toUserDto, type UserDto } from "./user.dto.js";

export interface UpdateProfileInput {
  username?: string | undefined;
  primaryCurrency?: string | undefined;
  timezone?: string | undefined;
}

export class UserService {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly exchangeRates: ExchangeRateService,
  ) {}

  async me(userId: string): Promise<UserDto> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) throw errors.notFound("Usuário");
    return toUserDto(user);
  }

  /** Perfil: nome de usuário, moeda principal (R28) e fuso horário. */
  async update(userId: string, input: UpdateProfileInput): Promise<UserDto> {
    const changes: Partial<typeof users.$inferInsert> = { updatedAt: this.clock.now() };
    if (input.username !== undefined) changes.username = input.username.trim();
    if (input.primaryCurrency !== undefined) {
      this.exchangeRates.assertCurrency(input.primaryCurrency);
      changes.primaryCurrency = input.primaryCurrency;
    }
    if (input.timezone !== undefined) {
      if (!isValidTimeZone(input.timezone)) throw errors.validation("Fuso horário inválido.");
      changes.timezone = input.timezone;
    }
    try {
      const [user] = await this.db.update(users).set(changes).where(eq(users.id, userId)).returning();
      if (!user) throw errors.notFound("Usuário");
      return toUserDto(user);
    } catch (error) {
      if (isUniqueViolation(error, "users_username_lower_uq")) {
        throw errors.conflict("USERNAME_TAKEN", "Este nome de usuário já está em uso.");
      }
      throw error;
    }
  }
}
