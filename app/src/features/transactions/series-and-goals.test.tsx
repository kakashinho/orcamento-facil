import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import type { ContributionResult, Goal, Series, Transaction } from "@/data/api/types";
import { apiError } from "@/test-utils/fake-api";
import { categories, transaction, wallet } from "@/test-utils/fixtures";
import { renderWithProviders, setupApi, signIn } from "@/test-utils/render";
import { TransactionRow } from "./components/transaction-row";
import { TransactionDetailsSheet } from "./transaction-details-sheet";
import { TransactionFormSheet } from "./transaction-form-sheet";

// ---------- dados de exemplo (no formato da API) ----------

const salary = (overrides: Partial<Transaction> = {}) =>
  transaction({
    id: "77777777-7777-4777-8777-777777777777",
    type: "income",
    amount: 3500,
    description: "Salário",
    category: { id: categories[2].id, name: "Salário", predefined: true },
    tags: [],
    ...overrides,
  });

const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: "66666666-6666-4666-8666-666666666666",
  name: "Viagem",
  category: { id: categories[3].id, name: "Outros", predefined: true },
  targetAmount: 4000,
  currency: "BRL",
  deadline: "2027-06-30",
  status: "active",
  achievedAt: null,
  saved: 500,
  percent: 12.5,
  remaining: 3500,
  daysLeft: 240,
  ...overrides,
});

const contribution = (achievedNow: boolean, amount = 3500): ContributionResult => ({
  contribution: {
    id: "88888888-8888-4888-8888-888888888888",
    goalId: goal().id,
    transactionId: salary().id,
    amount,
    currency: "BRL",
    createdAt: "2026-10-04T12:00:00.000Z",
  },
  goal: goal(achievedNow ? { status: "achieved", saved: 4000, percent: 100, remaining: 0 } : {}),
  achievedNow,
});

const series = (overrides: Partial<Series> = {}): Series => ({
  id: "99999999-9999-4999-8999-999999999990",
  kind: "recurring",
  type: "expense",
  frequency: "monthly",
  description: "Mercado",
  wallet: { id: wallet().id, name: wallet().name, currency: "BRL" },
  category: { id: categories[0].id, name: "Alimentação" },
  amount: 35.9,
  totalAmount: null,
  installments: null,
  startDate: "2026-10-03",
  endDate: null,
  nextDate: "2026-11-03",
  generatedCount: 1,
  remaining: null,
  status: "active",
  createdAt: "2026-10-03T12:00:00.000Z",
  ...overrides,
});

async function openForm() {
  const onClose = jest.fn();
  await renderWithProviders(<TransactionFormSheet open editing={null} onClose={onClose} />);
  await screen.findByRole("button", { name: "Carteira: Conta corrente (BRL)" });
  return onClose;
}

async function fillExpense(amount = "35,90") {
  await fireEvent.changeText(screen.getByLabelText("Valor"), amount);
  await fireEvent.changeText(screen.getByLabelText("Descrição"), "Mercado");
  await fireEvent.press(await screen.findByRole("button", { name: "Alimentação" }));
}

async function fillIncome(amount = "3500") {
  await fireEvent.press(screen.getByRole("tab", { name: "Receita" }));
  await fireEvent.changeText(screen.getByLabelText("Valor"), amount);
  await fireEvent.press(await screen.findByRole("button", { name: "Salário" }));
}

/** Escolhe a data no seletor nativo simulado do último DateField tocado. */
async function pickDate(date: Date) {
  const calls = (DateTimePickerAndroid.open as jest.Mock).mock.calls;
  await act(async () => calls[calls.length - 1][0].onChange({ type: "set" }, date));
}

describe("repetir e parcelar no formulário (R37, R62)", () => {
  beforeEach(() => signIn());

  it("Repetir mensal envia para a rota de recorrência, com o mesmo corpo e a frequência", async () => {
    const api = setupApi().on("POST", "/api/series/recurring", {
      status: 201,
      body: { series: series(), transactions: [transaction({ series: null })] },
    });
    const onClose = await openForm();
    await fillExpense();
    await fireEvent.press(screen.getByRole("tab", { name: "Mensal" }));
    expect(screen.getByText("As próximas aparecem automaticamente na data de cada uma.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Data final (opcional): Sem data final" }));
    await pickDate(new Date(2027, 9, 3, 12));
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.callsTo("POST", "/api/transactions")).toHaveLength(0);
    expect(api.lastCall("POST", "/api/series/recurring")!.body).toEqual({
      type: "expense",
      amount: 35.9,
      description: "Mercado",
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      walletId: wallet().id,
      categoryId: categories[0].id,
      tags: [],
      frequency: "monthly",
      endDate: "2027-10-03",
    });
    expect(await screen.findByText("Recorrência registrada!")).toBeOnTheScreen();
  });

  it("repetir o envio depois de uma falha reaproveita a Idempotency-Key; mudar o conteúdo gera outra", async () => {
    let attempts = 0;
    const api = setupApi().on("POST", "/api/series/recurring", () => {
      attempts += 1;
      return attempts === 1
        ? apiError(500, "INTERNAL_ERROR", "Erro interno.")
        : { status: 201, body: { series: series(), transactions: [transaction({ series: null })] } };
    });
    const onClose = await openForm();
    await fillExpense();
    await fireEvent.press(screen.getByRole("tab", { name: "Mensal" }));
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/series/recurring")).toHaveLength(1));
    expect(onClose).not.toHaveBeenCalled();

    await fireEvent.press(await screen.findByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [first, second] = api.callsTo("POST", "/api/series/recurring");
    expect(first!.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(second!.headers["idempotency-key"]).toBe(first!.headers["idempotency-key"]);
  });

  it("alterar o formulário depois de uma falha envia outra Idempotency-Key", async () => {
    const api = setupApi().on("POST", "/api/series/installments", apiError(500, "INTERNAL_ERROR", "Erro interno."));
    await openForm();
    await fillExpense("120");
    await fireEvent.press(screen.getByRole("switch", { name: "Parcelar" }));
    await fireEvent.changeText(screen.getByLabelText("Número de parcelas"), "4");
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/series/installments")).toHaveLength(1));

    await fireEvent.changeText(screen.getByLabelText("Número de parcelas"), "6");
    await fireEvent.press(await screen.findByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/series/installments")).toHaveLength(2));
    const [first, second] = api.callsTo("POST", "/api/series/installments");
    expect(second!.headers["idempotency-key"]).not.toBe(first!.headers["idempotency-key"]);
  });

  it("Parcelar mostra a prévia com a sobra na 1ª e envia o total para a rota de parcelamento", async () => {
    const api = setupApi().on("POST", "/api/series/installments", {
      status: 201,
      body: { series: series({ kind: "installment", installments: 10, totalAmount: 123.55 }), transactions: [] },
    });
    const onClose = await openForm();
    await fillExpense("123,55");
    await fireEvent.press(screen.getByRole("switch", { name: "Parcelar" }));
    await fireEvent.changeText(screen.getByLabelText("Número de parcelas"), "10");
    expect(screen.getByTestId("installments-preview")).toHaveTextContent("10 × R$ 12,35 (1ª de R$ 12,40)");
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.callsTo("POST", "/api/transactions")).toHaveLength(0);
    expect(api.lastCall("POST", "/api/series/installments")!.body).toEqual({
      totalAmount: 123.55,
      installments: 10,
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      description: "Mercado",
      walletId: wallet().id,
      categoryId: categories[0].id,
      tags: [],
    });
    expect(await screen.findByText("Parcelamento registrado!")).toBeOnTheScreen();
  });

  it("valida o número de parcelas antes de enviar e mantém Repetir e Parcelar exclusivos", async () => {
    const api = setupApi();
    await openForm();
    await fillExpense("100");
    await fireEvent.press(screen.getByRole("tab", { name: "Semanal" }));
    await fireEvent.press(screen.getByRole("switch", { name: "Parcelar" }));
    expect(screen.getByRole("tab", { name: "Não" })).toBeSelected();
    await fireEvent.changeText(screen.getByLabelText("Número de parcelas"), "1");
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Use de 2 a 72 parcelas.")).toBeOnTheScreen();
    expect(api.callsTo("POST", "/api/series/installments")).toHaveLength(0);

    await fireEvent.press(screen.getByRole("tab", { name: "Anual" }));
    expect(screen.getByRole("switch", { name: "Parcelar" })).not.toBeChecked();
  });

  it("receita não oferece Parcelar", async () => {
    setupApi();
    await openForm();
    expect(screen.getByRole("switch", { name: "Parcelar" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("tab", { name: "Receita" }));
    expect(screen.queryByRole("switch", { name: "Parcelar" })).toBeNull();
  });

  it("mostra o erro de regra do servidor no campo da data final", async () => {
    setupApi().on(
      "POST",
      "/api/series/recurring",
      apiError(422, "INVALID_END_DATE", "A data final deve ser igual ou posterior à primeira ocorrência.", [
        {
          location: "body",
          path: "endDate",
          message: "A data final deve ser igual ou posterior à primeira ocorrência.",
        },
      ]),
    );
    await openForm();
    await fillExpense();
    await fireEvent.press(screen.getByRole("tab", { name: "Anual" }));
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));
    expect(
      await screen.findByText("A data final deve ser igual ou posterior à primeira ocorrência."),
    ).toBeOnTheScreen();
  });
});

describe("destinar a receita a uma meta no formulário (R17, R68)", () => {
  beforeEach(() => signIn());

  it("cria a receita e depois o vínculo, e celebra a meta atingida", async () => {
    const api = setupApi()
      .on("GET", "/api/goals", { body: { data: [goal()] } })
      .on("POST", "/api/transactions", { status: 201, body: salary() })
      .on("POST", "/api/goals/:id/contributions", { status: 201, body: contribution(true) });
    const onClose = await openForm();
    await fillIncome();
    await fireEvent.press(await screen.findByRole("button", { name: "Viagem" }));
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const order = api.calls.map((call) => `${call.method} ${call.path}`);
    const created = order.indexOf("POST /api/transactions");
    const linked = order.indexOf(`POST /api/goals/${goal().id}/contributions`);
    expect(created).toBeGreaterThanOrEqual(0);
    expect(linked).toBeGreaterThan(created);
    // Sem valor: o servidor destina toda a receita.
    expect(api.lastCall("POST", "/api/goals/:id/contributions")!.body).toEqual({ transactionId: salary().id });
    expect(api.lastCall("POST", "/api/transactions")!.body).not.toHaveProperty("goalId");
    expect(await screen.findByText("Meta “Viagem” atingida!")).toBeOnTheScreen();
    expect(screen.getByText("Parabéns pela conquista!")).toBeOnTheScreen();
    expect(screen.queryByText("Saldos atualizados")).toBeNull();
  });

  it("envia o valor parcial e só celebra a meta com `achievedNow`", async () => {
    const api = setupApi()
      .on("GET", "/api/goals", { body: { data: [goal()] } })
      .on("POST", "/api/transactions", { status: 201, body: salary() })
      .on("POST", "/api/goals/:id/contributions", { status: 201, body: contribution(false, 500) });
    const onClose = await openForm();
    await fillIncome();
    await fireEvent.press(await screen.findByRole("button", { name: "Viagem" }));
    await fireEvent.changeText(screen.getByLabelText("Valor para a meta"), "500");
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.lastCall("POST", "/api/goals/:id/contributions")!.body).toEqual({
      transactionId: salary().id,
      amount: 500,
    });
    expect(await screen.findByText("Transação registrada!")).toBeOnTheScreen();
    expect(screen.getByText("Receita destinada à meta “Viagem”")).toBeOnTheScreen();
    expect(screen.queryByText("Meta “Viagem” atingida!")).toBeNull();
  });

  it("se o vínculo falhar, a receita fica registrada e o aviso explica", async () => {
    const api = setupApi()
      .on("GET", "/api/goals", { body: { data: [goal()] } })
      .on("POST", "/api/transactions", { status: 201, body: salary() })
      .on("POST", "/api/goals/:id/contributions", apiError(409, "GOAL_NOT_ACTIVE", "Meta cancelada."));
    const onClose = await openForm();
    await fillIncome();
    await fireEvent.press(await screen.findByRole("button", { name: "Viagem" }));
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.callsTo("POST", "/api/transactions")).toHaveLength(1);
    expect(api.callsTo("DELETE", "/api/transactions/:id")).toHaveLength(0);
    expect(await screen.findByText("Receita registrada, mas não foi possível destinar à meta")).toBeOnTheScreen();
  });

  it("valor para a meta acima da receita é recusado antes de enviar", async () => {
    const api = setupApi().on("GET", "/api/goals", { body: { data: [goal()] } });
    await openForm();
    await fillIncome("100");
    await fireEvent.press(await screen.findByRole("button", { name: "Viagem" }));
    await fireEvent.changeText(screen.getByLabelText("Valor para a meta"), "150");
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("O valor passa do valor da receita.")).toBeOnTheScreen();
    expect(api.callsTo("POST", "/api/transactions")).toHaveLength(0);
  });

  it("sem metas ativas, o campo não aparece", async () => {
    setupApi().on("GET", "/api/goals", { body: { data: [] } });
    await openForm();
    await fillIncome();
    expect(screen.queryByTestId("goal-destination")).toBeNull();
  });
});

describe("série e metas nos detalhes (R37, R62, R17, R68)", () => {
  beforeEach(() => signIn());

  async function openDetails(tx: Transaction) {
    const onClose = jest.fn();
    await renderWithProviders(<TransactionDetailsSheet transaction={tx} onClose={onClose} onEdit={jest.fn()} />);
    return onClose;
  }

  it("mostra a parcela ou a frequência da série, sem 'Marcar como recorrente'", async () => {
    setupApi();
    await openDetails(
      transaction({ series: { id: "s1", kind: "installment", frequency: "monthly", occurrence: 1, total: 3 } }),
    );
    expect(within(screen.getByTestId("details-series")).getByText("Parcela 1/3")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Marcar como recorrente" })).toBeNull();
  });

  it("mostra 'Repete todo mês' na recorrência", async () => {
    setupApi();
    await openDetails(
      transaction({ series: { id: "s1", kind: "recurring", frequency: "monthly", occurrence: 2, total: null } }),
    );
    expect(within(screen.getByTestId("details-series")).getByText("Repete todo mês")).toBeOnTheScreen();
  });

  it("marca uma transação avulsa como recorrente", async () => {
    const api = setupApi().on("POST", "/api/series/recurring/from-transaction/:id", {
      status: 201,
      body: { series: series({ frequency: "weekly" }), transactions: [transaction()] },
    });
    const onClose = await openDetails(transaction());
    await fireEvent.press(screen.getByRole("button", { name: "Marcar como recorrente" }));
    const dialog = await screen.findByTestId("mark-recurring");
    await fireEvent.press(within(dialog).getByRole("tab", { name: "Semanal" }));
    await fireEvent.press(within(dialog).getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = api.lastCall("POST", "/api/series/recurring/from-transaction/:id")!;
    expect(call.path).toBe(`/api/series/recurring/from-transaction/${transaction().id}`);
    expect(call.body).toEqual({ frequency: "weekly" });
    expect(await screen.findByText("Transação marcada como recorrente: repete toda semana")).toBeOnTheScreen();
  });

  it("mostra os erros 422/409 ao marcar como recorrente", async () => {
    setupApi().on(
      "POST",
      "/api/series/recurring/from-transaction/:id",
      apiError(422, "TRANSACTION_TOO_OLD", "Mensagem do servidor."),
    );
    const onClose = await openDetails(transaction({ date: "2025-01-10" }));
    await fireEvent.press(screen.getByRole("button", { name: "Marcar como recorrente" }));
    const dialog = await screen.findByTestId("mark-recurring");
    await fireEvent.press(within(dialog).getByRole("button", { name: "Confirmar" }));
    expect(
      await within(dialog).findByText("Só é possível marcar como recorrente uma transação dos últimos 12 meses."),
    ).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("lista as metas da receita e remove um vínculo", async () => {
    const api = setupApi()
      .on("GET", "/api/goals/contributions", {
        body: { data: [{ id: "c1", goal: { id: goal().id, name: "Viagem" }, amount: 500 }] },
      })
      .on("DELETE", "/api/goals/:goalId/contributions/:id", { status: 204 });
    await openDetails(salary());
    const section = screen.getByTestId("details-goals");
    expect(await within(section).findByText("Viagem")).toBeOnTheScreen();
    expect(within(section).getByText("R$ 500,00")).toBeOnTheScreen();
    expect(api.lastCall("GET", "/api/goals/contributions")!.query).toEqual({ transactionId: salary().id });

    await fireEvent.press(within(section).getByRole("button", { name: "Remover da meta Viagem" }));
    await waitFor(() =>
      expect(api.lastCall("DELETE", "/api/goals/:goalId/contributions/:id")!.path).toBe(
        `/api/goals/${goal().id}/contributions/c1`,
      ),
    );
    expect(await screen.findByText("Receita removida da meta “Viagem”")).toBeOnTheScreen();
  });

  it("destina a receita a uma meta pelos detalhes e mostra o erro de valor no campo", async () => {
    const api = setupApi()
      .on("GET", "/api/goals/contributions", { body: { data: [] } })
      .on("GET", "/api/goals", { body: { data: [goal()] } })
      .on(
        "POST",
        "/api/goals/:id/contributions",
        apiError(422, "CONTRIBUTION_EXCEEDS_TRANSACTION", "O valor passa do que resta da receita (3000.00).", [
          { location: "body", path: "amount", message: "O valor passa do que resta da receita (3000.00)." },
        ]),
      );
    await openDetails(salary());
    expect(await screen.findByText("Esta receita ainda não foi destinada a nenhuma meta.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Destinar a uma meta" }));
    const dialog = await screen.findByTestId("contribution-dialog");
    await fireEvent.press(await within(dialog).findByRole("button", { name: "Viagem" }));
    await fireEvent.changeText(within(dialog).getByLabelText("Valor para a meta"), "3200");
    await fireEvent.press(within(dialog).getByRole("button", { name: "Destinar" }));
    expect(await within(dialog).findByText("O valor passa do que resta da receita (3000.00).")).toBeOnTheScreen();
    expect(api.lastCall("POST", "/api/goals/:id/contributions")!.body).toEqual({
      transactionId: salary().id,
      amount: 3200,
    });

    // Corrigido: o vínculo completa a meta e o app celebra (R68).
    api.on("POST", "/api/goals/:id/contributions", { status: 201, body: contribution(true, 3000) });
    await fireEvent.changeText(within(dialog).getByLabelText("Valor para a meta"), "");
    await fireEvent.press(within(dialog).getByRole("button", { name: "Destinar" }));
    expect(await screen.findByText("Meta “Viagem” atingida!")).toBeOnTheScreen();
    expect(api.lastCall("POST", "/api/goals/:id/contributions")!.body).toEqual({ transactionId: salary().id });
  });

  it("despesa não mostra a seção de metas", async () => {
    setupApi();
    await openDetails(transaction());
    expect(screen.queryByTestId("details-goals")).toBeNull();
  });
});

describe("selo da série na lista (R37, R62)", () => {
  it("mostra a parcela e informa a série ao leitor de tela; transação avulsa não muda", async () => {
    const installment = transaction({
      series: { id: "s1", kind: "installment", frequency: "monthly", occurrence: 3, total: 10 },
    });
    await renderWithProviders(
      <>
        <TransactionRow transaction={installment} icon="restaurant" onPress={jest.fn()} />
        <TransactionRow transaction={transaction({ id: "t2" })} icon="restaurant" onPress={jest.fn()} />
      </>,
    );
    expect(screen.getByTestId("installment-badge")).toHaveTextContent("3/10");
    expect(screen.getByRole("button", { name: /, parcela 3\/10$/ })).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Almoço, despesa de −R$ 47,90, 03 de outubro de 2026" }),
    ).toBeOnTheScreen();
  });
});
