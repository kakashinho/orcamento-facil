import { describe, expect, it } from "vitest";
import { advance, installmentCents, occurrenceDate } from "../../src/modules/finance/services/series-rules.js";

describe("calendário das séries (D-12)", () => {
  it("mensal mantém o dia original e cai no fim dos meses curtos", () => {
    const dates = [0, 1, 2, 3].map((index) => occurrenceDate("2026-01-31", 31, "monthly", index));
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(occurrenceDate("2028-01-31", 31, "monthly", 1)).toBe("2028-02-29");
  });

  it("anual em 29/02 cai em 28/02 nos anos comuns e volta a 29/02 nos bissextos", () => {
    expect([1, 2, 4].map((index) => occurrenceDate("2028-02-29", 29, "yearly", index))).toEqual([
      "2029-02-28",
      "2030-02-28",
      "2032-02-29",
    ]);
  });

  it("semanal soma 7 dias, inclusive na virada do ano", () => {
    expect(occurrenceDate("2026-12-28", 28, "weekly", 1)).toBe("2027-01-04");
  });

  it("mensal atravessa o ano", () => {
    expect(occurrenceDate("2026-11-15", 15, "monthly", 3)).toBe("2027-02-15");
  });
});

describe("divisão das parcelas (D-11)", () => {
  it("R$ 100,00 em 3 = 33,34 + 33,33 + 33,33", () => {
    expect([0, 1, 2].map((index) => installmentCents(100_00, 3, index))).toEqual([33_34, 33_33, 33_33]);
  });

  it("a soma das parcelas é sempre o total exato", () => {
    for (const total of [1_00, 99_99, 1234_57, 10_000_00]) {
      for (let count = 2; count <= 72; count += 1) {
        const sum = Array.from({ length: count }, (_, index) => installmentCents(total, count, index)).reduce((a, b) => a + b, 0);
        expect(sum).toBe(total);
      }
    }
  });
});

describe("avanço da série", () => {
  const base = { kind: "recurring" as const, frequency: "monthly" as const, startDate: "2026-01-10", anchorDay: 10, endDate: null, installments: null };

  it("recorrência sem fim calcula a próxima data", () => {
    expect(advance(base, 1)).toEqual({ nextDate: "2026-02-10", status: "active" });
  });

  it("recorrência para depois da data final", () => {
    expect(advance({ ...base, endDate: "2026-02-09" }, 1)).toEqual({ nextDate: null, status: "ended" });
    expect(advance({ ...base, endDate: "2026-02-10" }, 1)).toEqual({ nextDate: "2026-02-10", status: "active" });
  });

  it("parcelamento termina na última parcela", () => {
    const installments = { ...base, kind: "installment" as const, installments: 3 };
    expect(advance(installments, 2)).toEqual({ nextDate: "2026-03-10", status: "active" });
    expect(advance(installments, 3)).toEqual({ nextDate: null, status: "ended" });
  });
});
