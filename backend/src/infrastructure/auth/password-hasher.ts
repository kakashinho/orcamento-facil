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
 * Hash de senha com scrypt (função de derivação recomendada pela OWASP). Formato:
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

/** Hasher configurado com o custo da aplicação, injetado no service de autenticação. */
export class PasswordHasher {
  constructor(private readonly options: PasswordHashingOptions) {}

  hash(password: string): Promise<string> {
    return hashPassword(password, this.options);
  }

  verify(password: string, stored: string): Promise<boolean> {
    return verifyPassword(password, stored);
  }
}
