import type { Clock } from "../../../infrastructure/clock.js";
import { errors } from "../../../shared/errors/app-error.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { isValidTimeZone } from "../../../shared/utils/dates.js";
import { isSupportedCurrency } from "../../../shared/utils/money.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { UpdateProfileRequestDto, UserResponseDto } from "../schemas/user.schema.js";
import type { UserPreferences, UserRecord } from "../types/user.types.js";

/** Converte a linha do banco no DTO de resposta — o hash da senha nunca sai daqui. */
export function toUserResponseDto(user: UserRecord): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role === "admin" ? "admin" : "user",
    primaryCurrency: user.primaryCurrency,
    timezone: user.timezone,
    createdAt: user.createdAt.toISOString(),
  };
}

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.users.findById(userId);
    if (!user) throw errors.notFound("Usuário");
    return toUserResponseDto(user);
  }

  /** Contrato público do módulo auth: moeda principal, fuso e nome, usados por finance e reports. */
  async getPreferences(userId: string): Promise<UserPreferences> {
    const user = await this.users.findById(userId);
    if (!user) throw errors.notFound("Usuário");
    return {
      userId: user.id,
      username: user.username,
      primaryCurrency: user.primaryCurrency,
      timezone: user.timezone,
    };
  }

  /** Perfil: nome de usuário, moeda principal (R28) e fuso horário. */
  async updateProfile(userId: string, input: UpdateProfileRequestDto): Promise<UserResponseDto> {
    if (input.primaryCurrency !== undefined && !isSupportedCurrency(input.primaryCurrency)) {
      throw errors.unprocessable("UNSUPPORTED_CURRENCY", `Moeda não suportada: ${input.primaryCurrency}.`);
    }
    if (input.timezone !== undefined && !isValidTimeZone(input.timezone)) {
      throw errors.validation("Fuso horário inválido.");
    }
    try {
      const user = await this.users.update(userId, {
        ...(input.username !== undefined ? { username: input.username.trim() } : {}),
        ...(input.primaryCurrency !== undefined ? { primaryCurrency: input.primaryCurrency } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        updatedAt: this.clock.now(),
      });
      if (!user) throw errors.notFound("Usuário");
      return toUserResponseDto(user);
    } catch (error) {
      if (error instanceof DuplicateEntryError) {
        throw errors.conflict("USERNAME_TAKEN", "Este nome de usuário já está em uso.");
      }
      throw error;
    }
  }
}
