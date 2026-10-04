import { generateOpaqueToken, hashOpaqueToken } from "../../../infrastructure/auth/access-token.js";
import { parseDevicePublicKey, verifyDeviceSignature } from "../../../infrastructure/auth/device-signature.js";
import type { Clock } from "../../../infrastructure/clock.js";
import type { EventLogger } from "../../../infrastructure/logging/event-logger.js";
import { AppError, errors } from "../../../shared/errors/app-error.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import type { BiometricCredentialRepository } from "../repositories/biometric-credential.repository.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { AuthResultResponseDto } from "../schemas/auth.schema.js";
import type {
  BiometricChallengeResponseDto,
  BiometricCredentialListResponseDto,
  BiometricCredentialResponseDto,
  BiometricLoginRequestDto,
  EnrollBiometricRequestDto,
} from "../schemas/biometric.schema.js";
import type { RequestMeta } from "../types/auth.types.js";
import { type BiometricCredentialRecord, MAX_BIOMETRIC_CREDENTIALS } from "../types/biometric.types.js";
import type { AuthService } from "./auth.service.js";

export interface BiometricAuthServiceDeps {
  credentials: BiometricCredentialRepository;
  users: UserRepository;
  auth: AuthService;
  clock: Clock;
  eventLog: EventLogger;
  challengeTtlSeconds: number;
}

const credentialInvalid = () =>
  new AppError(
    401,
    "BIOMETRIC_CREDENTIAL_INVALID",
    "A biometria não está habilitada neste aparelho. Entre com e-mail e senha.",
  );
const challengeInvalid = () =>
  new AppError(401, "BIOMETRIC_CHALLENGE_INVALID", "Desafio inválido ou expirado. Tente entrar novamente.");
const signatureInvalid = () =>
  new AppError(401, "BIOMETRIC_SIGNATURE_INVALID", "Não foi possível confirmar a biometria. Tente novamente.");

function toCredentialDto(record: BiometricCredentialRecord): BiometricCredentialResponseDto {
  return {
    id: record.id,
    deviceName: record.deviceName,
    keyType: record.keyType === "ec" ? "ec" : "rsa",
    createdAt: record.createdAt.toISOString(),
    lastUsedAt: record.lastUsedAt ? record.lastUsedAt.toISOString() : null,
  };
}

/**
 * R40: login por biometria como alternativa à senha. O aparelho guarda a chave privada no
 * Keystore, liberada só pela digital; o servidor guarda a chave pública e confere a assinatura
 * de um desafio de uso único. A política de bloqueio por tentativas (R87) é a mesma da senha.
 */
export class BiometricAuthService {
  constructor(private readonly deps: BiometricAuthServiceDeps) {}

  async enroll(userId: string, input: EnrollBiometricRequestDto, meta: RequestMeta): Promise<BiometricCredentialResponseDto> {
    const { credentials, clock, eventLog } = this.deps;
    const key = parseDevicePublicKey(input.publicKey);
    if (!key) {
      throw errors.invalidField(
        "publicKey",
        "Chave pública inválida. Envie a chave gerada pelo aparelho (RSA 2048 bits ou EC P-256) em base64.",
      );
    }
    if ((await credentials.countActive(userId)) >= MAX_BIOMETRIC_CREDENTIALS) {
      throw errors.conflict(
        "BIOMETRIC_LIMIT_REACHED",
        `Você já habilitou a biometria em ${MAX_BIOMETRIC_CREDENTIALS} aparelhos. Desabilite um deles antes.`,
      );
    }
    try {
      const record = await credentials.insert({
        userId,
        deviceName: input.deviceName,
        publicKey: key.normalized,
        keyType: key.keyType,
        keyFingerprint: key.fingerprint,
        createdAt: clock.now(),
      });
      eventLog.record("auth.biometric_enrolled", { userId, requestId: meta.requestId ?? null, context: { credentialId: record.id } });
      return toCredentialDto(record);
    } catch (error) {
      if (error instanceof DuplicateEntryError) {
        throw errors.conflict("BIOMETRIC_KEY_ALREADY_REGISTERED", "Esta chave já está cadastrada para a sua conta.");
      }
      throw error;
    }
  }

  async list(userId: string): Promise<BiometricCredentialListResponseDto> {
    return { data: (await this.deps.credentials.listActive(userId)).map(toCredentialDto) };
  }

  async revoke(userId: string, credentialId: string, meta: RequestMeta): Promise<void> {
    if (!(await this.deps.credentials.revoke(userId, credentialId, this.deps.clock.now()))) {
      throw errors.notFound("Aparelho com biometria");
    }
    this.deps.eventLog.record("auth.biometric_revoked", { userId, requestId: meta.requestId ?? null, context: { credentialId } });
  }

  /** Emite o desafio que o aparelho vai assinar; um novo pedido invalida o anterior. */
  async createChallenge(credentialId: string): Promise<BiometricChallengeResponseDto> {
    const { credentials, clock, challengeTtlSeconds } = this.deps;
    const credential = await credentials.findActive(credentialId);
    if (!credential) throw credentialInvalid();
    const challenge = generateOpaqueToken();
    const expiresAt = new Date(clock.now().getTime() + challengeTtlSeconds * 1000);
    await credentials.setChallenge(credential.id, hashOpaqueToken(challenge), expiresAt);
    return { credentialId: credential.id, challenge, expiresAt: expiresAt.toISOString() };
  }

  async login(input: BiometricLoginRequestDto, meta: RequestMeta): Promise<AuthResultResponseDto> {
    const { credentials, users, auth, clock, eventLog } = this.deps;
    const credential = await credentials.findActive(input.credentialId);
    if (!credential) {
      eventLog.record("auth.login_failed", {
        level: "warn",
        requestId: meta.requestId ?? null,
        context: { reason: "biometric_unknown_credential" },
      });
      throw credentialInvalid();
    }
    const user = await users.findById(credential.userId);
    if (!user) throw credentialInvalid();

    const now = clock.now();
    auth.assertNotLocked(user, now, meta);
    // Uso único: o desafio é consumido antes da verificação, então não pode ser reaproveitado.
    if (!(await credentials.consumeChallenge(credential.id, hashOpaqueToken(input.challenge), now))) {
      throw challengeInvalid();
    }
    if (!verifyDeviceSignature(credential.publicKey, input.challenge, input.signature)) {
      await auth.registerFailedAttempt(user, now, meta, "biometric_signature");
      throw signatureInvalid();
    }
    await credentials.markUsed(credential.id, now);
    return auth.completeLogin(user, meta, "biometric");
  }
}
