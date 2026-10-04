import { describe, expect, it } from "vitest";
import {
  addDays,
  isValidIsoDate,
  isValidTimeZone,
  monthRange,
  monthsBetween,
  todayInTimeZone,
} from "../../src/shared/dates.js";
import { AppError } from "../../src/shared/errors.js";
import {
  convertCents,
  fromCents,
  impliedRate,
  isSupportedCurrency,
  normalizeRate,
  toCents,
} from "../../src/shared/money.js";

describe("money", () => {
  it("converte decimais em centavos sem erro de ponto flutuante", () => {
    expect(toCents(0.29)).toBe(29);
    expect(toCents(35.9)).toBe(3590);
    expect(toCents(1234567.89)).toBe(123456789);
    expect(fromCents(3590)).toBe(35.9);
  });

  it("rejeita mais de duas casas decimais", () => {
    expect(() => toCents(1.005)).toThrow(AppError);
    expect(() => toCents(Number.NaN)).toThrow(AppError);
  });

  it("converte entre moedas com arredondamento half-up em aritmética inteira", () => {
    expect(convertCents(10_000, 5)).toBe(50_000);
    expect(convertCents(1, 0.5)).toBe(1); // 0,5 centavo arredonda para cima
    expect(convertCents(3, "0.333333333333")).toBe(1);
    expect(convertCents(12_345, "0.18")).toBe(2222); // 2222,1
    expect(convertCents(-1000, 2)).toBe(-2000);
  });

  it("normaliza taxas e calcula taxa implícita", () => {
    expect(normalizeRate(5)).toBe("5");
    expect(normalizeRate(0.000123)).toBe("0.000123");
    expect(impliedRate(10_000, 52_000)).toBe("5.2");
  });

  it("reconhece códigos ISO 4217", () => {
    expect(isSupportedCurrency("BRL")).toBe(true);
    expect(isSupportedCurrency("USD")).toBe(true);
    expect(isSupportedCurrency("XYZ")).toBe(false);
  });
});

describe("dates", () => {
  it("valida datas ISO de verdade", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(isValidIsoDate("03/10/2026")).toBe(false);
  });

  it("calcula intervalo do mês e meses entre períodos", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("calcula 'hoje' no fuso do usuário", () => {
    const instant = new Date("2026-10-04T01:30:00Z");
    expect(todayInTimeZone(instant, "America/Sao_Paulo")).toBe("2026-10-03");
    expect(todayInTimeZone(instant, "UTC")).toBe("2026-10-04");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(isValidTimeZone("America/Sao_Paulo")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });
});
