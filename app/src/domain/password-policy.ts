/**
 * Política de senha forte (R02) — a mesma regra do backend
 * (backend/src/modules/auth/services/password-policy.ts), conferida antes do envio para o
 * usuário corrigir na hora. O servidor continua sendo a validação definitiva.
 */
export function passwordPolicyViolations(
  password: string,
  context: { email?: string; username?: string } = {},
): string[] {
  const violations: string[] = [];
  if (password.length < 8) violations.push("A senha deve ter pelo menos 8 caracteres.");
  if (password.length > 128) violations.push("A senha deve ter no máximo 128 caracteres.");
  if (!/[a-z]/.test(password)) violations.push("A senha deve conter pelo menos uma letra minúscula.");
  if (!/[A-Z]/.test(password)) violations.push("A senha deve conter pelo menos uma letra maiúscula.");
  if (!/\d/.test(password)) violations.push("A senha deve conter pelo menos um número.");
  if (!/[^A-Za-z0-9]/.test(password)) violations.push("A senha deve conter pelo menos um caractere especial.");

  const lower = password.toLowerCase();
  const username = context.username?.trim();
  if (username && username.length >= 3 && lower.includes(username.toLowerCase())) {
    violations.push("A senha não pode conter o nome de usuário.");
  }
  const emailLocalPart = context.email?.trim().split("@")[0];
  if (emailLocalPart && emailLocalPart.length >= 3 && lower.includes(emailLocalPart.toLowerCase())) {
    violations.push("A senha não pode conter o e-mail.");
  }
  return violations;
}

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export const STRENGTH_LABELS = ["muito fraca", "fraca", "razoável", "boa", "forte"] as const;

/** Medidor visual (0–4): tamanho, maiúscula, número e símbolo — como no protótipo. */
export function passwordStrength(password: string): PasswordStrength {
  const score =
    (password.length >= 8 ? 1 : 0) +
    (/[A-Z]/.test(password) && /[a-z]/.test(password) ? 1 : 0) +
    (/\d/.test(password) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(password) ? 1 : 0);
  return Math.min(4, score) as PasswordStrength;
}

/** Nome de usuário aceito pela API: 3–30 letras sem acento, números, ponto e sublinhado. */
export function usernameError(username: string): string | null {
  const value = username.trim();
  if (value.length < 3) return "Use pelo menos 3 caracteres.";
  if (value.length > 30) return "Use no máximo 30 caracteres.";
  if (!/^[A-Za-z0-9_.]+$/.test(value)) return "Use apenas letras sem acento, números, ponto e sublinhado.";
  return null;
}

export function emailError(email: string): string | null {
  const value = email.trim();
  if (!value) return "Informe o e-mail.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Informe um e-mail válido.";
  return null;
}
