/**
 * Política de senha forte (R02): 8 a 128 caracteres, com minúscula, maiúscula, número
 * e caractere especial, sem conter o nome de usuário ou o e-mail.
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
  if (context.username && context.username.length >= 3 && lower.includes(context.username.toLowerCase())) {
    violations.push("A senha não pode conter o nome de usuário.");
  }
  const emailLocalPart = context.email?.split("@")[0];
  if (emailLocalPart && emailLocalPart.length >= 3 && lower.includes(emailLocalPart.toLowerCase())) {
    violations.push("A senha não pode conter o e-mail.");
  }
  return violations;
}
