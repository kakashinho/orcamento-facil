import { createHash, randomBytes } from "node:crypto";
import { createSigner, createVerifier } from "fast-jwt";
import type { Clock } from "../../infra/clock.js";
import { errors } from "../../shared/errors.js";

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  role: "user" | "admin";
  typ: "access";
  iat: number;
  exp: number;
}

/**
 * Access token JWT (HS256) de curta duração (R03/R87). A expiração é verificada contra
 * o relógio injetado; a assinatura e o algoritmo, pela biblioteca fast-jwt.
 */
export class AccessTokenService {
  private readonly signer: (payload: Record<string, unknown>) => string;
  private readonly verifier: (token: string) => Record<string, unknown>;

  constructor(
    secret: string,
    private readonly ttlSeconds: number,
    private readonly clock: Clock,
  ) {
    this.signer = createSigner({ key: secret, algorithm: "HS256", noTimestamp: true });
    this.verifier = createVerifier({
      key: secret,
      algorithms: ["HS256"],
      ignoreExpiration: true,
      ignoreNotBefore: true,
      cache: false,
    });
  }

  issue(input: { userId: string; sessionId: string; role: "user" | "admin" }): { token: string; expiresIn: number } {
    const issuedAt = Math.floor(this.clock.now().getTime() / 1000);
    const claims: AccessTokenClaims = {
      sub: input.userId,
      sid: input.sessionId,
      role: input.role,
      typ: "access",
      iat: issuedAt,
      exp: issuedAt + this.ttlSeconds,
    };
    return { token: this.signer({ ...claims }), expiresIn: this.ttlSeconds };
  }

  verify(token: string): AccessTokenClaims {
    let payload: Record<string, unknown>;
    try {
      payload = this.verifier(token);
    } catch {
      throw errors.invalidToken();
    }
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const valid =
      payload.typ === "access" &&
      typeof payload.sub === "string" &&
      typeof payload.sid === "string" &&
      (payload.role === "user" || payload.role === "admin") &&
      typeof payload.exp === "number" &&
      payload.exp > now;
    if (!valid) {
      throw errors.invalidToken();
    }
    return payload as unknown as AccessTokenClaims;
  }
}

/** Token opaco de alta entropia (refresh e recuperação de senha). */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Apenas o hash SHA-256 do token é persistido — nunca o token em claro. */
export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
