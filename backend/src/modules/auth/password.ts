import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const BLOCK_SIZE = 8;

export interface PasswordHashingOptions {
  /** log2 do parâmetro N do scrypt (custo de CPU/memória). */
  costLog2: number;
  parallelization: number;
}

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

function scryptOptions(costLog2: number, blockSize: number, parallelization: number): ScryptOptions {
  const cost = 2 ** costLog2;
  return { N: cost, r: blockSize, p: parallelization, maxmem: 256 * cost * blockSize };
}

/**
 * Hash de senha com scrypt (função de derivação resistente a hardware dedicado,
 * recomendada pela OWASP). Formato autodescritivo:
 * scrypt$<log2N>$<r>$<p>$<salt base64>$<hash base64>
 * Os parâmetros ficam no hash, então elevar o custo no futuro não invalida senhas antigas.
 */
export async function hashPassword(password: string, options: PasswordHashingOptions): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(
    password.normalize("NFKC"),
    salt,
    KEY_LENGTH,
    scryptOptions(options.costLog2, BLOCK_SIZE, options.parallelization),
  );
  return ["scrypt", options.costLog2, BLOCK_SIZE, options.parallelization, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const costLog2 = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelization = Number(parts[3]);
  if (![costLog2, blockSize, parallelization].every((value) => Number.isInteger(value) && value > 0) || costLog2 > 22) {
    return false;
  }
  const salt = Buffer.from(parts[4] ?? "", "base64");
  const expected = Buffer.from(parts[5] ?? "", "base64");
  if (expected.length === 0) return false;
  const key = await scrypt(
    password.normalize("NFKC"),
    salt,
    expected.length,
    scryptOptions(costLog2, blockSize, parallelization),
  );
  return timingSafeEqual(key, expected);
}

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
