import { categoryIcon, normalizeTag, walletTypeMeta } from "./catalog";
import {
  currentMonth,
  firstDayOfMonth,
  formatDate,
  lastDayOfMonth,
  monthLabel,
  monthToDate,
  shiftMonth,
  shortMonthLabel,
} from "./dates";
import {
  currencySymbol,
  formatAmountInput,
  formatMoney,
  formatMoneyWithSign,
  formatSignedMoney,
  parseAmountInput,
  toPrimaryCurrency,
} from "./money";
import { emailError, passwordPolicyViolations, passwordStrength, usernameError } from "./password-policy";

describe("dinheiro (R28/R29)", () => {
  it("formata no padrão brasileiro com o símbolo de cada moeda", () => {
    expect(formatMoney(1234.5, "BRL")).toBe("R$ 1.234,50");
    expect(formatMoney(908, "USD")).toBe("US$ 908,00");
    expect(formatMoney(720, "EUR")).toBe("€ 720,00");
  });

  it("mostra o sinal de entrada e saída", () => {
    expect(formatSignedMoney(10, "BRL", "in")).toBe("+R$ 10,00");
    expect(formatSignedMoney(10, "BRL", "out")).toBe("−R$ 10,00");
    expect(formatMoneyWithSign(-5.5, "BRL")).toBe("−R$ 5,50");
  });

  it("devolve o símbolo da moeda", () => {
    expect(currencySymbol("BRL")).toBe("R$");
    expect(currencySymbol("USD")).toBe("US$");
  });

  it.each([
    ["47,90", 47.9],
    ["1.234,56", 1234.56],
    ["1234.56", 1234.56],
    ["1.234", 1234],
    ["R$ 10", 10],
    ["0,5", 0.5],
    ["12,", 12],
  ])("interpreta o valor digitado %p", (text, expected) => {
    expect(parseAmountInput(text)).toBe(expected);
  });

  it.each(["", "abc", "10,999", "1,2,3", "1.2.3"])("recusa o valor inválido %p", (text) => {
    expect(parseAmountInput(text)).toBeNull();
  });

  it("prepara o valor para edição", () => {
    expect(formatAmountInput(47.9)).toBe("47,90");
  });

  it("converte para a moeda principal pela tabela de câmbio", () => {
    const rates = { USD: 0.2, EUR: 0.18 };
    expect(toPrimaryCurrency(100, "BRL", "BRL", rates)).toBe(100);
    expect(toPrimaryCurrency(20, "USD", "BRL", rates)).toBeCloseTo(100);
    expect(toPrimaryCurrency(10, "GBP", "BRL", rates)).toBeNull();
  });
});

describe("datas (R26)", () => {
  it("navega entre meses atravessando o ano", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-09", -5)).toBe("2026-04");
  });

  it("calcula o primeiro e o último dia do mês", () => {
    expect(firstDayOfMonth("2026-09")).toBe("2026-09-01");
    expect(lastDayOfMonth("2024-02")).toBe("2024-02-29");
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28");
  });

  it("formata rótulos em português", () => {
    expect(monthLabel("2026-09")).toBe("Setembro de 2026");
    expect(shortMonthLabel("2026-03")).toBe("mar.");
    expect(formatDate("2026-09-13")).toBe("13/09/2026");
    expect(formatDate("2026-09-13", "dayMonth")).toBe("13 de set.");
    expect(formatDate("2026-09-13", "long")).toBe("13 de setembro de 2026");
  });

  it("usa o mês corrente até hoje como período padrão", () => {
    const now = new Date(2026, 9, 4, 10);
    expect(currentMonth(now)).toBe("2026-10");
    expect(monthToDate(now)).toEqual({ from: "2026-10-01", to: "2026-10-04" });
  });
});

describe("política de senha (R02)", () => {
  it("aceita senha forte", () => {
    expect(passwordPolicyViolations("Senha@Forte123")).toEqual([]);
  });

  it("aponta cada regra não atendida, como o backend", () => {
    expect(passwordPolicyViolations("abc")).toEqual([
      "A senha deve ter pelo menos 8 caracteres.",
      "A senha deve conter pelo menos uma letra maiúscula.",
      "A senha deve conter pelo menos um número.",
      "A senha deve conter pelo menos um caractere especial.",
    ]);
  });

  it("não deixa a senha conter o usuário ou o e-mail", () => {
    expect(passwordPolicyViolations("Joao@12345", { username: "joao" })).toContain(
      "A senha não pode conter o nome de usuário.",
    );
    expect(passwordPolicyViolations("Maria#2026x", { email: "maria@ex.com" })).toContain(
      "A senha não pode conter o e-mail.",
    );
  });

  it("mede a força de 0 a 4", () => {
    expect(passwordStrength("abc")).toBe(0);
    expect(passwordStrength("abcdefgh")).toBe(1);
    expect(passwordStrength("Senha@Forte123")).toBe(4);
  });

  it("valida nome de usuário e e-mail", () => {
    expect(usernameError("jo")).toBe("Use pelo menos 3 caracteres.");
    expect(usernameError("joão")).toBe("Use apenas letras sem acento, números, ponto e sublinhado.");
    expect(usernameError("ana.silva")).toBeNull();
    expect(emailError("x@")).toBe("Informe um e-mail válido.");
    expect(emailError(" ana@ex.com ")).toBeNull();
  });
});

describe("catálogo (R07, R43, R53)", () => {
  it("usa o ícone da categoria predefinida e infere o das personalizadas", () => {
    expect(categoryIcon({ systemKey: "food", name: "Alimentação" })).toBe("restaurant");
    expect(categoryIcon({ systemKey: null, name: "Freelance" })).toBe("work");
    expect(categoryIcon({ systemKey: null, name: "Pets" })).toBe("label");
  });

  it("define ícone e cor pelo tipo de carteira", () => {
    expect(walletTypeMeta("credit_card")).toMatchObject({ icon: "credit_card", label: "Cartão de crédito" });
  });

  it("normaliza tags como o backend", () => {
    expect(normalizeTag("  #Viagem   SP ")).toBe("Viagem SP");
  });
});
