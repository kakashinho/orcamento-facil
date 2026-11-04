import {
  formatInstallmentsPreview,
  installmentCents,
  parseInstallmentsInput,
  previewInstallments,
  repeatLabel,
  seriesErrorMessage,
  seriesLabel,
  validateEndDate,
  validateInstallments,
} from "./series";

describe("rótulos das séries (R37, R62)", () => {
  it("mostra a parcela e a frequência", () => {
    expect(seriesLabel({ kind: "installment", frequency: "monthly", occurrence: 3, total: 10 })).toBe("Parcela 3/10");
    expect(seriesLabel({ kind: "recurring", frequency: "monthly", occurrence: 4, total: null })).toBe(
      "Repete todo mês",
    );
    expect(repeatLabel("weekly")).toBe("Repete toda semana");
    expect(repeatLabel("yearly")).toBe("Repete todo ano");
  });
});

describe("prévia das parcelas (mesma regra do servidor: a sobra fica na 1ª)", () => {
  it("divide o total e põe a sobra na 1ª parcela", () => {
    expect(previewInstallments(100, 3)).toEqual({ count: 3, first: 33.34, others: 33.33 });
    expect(previewInstallments(123.55, 10)).toEqual({ count: 10, first: 12.4, others: 12.35 });
    expect(previewInstallments(1200, 12)).toEqual({ count: 12, first: 100, others: 100 });
  });

  it("a soma das parcelas é sempre o total, em centavos", () => {
    for (const [total, count] of [
      [0.05, 2],
      [10, 3],
      [999.99, 7],
      [12345.67, 72],
      [0.72, 72],
    ] as const) {
      const cents = Math.round(total * 100);
      const parts = Array.from({ length: count }, (_, index) => installmentCents(cents, count, index));
      expect(parts.reduce((sum, value) => sum + value, 0)).toBe(cents);
      expect(Math.min(...parts.slice(1))).toBe(Math.floor(cents / count));
      const preview = previewInstallments(total, count)!;
      expect(Math.round(preview.first * 100) + Math.round(preview.others * 100) * (count - 1)).toBe(cents);
    }
  });

  it("recusa contagens fora de 2–72 e totais pequenos demais", () => {
    expect(previewInstallments(100, 1)).toBeNull();
    expect(previewInstallments(100, 73)).toBeNull();
    expect(previewInstallments(100, 2.5)).toBeNull();
    expect(previewInstallments(0.01, 2)).toBeNull();
    expect(previewInstallments(0.71, 72)).toBeNull();
  });

  it("formata a prévia", () => {
    expect(formatInstallmentsPreview(previewInstallments(100, 3)!, "BRL")).toBe("3 × R$ 33,33 (1ª de R$ 33,34)");
    expect(formatInstallmentsPreview(previewInstallments(120, 3)!, "BRL")).toBe("3 × R$ 40,00");
  });
});

describe("validação do parcelamento e da recorrência", () => {
  it("aceita de 2 a 72 parcelas", () => {
    expect(parseInstallmentsInput("10")).toBe(10);
    expect(parseInstallmentsInput(" 3 ")).toBe(3);
    expect(parseInstallmentsInput("")).toBeNull();
    expect(parseInstallmentsInput("2,5")).toBeNull();
    expect(validateInstallments(2, 100)).toBeNull();
    expect(validateInstallments(72, 100)).toBeNull();
    expect(validateInstallments(1, 100)).toBe("Use de 2 a 72 parcelas.");
    expect(validateInstallments(73, 100)).toBe("Use de 2 a 72 parcelas.");
    expect(validateInstallments(null, 100)).toBe("Use de 2 a 72 parcelas.");
    expect(validateInstallments(10, 0.05)).toBe("O valor total é pequeno demais para esse número de parcelas.");
    // Sem valor ainda: o erro do valor aparece no próprio campo.
    expect(validateInstallments(10, null)).toBeNull();
  });

  it("data final opcional, igual ou depois da primeira ocorrência", () => {
    expect(validateEndDate("", "2026-10-03")).toBeNull();
    expect(validateEndDate("2026-10-03", "2026-10-03")).toBeNull();
    expect(validateEndDate("2026-10-02", "2026-10-03")).toBe(
      "A data final deve ser igual ou posterior à primeira ocorrência.",
    );
  });

  it("traduz os erros de regra do servidor", () => {
    expect(seriesErrorMessage("TRANSACTION_TOO_OLD")).toBe(
      "Só é possível marcar como recorrente uma transação dos últimos 12 meses.",
    );
    expect(seriesErrorMessage("TRANSACTION_ALREADY_IN_SERIES")).toMatch(/já faz parte/);
    expect(seriesErrorMessage("OUTRO")).toBeNull();
  });
});
