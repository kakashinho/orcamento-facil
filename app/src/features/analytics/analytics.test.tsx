import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import type { ByCategoryReport, MonthIndicators, Projection } from "@/data/api/types";
import { summarizeYear } from "@/domain/annual-summary";
import { describeShares, formatPercent, groupTopCategories } from "@/domain/charts";
import { addDays, dayLabel, daysBetween } from "@/domain/dates";
import { formatCompactMoney } from "@/domain/money";
import { categories, transaction, usdWallet } from "@/test-utils/fixtures";
import { renderWithProviders, setupApi, signIn } from "@/test-utils/render";
import { AnalyticsScreen } from "./analytics-screen";
import { describeEvolution, evolutionQuery } from "./balance-evolution-card";
import { breakdownRange } from "./category-breakdown-card";
import { savingsComparison } from "./month-indicators-card";
import { describeProjection } from "./projection-card";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));

const indicators = (overrides: Partial<MonthIndicators> = {}): MonthIndicators => ({
  month: "2026-10",
  currency: "BRL",
  days: 31,
  averageDailyBalance: 1234.5,
  ratesStale: false,
  savings: {
    saved: 900,
    previousAverage: 600,
    previousMonths: ["2026-07", "2026-08", "2026-09"],
    difference: 300,
    differencePercent: 50,
  },
  topExpenses: [
    { transaction: transaction({ id: "t1", description: "Aluguel", amount: 1500 }), convertedAmount: 1500 },
    {
      transaction: transaction({
        id: "t2",
        description: "Hotel",
        amount: 100,
        currency: "USD",
        wallet: { id: usdWallet.id, name: usdWallet.name, currency: "USD" },
      }),
      convertedAmount: 542,
    },
  ],
  ...overrides,
});

const byCategory = (overrides: Partial<ByCategoryReport> = {}): ByCategoryReport => ({
  from: "2026-10-01",
  to: "2026-10-31",
  type: "expense",
  primaryCurrency: "BRL",
  convertedTotal: 1000,
  categories: [
    { category: { id: categories[0].id, name: "Alimentação" }, count: 3, totals: [], convertedTotal: 600, share: 60 },
    { category: { id: categories[1].id, name: "Transporte" }, count: 2, totals: [], convertedTotal: 400, share: 40 },
  ],
  hidden: { count: 1, convertedTotal: 80 },
  ...overrides,
});

const evolution = {
  from: "2026-09-05",
  to: "2026-10-04",
  granularity: "day",
  currency: "BRL",
  walletId: null,
  points: [
    { date: "2026-10-02", balance: 1000 },
    { date: "2026-10-03", balance: null },
    { date: "2026-10-04", balance: 1500 },
  ],
  ratesStale: false,
};

const projection: Projection = {
  currency: "BRL",
  startBalance: 2000,
  ratesStale: false,
  months: [
    {
      month: "2026-11",
      openingBalance: 2000,
      expectedIncome: 5000,
      expectedExpense: 1500,
      closingBalance: 5500,
      items: [
        {
          seriesId: "s1",
          description: "Aluguel",
          kind: "recurring",
          type: "expense",
          date: "2026-11-05",
          amount: 1500,
        },
      ],
    },
    {
      month: "2026-12",
      openingBalance: 5500,
      expectedIncome: 5000,
      expectedExpense: 1500,
      closingBalance: 9000,
      items: [],
    },
  ],
};

function analyticsApi() {
  return setupApi()
    .on("GET", "/api/reports/month-indicators", { body: indicators() })
    .on("GET", "/api/reports/by-category", { body: byCategory() })
    .on("GET", "/api/reports/balance-evolution", { body: evolution })
    .on("GET", "/api/reports/monthly", {
      body: {
        fromMonth: "2026-01",
        toMonth: "2026-12",
        primaryCurrency: "BRL",
        months: [{ month: "2026-01", totals: [], converted: { income: 5000, expense: 3000, net: 2000 } }],
      },
    })
    .on("GET", "/api/reports/projection", { body: projection })
    .on("PUT", "/api/categories/:id/visibility", (req) => ({
      body: { ...categories[0], hiddenInReports: req.body.hiddenInReports },
    }));
}

describe("análises do mês (R35, R36, R75)", () => {
  beforeEach(() => signIn());

  it("abre com 3 consultas em paralelo e adia o resumo anual e a projeção (R83, R86)", async () => {
    const api = analyticsApi();
    await renderWithProviders(<AnalyticsScreen />, { sheets: true });
    expect(await screen.findByText("R$ 1.234,50")).toBeOnTheScreen();
    expect(screen.getByText("em 31 dias")).toBeOnTheScreen();
    expect(screen.getByTestId("month-saved")).toHaveTextContent("+R$ 900,00");
    expect(screen.getByTestId("savings-comparison")).toHaveTextContent(
      "R$ 300,00 a mais que a média dos últimos 3 meses",
    );
    expect(api.callsTo("GET", "/api/reports/month-indicators")).toHaveLength(1);
    expect(api.callsTo("GET", "/api/reports/by-category")).toHaveLength(1);
    expect(api.callsTo("GET", "/api/reports/balance-evolution")).toHaveLength(1);
    expect(api.callsTo("GET", "/api/reports/monthly")).toHaveLength(0);
    expect(api.callsTo("GET", "/api/reports/projection")).toHaveLength(0);

    // Os cartões adiados entram na área visível: agora consultam.
    for (const section of screen.getAllByTestId("deferred-section")) {
      await fireEvent(section, "layout", { nativeEvent: { layout: { x: 0, y: 100, width: 400, height: 300 } } });
    }
    await waitFor(() => expect(api.callsTo("GET", "/api/reports/projection")).toHaveLength(1));
    expect(api.lastCall("GET", "/api/reports/monthly")!.query).toEqual({ fromMonth: "2026-01", toMonth: "2026-12" });
    expect(await screen.findByTestId("annual-averages")).toHaveTextContent(
      "Média mensal: receitas R$ 5.000,00 · despesas R$ 3.000,00",
    );
    expect(within(screen.getByTestId("projection-month")).getByText("Aluguel")).toBeOnTheScreen();
  });

  it("lista as maiores despesas com o valor convertido e abre os detalhes", async () => {
    analyticsApi();
    await renderWithProviders(<AnalyticsScreen />, { sheets: true });
    const list = await screen.findByTestId("top-expenses");
    expect(await within(list).findByText("1º")).toBeOnTheScreen();
    expect(within(list).getByText("≈ R$ 542,00")).toBeOnTheScreen();
    await fireEvent.press(within(list).getByRole("button", { name: /^Aluguel/ }));
    expect(await screen.findByText("Detalhes da transação")).toBeOnTheScreen();
  });

  it("troca o mês pelo seletor, sem passar do mês atual", async () => {
    const api = analyticsApi();
    await renderWithProviders(<AnalyticsScreen />, { sheets: true });
    await screen.findByText("R$ 1.234,50");
    const selector = screen.getByTestId("analytics-month");
    expect(within(selector).getByRole("button", { name: "Próximo mês" })).toBeDisabled();
    await fireEvent.press(within(selector).getByRole("button", { name: "Mês anterior" }));
    await waitFor(() => expect(api.callsTo("GET", "/api/reports/month-indicators")).toHaveLength(2));
    expect(api.lastCall("GET", "/api/reports/month-indicators")!.query.month).not.toBe(
      api.callsTo("GET", "/api/reports/month-indicators")[0].query.month,
    );
  });

  it("mostra erro com tentar novamente", async () => {
    analyticsApi().on("GET", "/api/reports/month-indicators", {
      status: 500,
      body: { statusCode: 500, code: "INTERNAL", message: "Falhou." },
    });
    await renderWithProviders(<AnalyticsScreen />, { sheets: true });
    expect((await screen.findAllByRole("button", { name: "Tentar novamente" })).length).toBeGreaterThan(0);
  });
});

describe("evolução do saldo (R14)", () => {
  beforeEach(() => signIn());

  it("alterna 30 dias / 12 meses, filtra a carteira e avisa lacunas de câmbio", async () => {
    const api = analyticsApi();
    await renderWithProviders(<AnalyticsScreen />, { sheets: true });
    const card = await screen.findByTestId("balance-evolution");
    expect(
      await within(card).findByLabelText("Saldo foi de R$ 1.000,00 para R$ 1.500,00 no período"),
    ).toBeOnTheScreen();
    expect(within(card).getByText("Câmbio indisponível para alguns dias.")).toBeOnTheScreen();
    expect(api.lastCall("GET", "/api/reports/balance-evolution")!.query.granularity).toBe("day");

    await fireEvent.press(within(card).getByRole("tab", { name: "12 meses" }));
    await waitFor(() => expect(api.lastCall("GET", "/api/reports/balance-evolution")!.query.granularity).toBe("month"));
    await fireEvent.press(within(card).getByRole("button", { name: "Reserva Viagem" }));
    await waitFor(() =>
      expect(api.lastCall("GET", "/api/reports/balance-evolution")!.query.walletId).toBe(usdWallet.id),
    );
  });
});

describe("despesas por categoria (R13, R46, R50)", () => {
  beforeEach(() => signIn());

  it("mostra a pizza com legenda e percentuais, alterna para anéis e informa as ocultas", async () => {
    const api = analyticsApi();
    await renderWithProviders(<AnalyticsScreen />, { sheets: true });
    const card = await screen.findByTestId("category-breakdown");
    expect(await within(card).findByLabelText("Alimentação 60%, Transporte 40%")).toBeOnTheScreen();
    expect(within(card).getByLabelText("Alimentação: R$ 600,00 · 60%")).toBeOnTheScreen();
    expect(within(card).getByText("1 categoria oculta")).toBeOnTheScreen();
    expect(api.lastCall("GET", "/api/reports/by-category")!.query).toMatchObject({ type: "expense" });

    await fireEvent.press(within(card).getByRole("tab", { name: "Anéis" }));
    expect(within(card).getByTestId("category-rings")).toBeOnTheScreen();

    await fireEvent.press(within(card).getByRole("button", { name: "Mês anterior" }));
    await waitFor(() => expect(api.callsTo("GET", "/api/reports/by-category")).toHaveLength(2));
  });

  it("oculta uma categoria dos relatórios pela folha de categorias exibidas", async () => {
    const api = analyticsApi();
    await renderWithProviders(<AnalyticsScreen />, { sheets: true });
    const card = await screen.findByTestId("category-breakdown");
    await within(card).findByText("1 categoria oculta");
    await fireEvent.press(within(card).getByRole("button", { name: "Gerenciar" }));
    const sheet = await screen.findByTestId("category-visibility");
    expect(
      within(sheet).getByText("Categorias ocultas saem dos gráficos. Saldos e totais continuam completos."),
    ).toBeOnTheScreen();
    expect(within(sheet).queryByText("Salário")).toBeNull();
    const toggle = within(sheet).getByRole("switch", { name: "Exibir Alimentação nos relatórios" });
    expect(toggle).toBeChecked();
    await fireEvent.press(toggle);
    await waitFor(() =>
      expect(api.lastCall("PUT", "/api/categories/:id/visibility")!.body).toEqual({ hiddenInReports: true }),
    );
    expect(api.lastCall("PUT", "/api/categories/:id/visibility")!.path).toBe(
      `/api/categories/${categories[0].id}/visibility`,
    );
  });

  it("sem despesas no período mostra o aviso", async () => {
    analyticsApi().on("GET", "/api/reports/by-category", {
      body: byCategory({ categories: [], convertedTotal: 0, hidden: { count: 0, convertedTotal: 0 } }),
    });
    await renderWithProviders(<AnalyticsScreen />, { sheets: true });
    expect(await screen.findByText("Nenhuma despesa no período.")).toBeOnTheScreen();
  });
});

describe("regras das análises", () => {
  it("agrupa as 5 maiores categorias e soma o resto em Outras", () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({
      category: { id: `c${index}`, name: `Cat ${index}` },
      count: 1,
      totals: [],
      convertedTotal: (7 - index) * 10,
      share: null,
    }));
    const grouped = groupTopCategories([...rows, { ...rows[0], category: null, convertedTotal: 0 }]);
    expect(grouped.map((row) => row.label)).toEqual(["Cat 0", "Cat 1", "Cat 2", "Cat 3", "Cat 4", "Outras"]);
    expect(grouped[5].value).toBe(30);
    expect(grouped.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(100, 0);
    expect(groupTopCategories([rows[0]], { c0: "food" })[0].color).toBe("#E8710A");
    expect(describeShares(grouped.slice(0, 2))).toBe(
      "Cat 0 25%, Cat 1 21,4%".replace("21,4%", formatPercent(grouped[1].share)),
    );
    expect(formatPercent(4.46)).toBe("4,5%");
    expect(formatPercent(42.4)).toBe("42%");
  });

  it("resume o ano com totais e médias só dos meses decorridos", () => {
    const summary = summarizeYear(
      [
        { month: "2026-01", totals: [], converted: { income: 100, expense: 50, net: 50 } },
        { month: "2026-02", totals: [], converted: null },
        { month: "2026-03", totals: [], converted: { income: 300, expense: 150, net: 150 } },
      ],
      2026,
      "2026-03",
    );
    expect(summary.months).toHaveLength(12);
    expect(summary.months[3].future).toBe(true);
    expect(summary.monthsCounted).toBe(2);
    expect(summary.totals).toEqual({ income: 400, expense: 200, net: 200, averageIncome: 200, averageExpense: 100 });
  });

  it("compara a economia com a média dos meses anteriores", () => {
    const base = indicators().savings;
    expect(savingsComparison({ ...base, difference: -50.5 }, "BRL")).toBe(
      "R$ 50,50 a menos que a média dos últimos 3 meses",
    );
    expect(savingsComparison({ ...base, previousMonths: ["2026-09"] }, "BRL")).toBe(
      "R$ 300,00 a mais que o mês anterior",
    );
    expect(savingsComparison({ ...base, previousAverage: null, previousMonths: [] }, "BRL")).toBe(
      "Sem meses anteriores para comparar",
    );
  });

  it("monta os períodos dos gráficos", () => {
    const now = new Date(2026, 9, 4);
    expect(evolutionQuery("30d", null, now)).toEqual({ from: "2026-09-05", to: "2026-10-04", granularity: "day" });
    expect(evolutionQuery("12m", "w1", now)).toEqual({
      from: "2025-11-01",
      to: "2026-10-04",
      granularity: "month",
      walletId: "w1",
    });
    const custom = { from: "2026-01-01", to: "2026-01-31" };
    expect(breakdownRange("month", "2026-10", custom, now)).toEqual({ from: "2026-10-01", to: "2026-10-04" });
    expect(breakdownRange("previous", "2026-10", custom, now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(breakdownRange("quarter", "2026-10", custom, now)).toEqual({ from: "2026-08-01", to: "2026-10-04" });
    expect(breakdownRange("custom", "2026-10", custom, now)).toEqual(custom);
  });

  it("descreve as linhas em texto e formata eixos", () => {
    expect(describeEvolution(evolution as never)).toBe("Saldo foi de R$ 1.000,00 para R$ 1.500,00 no período");
    expect(describeProjection(projection)).toBe("Saldo deve ir de R$ 2.000,00 para R$ 9.000,00 até dezembro de 2026");
    expect(formatCompactMoney(950, "BRL")).toBe("R$ 950");
    expect(formatCompactMoney(1250, "BRL")).toBe("R$ 1,3 mil");
    expect(formatCompactMoney(-3_400_000, "BRL")).toBe("−R$ 3,4 mi");
    expect(dayLabel("2026-10-03")).toBe("03/10");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
  });
});
