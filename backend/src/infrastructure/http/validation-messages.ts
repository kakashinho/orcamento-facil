import { z } from "zod";

/** Tipo errado (ex.: "10" em vez de 10): o que o campo espera, dito para o usuário. */
const EXPECTED: Record<string, string> = {
  number: "Informe um número.",
  int: "Informe um número inteiro.",
  string: "Informe um texto.",
  boolean: "Informe verdadeiro ou falso (true/false).",
  array: "Informe uma lista.",
  object: "Informe um objeto.",
  date: "Informe uma data.",
};

/**
 * Mensagens de validação em português do Brasil. Os DTOs definem mensagens próprias para as
 * regras de cada campo; aqui ficam os casos gerais, com texto pensado para o usuário final.
 */
export function configureValidationMessages(): void {
  z.config(z.locales.ptBR());
  z.config({
    customError: (issue) => {
      if (issue.code === "invalid_type" && issue.input === undefined) return "Campo obrigatório.";
      if (issue.code === "invalid_type" && issue.input === null) return "Este campo não aceita nulo.";
      if (issue.code === "invalid_type" && EXPECTED[issue.expected]) return EXPECTED[issue.expected];
      if (issue.code === "unrecognized_keys") return "Campo não reconhecido.";
      if (issue.code === "invalid_value" && issue.values.length > 0) {
        return `Valor inválido. Use: ${issue.values.map((value) => String(value)).join(", ")}.`;
      }
      return undefined;
    },
  });
}
