import {
  budgetFraction,
  budgetState,
  budgetStateColor,
  describeBudget,
  parseReductionPercent,
  percentLabel,
  remainingLabel,
  spentDifferenceLabel,
} from "./budgets";
import { deadlineError, deadlineLabel, goalPercentLabel, goalRemainingLabel, progressFraction } from "./goals";

const category = { id: "c1", name: "Alimentação", predefined: true };

describe("orçamentos (R21, R74, R45, R23)", () => {
  it.each([
    [0, 100, "ok"],
    [79.99, 100, "ok"],
    [80, 100, "warning"],
    [100, 100, "warning"],
    [100.01, 100, "exceeded"],
    [250, 100, "exceeded"],
  ] as const)("gasto %p de limite %p fica %p (mesmos limiares do backend)", (spent, limit, state) => {
    expect(budgetState(spent, limit)).toBe(state);
  });

  it("limita a barra a 100% e trata gasto indisponível", () => {
    expect(budgetFraction(50, 200)).toBe(0.25);
    expect(budgetFraction(300, 200)).toBe(1);
    expect(budgetFraction(null, 200)).toBe(0);
    expect(budgetFraction(10, 0)).toBe(0);
  });

  it("dá uma cor por estado nos dois temas", () => {
    expect(budgetStateColor("ok")).toBe("primary");
    expect(budgetStateColor("exceeded", "dark")).toBe("error");
    expect(budgetStateColor("warning", "light")).not.toBe(budgetStateColor("warning", "dark"));
  });

  it("descreve restante, excesso e percentual", () => {
    expect(remainingLabel({ remaining: 40, currency: "BRL" })).toBe("Restam R$ 40,00");
    expect(remainingLabel({ remaining: 0, currency: "BRL" })).toBe("Limite atingido");
    expect(remainingLabel({ remaining: -12.5, currency: "BRL" })).toBe("R$ 12,50 acima");
    expect(remainingLabel({ remaining: null, currency: "BRL" })).toBeNull();
    expect(percentLabel(82.4)).toBe("82%");
    expect(percentLabel(4.5)).toBe("4,5%");
    expect(percentLabel(null)).toBeNull();
  });

  it("resume a categoria para o leitor de tela do gráfico", () => {
    expect(describeBudget({ category, spent: 320, limit: 400, currency: "BRL" })).toBe(
      "Alimentação: gasto R$ 320,00 de R$ 400,00",
    );
    expect(describeBudget({ category, spent: null, limit: 400, currency: "BRL" })).toBe(
      "Alimentação: limite de R$ 400,00, gasto indisponível",
    );
  });

  it("calcula a diferença de gasto entre dois meses", () => {
    expect(spentDifferenceLabel(500, 380, "BRL")).toBe("R$ 120,00 a menos");
    expect(spentDifferenceLabel(380, 500, "BRL")).toBe("R$ 120,00 a mais");
    expect(spentDifferenceLabel(100, 100, "BRL")).toBe("Mesmo gasto");
    expect(spentDifferenceLabel(null, 100, "BRL")).toBeNull();
  });

  it.each([
    ["15", 15],
    ["1", 1],
    ["90%", 90],
    ["0", null],
    ["91", null],
    ["12,5", null],
    ["", null],
  ])("interpreta o percentual de redução %p (R67)", (text, expected) => {
    expect(parseReductionPercent(text)).toBe(expected);
  });
});

describe("metas de economia (R15, R16)", () => {
  it("limita o progresso da barra a 100%", () => {
    expect(progressFraction(250, 1000)).toBe(0.25);
    expect(progressFraction(1300, 1000)).toBe(1);
    expect(progressFraction(null, 1000)).toBe(0);
    expect(goalPercentLabel(130)).toBe("130%");
    expect(goalPercentLabel(99.9)).toBe("99%");
  });

  it.each([
    ["2026-11-16", "Faltam 12 dias"],
    ["2026-11-05", "Falta 1 dia"],
    ["2026-11-04", "Vence hoje"],
    ["2026-11-03", "Prazo encerrado"],
  ])("prazo %p visto em 04/11/2026: %p", (deadline, label) => {
    expect(deadlineLabel(deadline, "2026-11-04")).toBe(label);
  });

  it("mostra quanto falta e valida a data limite", () => {
    expect(goalRemainingLabel({ remaining: 300, currency: "BRL" })).toBe("Falta R$ 300,00");
    expect(goalRemainingLabel({ remaining: 0, currency: "BRL" })).toBe("Meta atingida");
    expect(goalRemainingLabel({ remaining: null, currency: "BRL" })).toBeNull();
    expect(deadlineError("", "2026-11-04")).toBe("Escolha a data limite.");
    expect(deadlineError("2026-11-03", "2026-11-04")).toBe("A data limite não pode estar no passado.");
    expect(deadlineError("2026-11-04", "2026-11-04")).toBeNull();
  });
});
