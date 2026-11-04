import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import type {
  BudgetHistory,
  BudgetStatus,
  BudgetStatusReport,
  Goal,
  GoalDetail,
  GoalStatus,
  ReductionGoal,
  Reminder,
  Series,
} from "@/data/api/types";
import { addDays, currentMonth, formatDate, monthLabel, shiftMonth, todayIso } from "@/domain/dates";
import { categories, wallet } from "@/test-utils/fixtures";
import { apiError, type FakeResponse } from "@/test-utils/fake-api";
import { renderWithProviders, setupApi, signIn } from "@/test-utils/render";
import { palettes } from "@/ui";
import { dueLabel, seriesAmountLabel, seriesKindLabel, seriesScheduleLabel } from "./accounts/account-labels";
import { REDUCTION_ERRORS } from "./budgets/reduction-goal-form-sheet";
import { parseSection, PlanningScreen } from "./planning-screen";

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  setParams: jest.fn(),
  canGoBack: () => true,
};
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));

const picker = jest.requireMock("@react-native-community/datetimepicker").DateTimePickerAndroid as {
  open: jest.Mock;
};
/** Próxima abertura do seletor de data devolve `iso`. */
function pickDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  picker.open.mockImplementationOnce(({ onChange }: { onChange: (event: { type: string }, date: Date) => void }) =>
    onChange({ type: "set" }, new Date(y, m - 1, d, 12)),
  );
}

/** Valor da barra de progresso (a `ProgressBar` não é elemento de acessibilidade, então não sai por papel). */
function progressOf(element: { props: Record<string, unknown>; children: unknown[] }): number | undefined {
  const stack: unknown[] = [element];
  while (stack.length) {
    const node = stack.pop() as { props?: Record<string, unknown>; children?: unknown[] } | string;
    if (typeof node !== "object" || !node) continue;
    if (node.props?.accessibilityRole === "progressbar") return (node.props.accessibilityValue as { now: number }).now;
    stack.push(...(node.children ?? []));
  }
  return undefined;
}

// ---------- dados de exemplo (no formato exato das respostas da API) ----------

const food = { id: categories[0].id, name: "Alimentação", predefined: true };
const transport = { id: categories[1].id, name: "Transporte", predefined: true };
const month = currentMonth();
const today = todayIso();

const status = (overrides: Partial<BudgetStatus> = {}): BudgetStatus => ({
  budgetId: "b1",
  category: food,
  period: "monthly",
  currency: "BRL",
  limit: 400,
  spent: 320,
  remaining: 80,
  percent: 80,
  state: "warning",
  ...overrides,
});

const report = (overrides: Partial<BudgetStatusReport> = {}): BudgetStatusReport => ({
  month,
  date: today,
  monthly: [
    status(),
    status({
      budgetId: "b2",
      category: transport,
      limit: 200,
      spent: 250,
      remaining: -50,
      percent: 125,
      state: "exceeded",
    }),
  ],
  daily: [status({ budgetId: "b3", period: "daily", limit: 50, spent: 10, remaining: 40, percent: 20, state: "ok" })],
  ...overrides,
});

/** Histórico: Alimentação com limite de R$ 300 até o mês passado e R$ 400 agora; mês retrasado sem orçamento. */
function history(fromMonth: string, toMonth: string): BudgetHistory {
  const months: BudgetHistory["months"] = [];
  for (let current = fromMonth; current <= toMonth; current = shiftMonth(current, 1)) {
    const items =
      current === month
        ? [status({ spent: 320 })]
        : current === shiftMonth(month, -1)
          ? [status({ budgetId: "b0", limit: 300, spent: 280, remaining: 20, percent: 93.3 })]
          : [];
    months.push({ month: current, items });
  }
  return { fromMonth, toMonth, months };
}

const reduction = (overrides: Partial<ReductionGoal> = {}): ReductionGoal => ({
  id: "r1",
  category: food,
  percent: 10,
  currency: "BRL",
  baseline: 500,
  target: 450,
  month,
  spent: 320,
  state: "on_track",
  startMonth: month,
  endMonth: null,
  ...overrides,
});

const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: "g1",
  name: "Viagem",
  category: { id: categories[3].id, name: "Outros", predefined: true },
  targetAmount: 1000,
  currency: "BRL",
  deadline: addDays(today, 12),
  status: "active",
  achievedAt: null,
  saved: 250,
  percent: 25,
  remaining: 750,
  daysLeft: 12,
  ...overrides,
});

const overGoal = goal({ id: "g2", name: "Reserva", saved: 1300, percent: 130, remaining: -300 });

const goalDetail = (overrides: Partial<GoalDetail> = {}): GoalDetail => ({
  ...goal(),
  contributions: [
    {
      id: "k1",
      transaction: { id: "t1", date: "2026-10-05", description: "Salário de outubro", amount: 5000, currency: "BRL" },
      amount: 250,
      counted: 250,
    },
  ],
  ...overrides,
});

const brl = { id: wallet().id, name: wallet().name, currency: "BRL" };

const recurring = (overrides: Partial<Series> = {}): Series => ({
  id: "s1",
  kind: "recurring",
  type: "expense",
  frequency: "monthly",
  description: "Aluguel",
  wallet: brl,
  category: { id: categories[3].id, name: "Outros" },
  amount: 1500,
  totalAmount: null,
  installments: null,
  startDate: "2026-09-05",
  endDate: null,
  nextDate: addDays(today, 5),
  generatedCount: 2,
  remaining: null,
  status: "active",
  createdAt: "2026-09-05T12:00:00.000Z",
  ...overrides,
});

const installment = (overrides: Partial<Series> = {}): Series => ({
  ...recurring(),
  id: "s2",
  kind: "installment",
  description: "Notebook",
  amount: 300,
  totalAmount: 3000,
  installments: 10,
  generatedCount: 3,
  remaining: 7,
  ...overrides,
});

const reminder = (overrides: Partial<Reminder> = {}): Reminder => ({
  id: "m1",
  title: "Conta de luz",
  amount: 180,
  currency: "BRL",
  frequency: "monthly",
  nextDueDate: addDays(today, 3),
  seriesId: null,
  active: true,
  lastNotifiedOn: null,
  createdAt: "2026-10-01T12:00:00.000Z",
  ...overrides,
});

function planningApi() {
  const goalsByStatus: Record<GoalStatus, Goal[]> = {
    active: [goal(), overGoal],
    achieved: [goal({ id: "g3", name: "Celular", status: "achieved", saved: 1000, percent: 100, remaining: 0 })],
    cancelled: [],
  };
  return setupApi()
    .on("GET", "/api/budgets/status", { body: report() })
    .on("GET", "/api/budgets/history", (req) => ({ body: history(req.query.fromMonth, req.query.toMonth) }))
    .on("POST", "/api/budgets", (req) => ({
      status: 201,
      body: { id: "b9", category: transport, period: req.body.period, amount: req.body.amount, currency: "BRL" },
    }))
    .on("PATCH", "/api/budgets/:id", (req) => ({ body: { id: "b1", category: food, amount: req.body.amount } }))
    .on("DELETE", "/api/budgets/:id", { status: 204 })
    .on("GET", "/api/reduction-goals", { body: { data: [reduction()] } })
    .on("DELETE", "/api/reduction-goals/:id", { status: 204 })
    .on("GET", "/api/goals", (req) => ({ body: { data: goalsByStatus[req.query.status as GoalStatus] ?? [] } }))
    .on("GET", "/api/goals/:id", { body: goalDetail() })
    .on("POST", "/api/goals", (req) => ({ status: 201, body: goal({ id: "g9", ...req.body }) }))
    .on("PATCH", "/api/goals/:id", (req) => ({ body: goal(req.body) }))
    .on("DELETE", "/api/goals/:id", { status: 204 })
    .on("DELETE", "/api/goals/:id/contributions/:contributionId", { status: 204 })
    .on("GET", "/api/series", (req) => ({
      body: {
        data:
          req.query.status === "all"
            ? [recurring(), installment(), recurring({ id: "s3", description: "Academia", status: "cancelled" })]
            : [recurring(), installment()],
      },
    }))
    .on("PATCH", "/api/series/:id", (req) => ({ body: recurring(req.body) }))
    .on("DELETE", "/api/series/:id", { status: 204 })
    .on("POST", "/api/history/undo", {
      body: {
        undone: { id: "h1", action: "series.cancel", label: "Parcelamento cancelado", entityType: "series" },
        message: "ok",
      },
    })
    .on("GET", "/api/reminders", { body: { data: [reminder()] } })
    .on("POST", "/api/reminders", (req) => ({
      status: 201,
      body: reminder({ id: "m9", title: req.body.title ?? "Aluguel", seriesId: req.body.seriesId ?? null }),
    }))
    .on("PATCH", "/api/reminders/:id", (req) => ({ body: reminder(req.body) }))
    .on("DELETE", "/api/reminders/:id", { status: 204 });
}

async function openSection(label: "Metas" | "Contas") {
  await fireEvent.press(await screen.findByRole("tab", { name: label }));
}

beforeEach(async () => {
  mockParams = {};
  await signIn();
});

// ---------- aba e seções ----------

describe("aba Planejamento", () => {
  it("abre em Orçamentos e alterna para Metas e Contas", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    expect(screen.getByRole("header", { name: "Planejamento" })).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Orçamentos" })).toBeSelected();
    expect(await screen.findByTestId("budgets-section")).toBeOnTheScreen();
    expect(api.callsTo("GET", "/api/goals")).toHaveLength(0);

    await openSection("Metas");
    expect(await screen.findByTestId("goals-section")).toBeOnTheScreen();
    await openSection("Contas");
    expect(await screen.findByTestId("accounts-section")).toBeOnTheScreen();
    expect(screen.queryByTestId("budgets-section")).toBeNull();
  });

  it("abre direto na seção pedida pela rota e limpa o parâmetro (avisos)", async () => {
    mockParams = { section: "goals" };
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    expect(await screen.findByTestId("goals-section")).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Metas" })).toBeSelected();
    expect(api.callsTo("GET", "/api/budgets/status")).toHaveLength(0);
    expect(mockRouter.setParams).toHaveBeenCalledWith({ section: undefined });
  });

  it("o aviso de meta abre o detalhe da meta pelo goalId e limpa os parâmetros", async () => {
    mockParams = { section: "goals", goalId: "g1" };
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    expect(await screen.findByTestId("goal-details")).toBeOnTheScreen();
    await waitFor(() => expect(api.lastCall("GET", "/api/goals/:id")!.path).toBe("/api/goals/g1"));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ section: undefined, goalId: undefined });
  });

  it("interpreta o parâmetro da seção", () => {
    expect(parseSection("accounts")).toBe("accounts");
    expect(parseSection(["budgets"])).toBe("budgets");
    expect(parseSection("outra")).toBeNull();
    expect(parseSection(undefined)).toBeNull();
  });
});

// ---------- orçamentos ----------

describe("orçamentos (R21, R74, R45)", () => {
  it("mostra os mensais com barra, estado e restante, os limites de hoje e uma só consulta (R83)", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    const foodRow = await screen.findByTestId("budget-b1-monthly");
    expect(within(foodRow).getByTestId("budget-amounts")).toHaveTextContent("R$ 320,00 de R$ 400,00");
    expect(within(foodRow).getByText("Atenção")).toBeOnTheScreen();
    expect(within(foodRow).getByText("Restam R$ 80,00")).toBeOnTheScreen();
    expect(progressOf(foodRow)).toBe(80);

    const transportRow = screen.getByTestId("budget-b2-monthly");
    expect(within(transportRow).getByText("Estourado")).toBeOnTheScreen();
    expect(within(transportRow).getByText("R$ 50,00 acima")).toBeOnTheScreen();
    // A barra para em 100%; o texto mostra o valor real.
    expect(progressOf(transportRow)).toBe(100);
    expect(within(transportRow).getByText("125%")).toBeOnTheScreen();

    const daily = screen.getByTestId("daily-budgets");
    expect(within(daily).getByText("Limites de hoje")).toBeOnTheScreen();
    expect(within(daily).getByTestId("budget-b3-daily")).toBeOnTheScreen();

    expect(api.callsTo("GET", "/api/budgets/status")).toHaveLength(1);
    expect(api.lastCall("GET", "/api/budgets/status")!.query).toEqual({ month });
  });

  it("desenha orçado × gasto com alturas proporcionais e a cor de estouro (R45)", async () => {
    planningApi();
    await renderWithProviders(<PlanningScreen />);
    expect(await screen.findByTestId("budget-chart")).toBeOnTheScreen();
    expect(screen.getByLabelText("Alimentação: gasto R$ 320,00 de R$ 400,00")).toBeOnTheScreen();
    // Maior valor do gráfico: R$ 400 → 120 de altura.
    expect(screen.getByTestId("budget-chart-bar-0-0")).toHaveStyle({ height: 120 });
    expect(screen.getByTestId("budget-chart-bar-0-1")).toHaveStyle({ height: 96 });
    expect(screen.getByTestId("budget-chart-bar-1-1")).toHaveStyle({
      height: 75,
      backgroundColor: palettes.light.error,
    });
  });

  it("sem gasto calculado (câmbio), a barra de gasto some e há aviso", async () => {
    planningApi().on("GET", "/api/budgets/status", {
      body: report({ monthly: [status({ spent: null, remaining: null, percent: null, state: "ok" })] }),
    });
    await renderWithProviders(<PlanningScreen />);
    expect(await screen.findByTestId("budget-chart-bar-0-0")).toBeOnTheScreen();
    expect(screen.queryByTestId("budget-chart-bar-0-1")).toBeNull();
    expect(screen.getByText("Câmbio indisponível: o gasto de 1 categoria não pôde ser calculado.")).toBeOnTheScreen();
  });

  it("sem orçamento mensal, o gráfico some e aparece o convite para criar", async () => {
    planningApi().on("GET", "/api/budgets/status", { body: report({ monthly: [], daily: [] }) });
    await renderWithProviders(<PlanningScreen />);
    expect(await screen.findByText("Nenhum orçamento mensal")).toBeOnTheScreen();
    expect(screen.queryByTestId("budget-chart")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Criar orçamento" }));
    expect(await screen.findByTestId("budget-form")).toBeOnTheScreen();
  });

  it("cria um limite diário só com categorias de despesa ou ambos", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Novo orçamento" }));
    const form = await screen.findByTestId("budget-form");
    expect(within(form).queryByRole("button", { name: "Salário" })).toBeNull();
    expect(within(form).getByRole("button", { name: "Outros" })).toBeOnTheScreen();

    await fireEvent.press(within(form).getByRole("button", { name: "Transporte" }));
    await fireEvent.press(within(form).getByRole("tab", { name: "Diário" }));
    await fireEvent.changeText(within(form).getByLabelText("Limite do dia"), "60,50");
    await fireEvent.press(within(form).getByRole("button", { name: "Criar" }));

    await waitFor(() =>
      expect(api.lastCall("POST", "/api/budgets")!.body).toEqual({
        categoryId: transport.id,
        period: "daily",
        amount: 60.5,
      }),
    );
    expect(await screen.findByText("Limite diário criado")).toBeOnTheScreen();
  });

  it("mostra no campo da categoria o orçamento duplicado (409)", async () => {
    const message = "Esta categoria já tem um orçamento mensal em vigor. Altere o valor dele.";
    planningApi().on(
      "POST",
      "/api/budgets",
      apiError(409, "BUDGET_ALREADY_EXISTS", message, [{ path: "categoryId", message }]),
    );
    await renderWithProviders(<PlanningScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Novo orçamento" }));
    const form = await screen.findByTestId("budget-form");
    await fireEvent.press(within(form).getByRole("button", { name: "Alimentação" }));
    await fireEvent.changeText(within(form).getByLabelText("Limite do mês"), "400");
    await fireEvent.press(within(form).getByRole("button", { name: "Criar" }));
    expect(await within(form).findByText(message)).toBeOnTheScreen();
  });

  it("altera o valor a partir deste mês e encerra com confirmação", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    await fireEvent.press(await screen.findByTestId("budget-b1-monthly"));
    let form = await screen.findByTestId("budget-form");
    expect(within(form).getByText(/Vale a partir deste mês/)).toBeOnTheScreen();
    expect(within(form).queryByRole("tab", { name: "Diário" })).toBeNull();
    await fireEvent.changeText(within(form).getByLabelText("Limite do mês"), "450");
    await fireEvent.press(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.lastCall("PATCH", "/api/budgets/:id")!.body).toEqual({ amount: 450 }));
    expect(api.lastCall("PATCH", "/api/budgets/:id")!.path).toBe("/api/budgets/b1");
    expect(await screen.findByText("Orçamento atualizado a partir deste mês")).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId("budget-b1-monthly"));
    form = await screen.findByTestId("budget-form");
    await fireEvent.press(within(form).getByRole("button", { name: "Encerrar orçamento" }));
    const dialog = await screen.findByTestId("end-budget-dialog");
    await fireEvent.press(within(dialog).getByRole("button", { name: "Encerrar" }));
    await waitFor(() => expect(api.callsTo("DELETE", "/api/budgets/:id")).toHaveLength(1));
    expect(api.lastCall("DELETE", "/api/budgets/:id")!.path).toBe("/api/budgets/b1");
    expect(await screen.findByText("Orçamento encerrado")).toBeOnTheScreen();
  });

  it("troca o mês pelo seletor, sem passar do atual, e esconde os limites de hoje", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    const selector = await screen.findByTestId("budgets-month");
    expect(within(selector).getByRole("button", { name: "Próximo mês" })).toBeDisabled();
    await fireEvent.press(within(selector).getByRole("button", { name: "Mês anterior" }));
    await waitFor(() =>
      expect(api.lastCall("GET", "/api/budgets/status")!.query).toEqual({ month: shiftMonth(month, -1) }),
    );
    await waitFor(() => expect(screen.queryByTestId("daily-budgets")).toBeNull());
    expect(api.lastCall("GET", "/api/reduction-goals")!.query).toEqual({ month: shiftMonth(month, -1) });
  });
});

describe("histórico de orçamentos (R23)", () => {
  it("lista os meses com o limite de cada um e compara dois meses", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Histórico" }));
    const sheet = await screen.findByTestId("budget-history");
    const previous = await within(sheet).findByTestId(`history-${shiftMonth(month, -1)}`);
    // O limite antigo (R$ 300) aparece no mês anterior à alteração.
    expect(within(previous).getByText("Gasto R$ 280,00 de R$ 300,00")).toBeOnTheScreen();
    expect(within(sheet).getByTestId(`history-${month}`)).toHaveTextContent(/Gasto R\$ 320,00 de R\$ 400,00/);
    expect(within(sheet).getByTestId(`history-${shiftMonth(month, -2)}`)).toHaveTextContent(/Sem orçamentos neste mês/);
    expect(api.lastCall("GET", "/api/budgets/history")!.query).toEqual({
      fromMonth: shiftMonth(month, -5),
      toMonth: month,
    });

    await fireEvent.press(within(sheet).getByRole("button", { name: "12 meses" }));
    await waitFor(() =>
      expect(api.lastCall("GET", "/api/budgets/history")!.query.fromMonth).toBe(shiftMonth(month, -11)),
    );

    await fireEvent.press(within(sheet).getByRole("tab", { name: "Comparar" }));
    const row = await within(sheet).findByTestId(`compare-${food.id}`);
    expect(within(row).getByTestId("compare-difference")).toHaveTextContent(
      `R$ 40,00 a mais em ${monthLabel(month).toLowerCase()}`,
    );
    expect(api.callsTo("GET", "/api/budgets/history").some((c) => c.query.fromMonth === c.query.toMonth)).toBe(true);
  });
});

describe("metas de redução (R67)", () => {
  it("lista base, alvo, gasto e estado e encerra com confirmação", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    const item = await screen.findByTestId("reduction-r1");
    expect(within(item).getByText("Reduzir Alimentação em 10%")).toBeOnTheScreen();
    expect(within(item).getByText("Base: média de R$ 500,00 · alvo de R$ 450,00 por mês")).toBeOnTheScreen();
    expect(within(item).getByText("Gasto no mês: R$ 320,00")).toBeOnTheScreen();
    expect(within(item).getByText("Dentro da meta")).toBeOnTheScreen();

    await fireEvent.press(within(item).getByRole("button", { name: "Encerrar meta de redução de Alimentação" }));
    const dialog = await screen.findByTestId("end-reduction-dialog");
    await fireEvent.press(within(dialog).getByRole("button", { name: "Encerrar" }));
    await waitFor(() =>
      expect(api.lastCall("DELETE", "/api/reduction-goals/:id")!.path).toBe("/api/reduction-goals/r1"),
    );
  });

  it("explica NO_BASELINE e a meta repetida e, no sucesso, mostra base e alvo do servidor", async () => {
    let reply: FakeResponse = apiError(422, "NO_BASELINE", "Não há gasto anterior nesta categoria para comparar.", [
      { path: "categoryId", message: "Não há gasto anterior nesta categoria para comparar." },
    ]);
    const api = planningApi().on("POST", "/api/reduction-goals", () => reply);
    await renderWithProviders(<PlanningScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: "Nova meta de redução" }));
    const form = await screen.findByTestId("reduction-form");
    await fireEvent.press(within(form).getByRole("button", { name: "Transporte" }));
    await fireEvent.press(within(form).getByRole("tab", { name: "20%" }));
    await fireEvent.press(within(form).getByRole("button", { name: "Criar meta" }));
    expect(await within(form).findByText(REDUCTION_ERRORS.NO_BASELINE)).toBeOnTheScreen();
    expect(api.lastCall("POST", "/api/reduction-goals")!.body).toEqual({ categoryId: transport.id, percent: 20 });

    reply = apiError(409, "REDUCTION_GOAL_EXISTS", "Já existe.", [{ path: "categoryId", message: "Já existe." }]);
    await fireEvent.press(within(form).getByRole("button", { name: "Criar meta" }));
    expect(await within(form).findByText(REDUCTION_ERRORS.REDUCTION_GOAL_EXISTS)).toBeOnTheScreen();

    reply = {
      status: 201,
      body: reduction({ id: "r2", category: transport, percent: 15, baseline: 200, target: 170 }),
    };
    await fireEvent.press(within(form).getByRole("tab", { name: "Outro" }));
    await fireEvent.changeText(within(form).getByLabelText("Percentual (1 a 90)"), "95");
    await fireEvent.press(within(form).getByRole("button", { name: "Criar meta" }));
    expect(await within(form).findByText("Informe um percentual inteiro de 1 a 90.")).toBeOnTheScreen();
    await fireEvent.changeText(within(form).getByLabelText("Percentual (1 a 90)"), "15");
    await fireEvent.press(within(form).getByRole("button", { name: "Criar meta" }));
    expect(await screen.findByText("Meta criada: base de R$ 200,00, alvo de R$ 170,00 por mês")).toBeOnTheScreen();
    expect(api.lastCall("POST", "/api/reduction-goals")!.body).toEqual({ categoryId: transport.id, percent: 15 });
  });
});

// ---------- metas de economia ----------

describe("metas de economia (R15, R16, R17)", () => {
  it("mostra progresso limitado a 100% na barra, falta, prazo e o filtro de atingidas", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    await openSection("Metas");
    const trip = await screen.findByTestId("goal-g1");
    expect(within(trip).getByTestId("goal-amounts")).toHaveTextContent("R$ 250,00 de R$ 1.000,00");
    expect(within(trip).getByTestId("goal-footer")).toHaveTextContent("Falta R$ 750,00 · Faltam 12 dias");
    expect(progressOf(trip)).toBe(25);

    const over = screen.getByTestId("goal-g2");
    expect(within(over).getByTestId("goal-percent")).toHaveTextContent("130%");
    expect(progressOf(over)).toBe(100);
    expect(within(over).getByTestId("goal-amounts")).toHaveTextContent("R$ 1.300,00 de R$ 1.000,00");

    await fireEvent.press(screen.getByRole("tab", { name: "Atingidas" }));
    const achieved = await screen.findByTestId("goal-g3");
    expect(within(achieved).getByTestId("goal-status")).toHaveTextContent("Atingida");
    expect(api.lastCall("GET", "/api/goals")!.query).toEqual({ status: "achieved" });
  });

  it("cria uma meta validando a data limite e só com categorias de despesa ou ambos", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    await openSection("Metas");
    await fireEvent.press(await screen.findByRole("button", { name: "Nova meta" }));
    const form = await screen.findByTestId("goal-form");
    expect(within(form).queryByRole("button", { name: "Salário" })).toBeNull();

    await fireEvent.changeText(within(form).getByLabelText("Nome da meta"), "Viagem para a praia");
    await fireEvent.changeText(within(form).getByLabelText("Valor alvo"), "2.500,00");
    await fireEvent.press(within(form).getByRole("button", { name: "Outros" }));
    pickDate(addDays(today, -1));
    await fireEvent.press(within(form).getByRole("button", { name: /^Data limite/ }));
    await fireEvent.press(within(form).getByRole("button", { name: "Criar meta" }));
    expect(await within(form).findByText("A data limite não pode estar no passado.")).toBeOnTheScreen();
    expect(api.callsTo("POST", "/api/goals")).toHaveLength(0);

    pickDate("2030-01-15");
    await fireEvent.press(within(form).getByRole("button", { name: /^Data limite/ }));
    await fireEvent.press(within(form).getByRole("button", { name: "Criar meta" }));
    await waitFor(() =>
      expect(api.lastCall("POST", "/api/goals")!.body).toEqual({
        name: "Viagem para a praia",
        targetAmount: 2500,
        deadline: "2030-01-15",
        categoryId: categories[3].id,
      }),
    );
    expect(await screen.findByText("Meta criada")).toBeOnTheScreen();
  });

  it("mostra erros do servidor no campo certo", async () => {
    planningApi().on(
      "POST",
      "/api/goals",
      apiError(422, "CATEGORY_TYPE_MISMATCH", "Categoria de receitas.", [
        { path: "categoryId", message: "Escolha uma categoria de despesa para a meta." },
      ]),
    );
    await renderWithProviders(<PlanningScreen />);
    await openSection("Metas");
    await fireEvent.press(await screen.findByRole("button", { name: "Nova meta" }));
    const form = await screen.findByTestId("goal-form");
    await fireEvent.changeText(within(form).getByLabelText("Nome da meta"), "Carro");
    await fireEvent.changeText(within(form).getByLabelText("Valor alvo"), "100");
    await fireEvent.press(within(form).getByRole("button", { name: "Outros" }));
    pickDate("2030-01-15");
    await fireEvent.press(within(form).getByRole("button", { name: /^Data limite/ }));
    await fireEvent.press(within(form).getByRole("button", { name: "Criar meta" }));
    expect(await within(form).findByText("Escolha uma categoria de despesa para a meta.")).toBeOnTheScreen();
  });

  it("abre o detalhe com as receitas vinculadas, desvincula, edita e cancela a meta", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    await openSection("Metas");
    await fireEvent.press(await screen.findByTestId("goal-g1"));
    const details = await screen.findByTestId("goal-details");
    const list = await within(details).findByTestId("goal-contributions");
    expect(within(list).getByText("Salário de outubro")).toBeOnTheScreen();
    expect(within(list).getByText(formatDate("2026-10-05"))).toBeOnTheScreen();
    expect(within(list).getByText("R$ 250,00")).toBeOnTheScreen();
    expect(api.lastCall("GET", "/api/goals/:id")!.path).toBe("/api/goals/g1");

    await fireEvent.press(within(list).getByRole("button", { name: "Desvincular Salário de outubro" }));
    let dialog = await screen.findByTestId("unlink-dialog");
    await fireEvent.press(within(dialog).getByRole("button", { name: "Desvincular" }));
    await waitFor(() =>
      expect(api.lastCall("DELETE", "/api/goals/:id/contributions/:contributionId")!.path).toBe(
        "/api/goals/g1/contributions/k1",
      ),
    );
    expect(await screen.findByText("Receita desvinculada da meta")).toBeOnTheScreen();

    await fireEvent.press(within(details).getByRole("button", { name: "Cancelar meta" }));
    dialog = await screen.findByTestId("cancel-goal-dialog");
    await fireEvent.press(within(dialog).getByRole("button", { name: "Cancelar meta" }));
    await waitFor(() => expect(api.lastCall("DELETE", "/api/goals/:id")!.path).toBe("/api/goals/g1"));
    expect(await screen.findByText("Meta cancelada. As receitas continuam nas carteiras.")).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId("goal-g1"));
    await fireEvent.press(
      await within(await screen.findByTestId("goal-details")).findByRole("button", { name: "Editar" }),
    );
    const form = await screen.findByTestId("goal-form");
    expect(within(form).getByLabelText("Nome da meta")).toHaveDisplayValue("Viagem");
    await fireEvent.changeText(within(form).getByLabelText("Nome da meta"), "Viagem ao Chile");
    await fireEvent.press(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.lastCall("PATCH", "/api/goals/:id")!.body).toEqual({ name: "Viagem ao Chile" }));
  });
});

// ---------- contas ----------

describe("recorrências e parcelamentos (R37, R62)", () => {
  it("lista valor, rótulo e próxima data e filtra as encerradas", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    await openSection("Contas");
    const rent = await screen.findByTestId("series-s1");
    expect(within(rent).getByText("R$ 1.500,00 por mês")).toBeOnTheScreen();
    expect(within(rent).getByText("Repete todo mês")).toBeOnTheScreen();
    expect(within(rent).getByTestId("series-schedule")).toHaveTextContent(`Próxima: ${formatDate(addDays(today, 5))}`);
    const laptop = screen.getByTestId("series-s2");
    expect(within(laptop).getByText("R$ 3.000,00 em 10×")).toBeOnTheScreen();
    expect(within(laptop).getByText("Parcela 3/10")).toBeOnTheScreen();
    expect(within(laptop).getByTestId("series-schedule")).toHaveTextContent(/faltam 7/);

    await fireEvent.press(screen.getByRole("tab", { name: "Encerradas" }));
    expect(await screen.findByTestId("series-s3")).toBeOnTheScreen();
    expect(screen.queryByTestId("series-s1")).toBeNull();
    expect(within(screen.getByTestId("series-s3")).queryByRole("button", { name: "Editar Academia" })).toBeNull();
    expect(api.lastCall("GET", "/api/series")!.query).toEqual({ status: "all" });
  });

  it("edita a recorrência (vale para as próximas) e o parcelamento sem campo de valor", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    await openSection("Contas");
    await fireEvent.press(await screen.findByRole("button", { name: "Editar Aluguel" }));
    let form = await screen.findByTestId("series-edit");
    expect(within(form).getByText("Vale para as próximas ocorrências. As já registradas não mudam.")).toBeOnTheScreen();
    await fireEvent.changeText(within(form).getByLabelText("Valor de cada ocorrência"), "1.600,00");
    await fireEvent.press(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.lastCall("PATCH", "/api/series/:id")!.body).toEqual({ amount: 1600 }));
    expect(api.lastCall("PATCH", "/api/series/:id")!.path).toBe("/api/series/s1");
    expect(await screen.findByText("Recorrência atualizada")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Editar Notebook" }));
    form = await screen.findByTestId("series-edit");
    expect(within(form).queryByLabelText("Valor de cada ocorrência")).toBeNull();
    await fireEvent.changeText(within(form).getByLabelText("Descrição"), "Notebook novo");
    await fireEvent.press(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(api.lastCall("PATCH", "/api/series/:id")!.body).toEqual({ description: "Notebook novo" }),
    );
  });

  it("cancela com confirmação e oferece desfazer (R49)", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    await openSection("Contas");
    await fireEvent.press(await screen.findByRole("button", { name: "Cancelar Notebook" }));
    const dialog = await screen.findByTestId("cancel-series-dialog");
    expect(within(dialog).getByText("Cancelar parcelamento?")).toBeOnTheScreen();
    expect(
      within(dialog).getByText("As próximas ocorrências não serão geradas. As já registradas continuam."),
    ).toBeOnTheScreen();
    await fireEvent.press(within(dialog).getByRole("button", { name: "Cancelar série" }));
    await waitFor(() => expect(api.lastCall("DELETE", "/api/series/:id")!.path).toBe("/api/series/s2"));
    expect(await screen.findByText("Parcelamento cancelado")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/history/undo")).toHaveLength(1));
  });

  it("cria um lembrete a partir da despesa recorrente", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    await openSection("Contas");
    expect(await screen.findByTestId("series-s1")).toBeOnTheScreen();
    // Parcelamento não vira lembrete.
    expect(screen.queryByRole("button", { name: "Criar lembrete para Notebook" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Criar lembrete para Aluguel" }));
    await waitFor(() => expect(api.lastCall("POST", "/api/reminders")!.body).toEqual({ seriesId: "s1" }));
    expect(await screen.findByText("Lembrete criado: Aluguel")).toBeOnTheScreen();
  });
});

describe("lembretes de contas (R34)", () => {
  it("lista vencimento, frequência e valor e pausa pelo interruptor", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    await openSection("Contas");
    const row = await screen.findByTestId("reminder-m1");
    expect(within(row).getByText("Vence em 3 dias · Mensal · R$ 180,00")).toBeOnTheScreen();
    const toggle = within(row).getByRole("switch", { name: "Lembrete Conta de luz ativo" });
    expect(toggle).toBeChecked();
    await fireEvent.press(toggle);
    await waitFor(() => expect(api.lastCall("PATCH", "/api/reminders/:id")!.body).toEqual({ active: false }));
    expect(await screen.findByText("Lembrete pausado")).toBeOnTheScreen();
  });

  it("reativa um lembrete pausado", async () => {
    const api = planningApi().on("GET", "/api/reminders", { body: { data: [reminder({ active: false })] } });
    await renderWithProviders(<PlanningScreen />);
    await openSection("Contas");
    const row = await screen.findByTestId("reminder-m1");
    expect(within(row).getByText(/^Pausado · /)).toBeOnTheScreen();
    await fireEvent.press(within(row).getByRole("switch", { name: "Lembrete Conta de luz ativo" }));
    await waitFor(() => expect(api.lastCall("PATCH", "/api/reminders/:id")!.body).toEqual({ active: true }));
    expect(await screen.findByText("Lembrete reativado")).toBeOnTheScreen();
  });

  it("cria um lembrete manual com erro por campo e outro a partir da recorrência", async () => {
    let reply: FakeResponse = apiError(400, "VALIDATION_ERROR", "Dados inválidos.", [
      { location: "body", path: "title", message: "Título muito longo." },
    ]);
    const api = planningApi().on("POST", "/api/reminders", () => reply);
    await renderWithProviders(<PlanningScreen />);
    await openSection("Contas");
    await fireEvent.press(await screen.findByRole("button", { name: "Novo lembrete" }));
    let form = await screen.findByTestId("reminder-form");
    await fireEvent.press(within(form).getByRole("button", { name: "Criar lembrete" }));
    expect(await within(form).findByText("Informe o título do lembrete.")).toBeOnTheScreen();
    expect(within(form).getByText("Escolha o próximo vencimento.")).toBeOnTheScreen();

    await fireEvent.changeText(within(form).getByLabelText("Título"), "Internet");
    pickDate("2026-12-10");
    await fireEvent.press(within(form).getByRole("button", { name: /^Próximo vencimento/ }));
    await fireEvent.press(within(form).getByRole("tab", { name: "Anual" }));
    await fireEvent.changeText(within(form).getByLabelText("Valor (opcional, BRL)"), "99,90");
    await fireEvent.press(within(form).getByRole("button", { name: "Criar lembrete" }));
    expect(await within(form).findByText("Título muito longo.")).toBeOnTheScreen();
    expect(api.lastCall("POST", "/api/reminders")!.body).toEqual({
      title: "Internet",
      nextDueDate: "2026-12-10",
      frequency: "yearly",
      amount: 99.9,
    });

    reply = { status: 201, body: reminder({ id: "m9", title: "Internet" }) };
    await fireEvent.press(within(form).getByRole("button", { name: "Criar lembrete" }));
    expect(await screen.findByText("Lembrete criado")).toBeOnTheScreen();

    reply = { status: 201, body: reminder({ id: "m10", title: "Aluguel", seriesId: "s1" }) };
    await fireEvent.press(screen.getByRole("button", { name: "Novo lembrete" }));
    form = await screen.findByTestId("reminder-form");
    await fireEvent.press(within(form).getByRole("tab", { name: "De uma recorrência" }));
    expect(within(form).queryByLabelText("Título")).toBeNull();
    await fireEvent.press(within(form).getByRole("button", { name: "Aluguel · R$ 1.500,00" }));
    await fireEvent.press(within(form).getByRole("button", { name: "Criar lembrete" }));
    await waitFor(() => expect(api.lastCall("POST", "/api/reminders")!.body).toEqual({ seriesId: "s1" }));
    expect(await screen.findByText("Lembrete criado: Aluguel")).toBeOnTheScreen();
  });

  it("edita e exclui com confirmação", async () => {
    const api = planningApi();
    await renderWithProviders(<PlanningScreen />);
    await openSection("Contas");
    await fireEvent.press(await screen.findByRole("button", { name: /^Conta de luz:/ }));
    let form = await screen.findByTestId("reminder-form");
    expect(within(form).getByLabelText("Título")).toHaveDisplayValue("Conta de luz");
    await fireEvent.changeText(within(form).getByLabelText("Valor (opcional, BRL)"), "");
    await fireEvent.press(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.lastCall("PATCH", "/api/reminders/:id")!.body).toEqual({ amount: null }));
    expect(await screen.findByText("Lembrete atualizado")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: /^Conta de luz:/ }));
    form = await screen.findByTestId("reminder-form");
    await fireEvent.press(within(form).getByRole("button", { name: "Excluir lembrete" }));
    const dialog = await screen.findByTestId("delete-reminder-dialog");
    await fireEvent.press(within(dialog).getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(api.lastCall("DELETE", "/api/reminders/:id")!.path).toBe("/api/reminders/m1"));
    expect(await screen.findByText("Lembrete excluído")).toBeOnTheScreen();
  });
});

describe("textos de Contas", () => {
  it("descreve séries e vencimentos", () => {
    expect(seriesKindLabel(recurring({ frequency: "weekly" }))).toBe("Repete toda semana");
    expect(seriesKindLabel(installment())).toBe("Parcela 3/10");
    expect(seriesAmountLabel(recurring({ frequency: "yearly", amount: 120 }))).toBe("R$ 120,00 por ano");
    expect(seriesScheduleLabel(installment({ remaining: 1 }))).toMatch(/falta 1$/);
    expect(seriesScheduleLabel(recurring({ status: "cancelled" }))).toBe("Cancelada");
    expect(seriesScheduleLabel(recurring({ status: "ended", nextDate: null }))).toBe("Encerrada");
    expect(dueLabel("2026-11-04", "2026-11-04")).toBe("Vence hoje");
    expect(dueLabel("2026-11-05", "2026-11-04")).toBe("Vence amanhã");
    expect(dueLabel("2026-11-07", "2026-11-04")).toBe("Vence em 3 dias");
    expect(dueLabel("2026-11-02", "2026-11-04")).toBe("Venceu há 2 dias");
  });
});
