import { describe, expect, it } from "vitest";
import { suggestCategories } from "../../src/modules/finance/services/category-suggester.js";
import { parseTransactionText } from "../../src/modules/finance/services/transaction-text-parser.js";

const predefined = [
  { id: "food", name: "Alimentação", systemKey: "food" },
  { id: "transport", name: "Transporte", systemKey: "transport" },
  { id: "leisure", name: "Lazer", systemKey: "leisure" },
  { id: "housing", name: "Moradia", systemKey: "housing" },
  { id: "health", name: "Saúde", systemKey: "health" },
  { id: "salary", name: "Salário", systemKey: "salary" },
];

describe("sugestão de categoria por palavras-chave (R44)", () => {
  it("reconhece palavras-chave, sem diferenciar acentos e maiúsculas", () => {
    expect(suggestCategories("Almoço no RESTAURANTE", predefined, [])[0]?.categoryId).toBe("food");
    expect(suggestCategories("Uber para o trabalho", predefined, [])[0]?.categoryId).toBe("transport");
    expect(suggestCategories("Farmácia São João", predefined, [])[0]?.categoryId).toBe("health");
    expect(suggestCategories("conta de luz", predefined, [])[0]?.categoryId).toBe("housing");
    expect(suggestCategories("Salário de outubro", predefined, [])[0]?.categoryId).toBe("salary");
  });

  it("não sugere nada sem evidência", () => {
    expect(suggestCategories("xpto qwerty", predefined, [])).toEqual([]);
    expect(suggestCategories("", predefined, [])).toEqual([]);
  });

  it("considera categorias personalizadas pelo nome", () => {
    const categories = [...predefined, { id: "pets", name: "Pets", systemKey: null }];
    expect(suggestCategories("Ração dos pets", categories, [])[0]?.categoryId).toBe("pets");
  });

  it("aprende com o histórico de categorização do usuário", () => {
    const categories = [...predefined, { id: "pets", name: "Bichos", systemKey: null }];
    const history = [
      { description: "Petshop Amigo", categoryId: "pets" },
      { description: "Petshop Amigo banho", categoryId: "pets" },
    ];
    const [first] = suggestCategories("petshop amigo", categories, history);
    expect(first?.categoryId).toBe("pets");
    expect(first?.confidence).toBeGreaterThan(0);
    expect(first?.reasons.some((reason) => reason.startsWith("histórico"))).toBe(true);
  });
});

describe("interpretação de frase falada (R65)", () => {
  const today = "2026-10-03";

  it("despesa com valor decimal e 'ontem'", () => {
    expect(parseTransactionText("Gastei 35,90 no mercado ontem", today)).toEqual({
      type: "expense",
      amount: 35.9,
      date: "2026-10-02",
      description: "Mercado",
    });
  });

  it("receita com milhar e 'dia N' no mês anterior", () => {
    expect(parseTransactionText("recebi 2.500 de salário dia 28", today)).toEqual({
      type: "income",
      amount: 2500,
      date: "2026-09-28",
      description: "Salário",
    });
  });

  it("valor com R$, reais e centavos e data explícita", () => {
    const draft = parseTransactionText("paguei R$ 120 reais e 50 centavos de conta de luz 01/10", today);
    expect(draft).toMatchObject({ type: "expense", amount: 120.5, date: "2026-10-01", description: "Conta de luz" });
  });

  it("centavos falados sem a palavra 'centavos' ('35 e 90' = 35,90)", () => {
    expect(parseTransactionText("gastei 35 e 90 no mercado ontem", today)).toMatchObject({ amount: 35.9, description: "Mercado" });
    expect(parseTransactionText("paguei 35 reais e 90 de luz", today)).toMatchObject({ amount: 35.9, description: "Luz" });
    // Valor com vírgula não recebe centavos falados; "e 900" não é centavo.
    expect(parseTransactionText("gastei 35,90 e 10 no mercado", today)).toMatchObject({ amount: 35.9, description: "10 no mercado" });
    expect(parseTransactionText("gastei 35 e 900 no mercado", today)).toMatchObject({ amount: 35, description: "900 no mercado" });
  });

  it("sem valor reconhecível devolve amount nulo e data de hoje", () => {
    expect(parseTransactionText("comprei pão", today)).toEqual({
      type: "expense",
      amount: null,
      date: today,
      description: "Pão",
    });
  });
});
