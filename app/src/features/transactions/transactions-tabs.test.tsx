import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { currentMonth, monthLabel, shiftMonth } from "@/domain/dates";
import { transaction, wallet } from "@/test-utils/fixtures";
import { renderWithProviders, setupApi, signIn } from "@/test-utils/render";
import { CashFlowTab } from "./cash-flow-tab";
import { HistoryTab } from "./history-tab";
import { StatementTab } from "./statement-tab";

describe("histórico (R09, R10, R26, R52, R70)", () => {
  beforeEach(() => signIn());

  function setupPages() {
    return setupApi().on("GET", "/api/transactions", (req) =>
      req.query.cursor === "page-2"
        ? { body: { data: [transaction({ id: "t-2", description: "Padaria" })], nextCursor: null } }
        : { body: { data: [transaction({ id: "t-1", description: "Almoço" })], nextCursor: "page-2" } },
    );
  }

  it("lista o mês atual em ordem cronológica inversa e carrega a próxima página ao rolar", async () => {
    const api = setupPages();
    await renderWithProviders(<HistoryTab onOpen={jest.fn()} />);
    expect(await screen.findByText("Almoço")).toBeOnTheScreen();
    expect(api.lastCall("GET", "/api/transactions")!.query).toEqual({
      month: currentMonth(),
      archived: "false",
      sort: "date",
      order: "desc",
      limit: "20",
    });
    await fireEvent(screen.getByTestId("history-list"), "endReached");
    expect(await screen.findByText("Padaria")).toBeOnTheScreen();
    expect(api.lastCall("GET", "/api/transactions")!.query.cursor).toBe("page-2");
    expect(await screen.findByText("Fim do histórico deste período")).toBeOnTheScreen();
  });

  it("navega para o mês anterior (R26) e mostra o resumo do mês", async () => {
    const api = setupPages();
    await renderWithProviders(<HistoryTab onOpen={jest.fn()} />);
    expect(await screen.findByTestId("history-summary")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Mês anterior" }));
    const previous = shiftMonth(currentMonth(), -1);
    expect(screen.getByText(monthLabel(previous))).toBeOnTheScreen();
    await waitFor(() => expect(api.lastCall("GET", "/api/transactions")!.query.month).toBe(previous));
    expect(api.lastCall("GET", "/api/transactions/summary")!.query.month).toBe(previous);
  });

  it("busca pela descrição no servidor (R10)", async () => {
    const api = setupPages();
    await renderWithProviders(<HistoryTab onOpen={jest.fn()} />);
    await screen.findByText("Almoço");
    await fireEvent.changeText(screen.getByLabelText("Buscar por descrição"), "padaria");
    await waitFor(() => expect(api.lastCall("GET", "/api/transactions")!.query.q).toBe("padaria"), { timeout: 2000 });
  });

  it("ordena por valor e inverte a ordem no segundo toque (R70)", async () => {
    const api = setupPages();
    await renderWithProviders(<HistoryTab onOpen={jest.fn()} />);
    await screen.findByText("Almoço");
    await fireEvent.press(screen.getByRole("button", { name: "Ordenar por valor" }));
    await waitFor(() =>
      expect(api.lastCall("GET", "/api/transactions")!.query).toMatchObject({ sort: "amount", order: "desc" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Ordenar por valor, decrescente" }));
    await waitFor(() =>
      expect(api.lastCall("GET", "/api/transactions")!.query).toMatchObject({ sort: "amount", order: "asc" }),
    );
  });

  it("filtra por categoria e mostra só as arquivadas (R10, R52)", async () => {
    const api = setupPages();
    await renderWithProviders(<HistoryTab onOpen={jest.fn()} />);
    await screen.findByText("Almoço");
    await fireEvent.press(screen.getByRole("button", { name: "Filtros" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Transporte" }));
    await fireEvent.press(screen.getByRole("tab", { name: "Arquivadas" }));
    await waitFor(() =>
      expect(api.lastCall("GET", "/api/transactions")!.query).toMatchObject({
        categoryId: "00000000-0000-4000-8000-000000000002",
        archived: "true",
      }),
    );
  });

  it("abre os detalhes ao tocar na transação", async () => {
    setupPages();
    const onOpen = jest.fn();
    await renderWithProviders(<HistoryTab onOpen={onOpen} />);
    await fireEvent.press(await screen.findByText("Almoço"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "t-1" }));
  });

  it("mostra estado vazio quando não há transações", async () => {
    setupApi().on("GET", "/api/transactions", { body: { data: [], nextCursor: null } });
    await renderWithProviders(<HistoryTab onOpen={jest.fn()} />);
    expect(await screen.findByText("Nenhuma transação")).toBeOnTheScreen();
  });
});

describe("fluxo de caixa (R58) e gráfico mensal (R01)", () => {
  beforeEach(() => signIn());

  it("mostra entradas e saídas em ordem com saldo acumulado e totais", async () => {
    setupApi()
      .on("GET", "/api/reports/monthly", {
        body: {
          fromMonth: "2026-05",
          toMonth: "2026-10",
          primaryCurrency: "BRL",
          months: [{ month: "2026-10", totals: [], converted: { income: 6800, expense: 2200, net: 4600 } }],
        },
      })
      .on("GET", "/api/exchange-rates", {
        body: { base: "BRL", rates: { USD: 0.2 }, updatedAt: "", source: "x", stale: false },
      })
      .on("GET", "/api/reports/cash-flow", {
        body: {
          from: "2026-10-01",
          to: "2026-10-04",
          walletId: null,
          primaryCurrency: "BRL",
          entries: [
            {
              date: "2026-10-01",
              kind: "income",
              referenceId: "a",
              description: "Salário",
              wallet: { id: "w", name: "Conta", currency: "BRL" },
              category: { id: "c", name: "Salário" },
              amount: 6800,
            },
            {
              date: "2026-10-02",
              kind: "expense",
              referenceId: "b",
              description: "Aluguel",
              wallet: { id: "w", name: "Conta", currency: "BRL" },
              category: { id: "d", name: "Moradia" },
              amount: -2200,
            },
          ],
          totals: [{ currency: "BRL", inflow: 6800, outflow: 2200, net: 4600 }],
          convertedTotal: {
            currency: "BRL",
            inflow: 6800,
            outflow: 2200,
            net: 4600,
            ratesUpdatedAt: null,
            ratesStale: false,
          },
        },
      });
    await renderWithProviders(<CashFlowTab />);
    expect(await screen.findByText("Salário")).toBeOnTheScreen();
    expect(screen.getByText("saldo R$ 6.800,00")).toBeOnTheScreen();
    expect(screen.getByText("saldo R$ 4.600,00")).toBeOnTheScreen();
    expect(screen.getByText("+R$ 4.600,00")).toBeOnTheScreen();
    expect(screen.getByLabelText("Receitas e despesas por mês")).toBeOnTheScreen();
  });
});

describe("extrato e PDF (R41)", () => {
  beforeEach(() => signIn());

  it("mostra o resumo e baixa o PDF com o token de acesso", async () => {
    setupApi().on("GET", "/api/reports/statement", {
      body: {
        from: "2026-10-01",
        to: "2026-10-04",
        generatedAt: "",
        wallets: [
          {
            wallet: { id: wallet().id, name: "Conta corrente", currency: "BRL", type: "checking" },
            openingBalance: 1000,
            totalIn: 6800,
            totalOut: 2200,
            closingBalance: 5600,
            entries: [
              {
                date: "2026-10-01",
                kind: "income",
                referenceId: "a",
                description: "Salário",
                category: null,
                amount: 6800,
                balance: 7800,
              },
            ],
          },
        ],
      },
    });
    await renderWithProviders(<StatementTab />);
    expect(await screen.findByText("Saldo final")).toBeOnTheScreen();
    expect(screen.getByText("R$ 5.600,00")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Gerar extrato em PDF" }));
    expect(await screen.findByTestId("statement-pdf-ready")).toBeOnTheScreen();
    const [url, , options] = (File.downloadFileAsync as jest.Mock).mock.calls[0];
    expect(url).toMatch(/^http:\/\/api\.test\/api\/reports\/statement\/pdf\?from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/);
    expect(options).toEqual({ headers: { Authorization: "Bearer access-1" }, idempotent: true });

    await fireEvent.press(screen.getByRole("button", { name: "Abrir ou compartilhar PDF" }));
    await waitFor(() =>
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        expect.stringMatching(/^file:\/\/\/cache\/extrato_/),
        expect.objectContaining({ mimeType: "application/pdf" }),
      ),
    );
  });
});
