import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = 1 + IV_LENGTH;

/**
 * Criptografia de campo na aplicação (R81): AES-256-GCM, padrão da indústria,
 * com autenticação do conteúdo.
 *
 * Envelope persistido em BYTEA: versão da chave (1 byte) || IV (12) || ciphertext || tag (16).
 * A versão no próprio envelope permite rotação progressiva de chaves sem colunas extras.
 *
 * Cada valor é cifrado com AAD (dados associados) que identifica tabela, coluna e linha
 * (ex.: "transaction.amount:<uuid>"). Assim, copiar o ciphertext de uma linha para outra
 * no banco faz a decifragem falhar, em vez de produzir um valor válido.
 */
export class FieldCipher {
  private readonly keys: Map<number, Buffer>;
  private readonly activeVersion: number;

  constructor(keys: Map<number, Buffer>, activeVersion: number) {
    for (const [version, key] of keys) {
      if (key.length !== 32) {
        throw new Error(`Chave de criptografia v${version} deve ter 32 bytes`);
      }
    }
    if (!keys.has(activeVersion)) {
      throw new Error(`Chave ativa v${activeVersion} não configurada`);
    }
    this.keys = keys;
    this.activeVersion = activeVersion;
  }

  encrypt(plaintext: Buffer, aad: string): Buffer {
    const key = this.keys.get(this.activeVersion)!;
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([Buffer.from([this.activeVersion]), iv, ciphertext, cipher.getAuthTag()]);
  }

  decrypt(envelope: Buffer | Uint8Array, aad: string): Buffer {
    const data = Buffer.isBuffer(envelope) ? envelope : Buffer.from(envelope);
    if (data.length < HEADER_LENGTH + TAG_LENGTH) {
      throw new Error("Envelope cifrado inválido");
    }
    const version = data[0]!;
    const key = this.keys.get(version);
    if (!key) {
      throw new Error(`Chave de criptografia v${version} indisponível`);
    }
    const iv = data.subarray(1, HEADER_LENGTH);
    const tag = data.subarray(data.length - TAG_LENGTH);
    const ciphertext = data.subarray(HEADER_LENGTH, data.length - TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /** Valor monetário em centavos (inteiro), cifrado como int64 big-endian. */
  encryptAmount(cents: number, aad: string): Buffer {
    if (!Number.isSafeInteger(cents)) {
      throw new Error("Valor monetário deve ser um inteiro seguro em centavos");
    }
    const plain = Buffer.alloc(8);
    plain.writeBigInt64BE(BigInt(cents));
    return this.encrypt(plain, aad);
  }

  decryptAmount(envelope: Buffer | Uint8Array, aad: string): number {
    const plain = this.decrypt(envelope, aad);
    if (plain.length !== 8) {
      throw new Error("Valor monetário cifrado com tamanho inesperado");
    }
    return Number(plain.readBigInt64BE());
  }

  encryptJson(value: unknown, aad: string): Buffer {
    return this.encrypt(Buffer.from(JSON.stringify(value), "utf8"), aad);
  }

  decryptJson<T>(envelope: Buffer | Uint8Array, aad: string): T {
    return JSON.parse(this.decrypt(envelope, aad).toString("utf8")) as T;
  }

  /** Indica se o valor foi cifrado com uma chave que não é a ativa (candidato à rotação). */
  needsRotation(envelope: Buffer | Uint8Array): boolean {
    return envelope[0] !== this.activeVersion;
  }
}

/** Identificadores de AAD — centralizados para que gravação e leitura nunca divirjam. */
export const aad = {
  walletBalance: (walletId: string) => `wallet.balance:${walletId}`,
  walletInitialBalance: (walletId: string) => `wallet.initial_balance:${walletId}`,
  transactionAmount: (transactionId: string) => `transaction.amount:${transactionId}`,
  transferSourceAmount: (transferId: string) => `transfer.source_amount:${transferId}`,
  transferTargetAmount: (transferId: string) => `transfer.target_amount:${transferId}`,
  historySnapshot: (historyId: string) => `history.snapshot:${historyId}`,
};
