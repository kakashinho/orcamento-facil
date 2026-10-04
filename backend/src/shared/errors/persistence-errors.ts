/**
 * Sinal da camada de persistência: um valor único já existe (ex.: e-mail cadastrado).
 * O repository traduz a violação de constraint do PostgreSQL neste erro; o service
 * decide a mensagem e o código HTTP de negócio.
 */
export class DuplicateEntryError extends Error {
  readonly field: string;

  constructor(field: string) {
    super(`Valor duplicado para o campo ${field}`);
    this.name = "DuplicateEntryError";
    this.field = field;
  }
}
