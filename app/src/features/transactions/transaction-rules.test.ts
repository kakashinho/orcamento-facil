import type { CashFlowEntry } from "@/data/api/types";
import { categories, transaction } from "@/test-utils/fixtures";
import { parseSignedAmount } from "../wallets/wallet-form-sheet";
import { buildCashFlowRows } from "./cash-flow";
import {
  categoryAccepts,
  initialFormValues,
  mapServerFieldErrors,
  toCreateRequest,
  toUpdateRequest,
  validateTransactionForm,
} from "./transaction-form";

const defaults = { walletId: "w1", today: "2026-10-04" };

describe("formulário de transação (R06, R11)", () => {
  it("começa vazio para registrar e pré-carregado para editar", () => {
    expect(initialFormValues(null, defaults)).toEqual({
      type: "expense",
      amountText: "",
      description: "",
      walletId: "w1",
      categoryId: null,
      date: "2026-10-04",
      tags: [],
    });
    expect(initialFormValues(transaction(), defaults)).toMatchObject({
      amountText: "47,90",
      description: "Almoço",
      categoryId: categories[0].id,
      tags: ["trabalho"],
    });
  });

  it("valida valor e categoria antes de enviar", () => {
    const values = { ...initialFormValues(null, defaults), amountText: "abc" };
    expect(validateTransactionForm(values)).toEqual({
      amount: "Informe um valor válido, com até duas casas decimais.",
      category: "Escolha uma categoria.",
    });
    expect(validateTransactionForm({ ...values, amountText: "0" }).amount).toBe("O valor deve ser maior que zero.");
  });

  it("monta o corpo do registro e usa o nome da categoria sem descrição", () => {
    const values = {
      ...initialFormValues(null, defaults),
      amountText: "35,90",
      categoryId: categories[0].id,
      tags: ["casa"],
    };
    expect(toCreateRequest(values, categories)).toEqual({
      type: "expense",
      amount: 35.9,
      description: "Alimentação",
      date: "2026-10-04",
      walletId: "w1",
      categoryId: categories[0].id,
      tags: ["casa"],
    });
  });

  it("envia só os campos alterados na edição (R86)", () => {
    const original = transaction();
    const values = { ...initialFormValues(original, defaults), amountText: "50,00", tags: ["trabalho"] };
    expect(toUpdateRequest(original, values, categories)).toEqual({ amount: 50 });
    const changed = { ...values, categoryId: categories[1].id, tags: ["casa", "trabalho"] };
    expect(toUpdateRequest(original, changed, categories)).toEqual({
      amount: 50,
      categoryId: categories[1].id,
      tags: ["casa", "trabalho"],
    });
  });

  it("traduz os `details` da API para os campos do formulário", () => {
    expect(mapServerFieldErrors({ amount: "x", categoryId: "y", "tags.0": "z", walletId: "w" })).toEqual({
      amount: "x",
      category: "y",
      tags: "z",
      wallet: "w",
    });
  });

  it("só oferece categorias compatíveis com o tipo", () => {
    expect(categoryAccepts(categories[0], "expense")).toBe(true);
    expect(categoryAccepts(categories[0], "income")).toBe(false);
    expect(categoryAccepts(categories[3], "income")).toBe(true);
  });
});

describe("fluxo de caixa (R58)", () => {
  const entry = (
    amount: number,
    currency = "BRL",
    kind: CashFlowEntry["kind"] = amount >= 0 ? "income" : "expense",
  ): CashFlowEntry => ({
    date: "2026-10-01",
    kind,
    referenceId: `${amount}-${currency}`,
    description: "x",
    wallet: { id: currency, name: currency, currency },
    category: null,
    amount,
  });

  it("acumula o saldo na moeda principal", () => {
    const rows = buildCashFlowRows([entry(100), entry(-30), entry(10, "USD")], "BRL", { USD: 0.2 });
    expect(rows.map((r) => r.running)).toEqual([100, 70, 120]);
  });

  it("deixa o saldo indefinido quando falta cotação", () => {
    const rows = buildCashFlowRows([entry(100), entry(10, "GBP"), entry(5)], "BRL", {});
    expect(rows.map((r) => r.running)).toEqual([100, null, null]);
  });

  it("filtra entradas ou saídas mantendo o saldo correto", () => {
    const rows = buildCashFlowRows([entry(100), entry(-30), entry(50)], "BRL", {}, "in");
    expect(rows.map((r) => [r.entry.amount, r.running])).toEqual([
      [100, 100],
      [50, 120],
    ]);
  });

  it("marca transferências", () => {
    expect(buildCashFlowRows([entry(-10, "BRL", "transfer_out")], "BRL", {})[0].isTransfer).toBe(true);
  });
});

describe("saldo inicial da carteira", () => {
  it.each([
    ["", 0],
    ["150,50", 150.5],
    ["-150,50", -150.5],
    ["−20", -20],
    ["abc", null],
  ])("interpreta %p", (text, expected) => {
    expect(parseSignedAmount(text)).toBe(expected);
  });
});
