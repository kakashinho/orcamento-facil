import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import type { AppNotification } from "@/data/api/types";
import { queryClient } from "@/data/client";
import { queryKeys } from "@/data/queries/keys";
import { overview, transaction } from "@/test-utils/fixtures";
import { renderWithProviders, setupApi, signIn } from "@/test-utils/render";
import { AppBar, bellLabel } from "../shell/app-bar";
import { notificationTarget, parsePushData } from "./notification-target";
import { NotificationsScreen } from "./notifications-screen";
import { relativeTime } from "./relative-time";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));

let sequence = 0;
const notification = (overrides: Partial<AppNotification> = {}): AppNotification => ({
  id: `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
  kind: "budget_warning",
  title: "Orçamento de Alimentação em 80%",
  body: "Você já usou 80% do orçamento do mês.",
  entityType: "budget",
  entityId: "b0000000-0000-4000-8000-000000000001",
  data: null,
  readAt: null,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  ...overrides,
});

const page = (data: AppNotification[], nextCursor: string | null = null) => ({ body: { data, nextCursor } });

beforeEach(() => signIn());

describe("caixa de notificações (R22, R47, R68, R78, R18, R34)", () => {
  it("lista os avisos com as não lidas em destaque e a data relativa", async () => {
    const unread = notification({ title: "Saldo abaixo do mínimo", kind: "low_balance", entityType: "wallet" });
    const read = notification({
      title: "Meta alcançada",
      kind: "goal_achieved",
      entityType: "savings_goal",
      readAt: "2026-10-01T12:00:00.000Z",
      createdAt: new Date(Date.now() - 40 * 60_000).toISOString(),
    });
    const api = setupApi().on("GET", "/api/notifications", page([unread, read]));
    await renderWithProviders(<NotificationsScreen />, { sheets: true });

    const first = await screen.findByTestId(`notification-${unread.id}`);
    expect(first).toHaveAccessibleName(/^Não lida\. Saldo abaixo do mínimo\./);
    expect(within(first).getByText("há 5 min")).toBeOnTheScreen();
    expect(within(first).getByTestId("unread-dot")).toBeOnTheScreen();
    const second = screen.getByTestId(`notification-${read.id}`);
    expect(second).toHaveAccessibleName(/^Meta alcançada\./);
    expect(within(second).getByText("há 40 min")).toBeOnTheScreen();
    expect(within(second).queryByTestId("unread-dot")).toBeNull();
    expect(api.lastCall("GET", "/api/notifications")!.query).toEqual({ limit: "20" });
  });

  it("carrega a próxima página ao chegar ao fim da lista", async () => {
    const api = setupApi().on("GET", "/api/notifications", (req) =>
      req.query.cursor === "c2"
        ? page([notification({ title: "Aviso antigo" })])
        : page([notification({ title: "Aviso recente" })], "c2"),
    );
    await renderWithProviders(<NotificationsScreen />, { sheets: true });
    await screen.findByText("Aviso recente");
    await fireEvent(screen.getByTestId("notifications-list"), "endReached");
    expect(await screen.findByText("Aviso antigo")).toBeOnTheScreen();
    expect(api.lastCall("GET", "/api/notifications")!.query).toEqual({ limit: "20", cursor: "c2" });
  });

  it("filtra só as não lidas", async () => {
    const api = setupApi()
      .on("GET", "/api/notifications/unread-count", { body: { count: 1 } })
      .on("GET", "/api/notifications", (req) =>
        req.query.unread === "true" ? page([]) : page([notification({ title: "Aviso" })]),
      );
    await renderWithProviders(<NotificationsScreen />, { sheets: true });
    await screen.findByText("Aviso");
    await fireEvent.press(await screen.findByRole("tab", { name: "Não lidas (1)" }));
    expect(await screen.findByText("Tudo lido")).toBeOnTheScreen();
    expect(api.lastCall("GET", "/api/notifications")!.query).toEqual({ unread: "true", limit: "20" });
  });

  it("mostra o estado vazio", async () => {
    setupApi().on("GET", "/api/notifications", page([]));
    await renderWithProviders(<NotificationsScreen />, { sheets: true });
    expect(await screen.findByText("Nenhum aviso por enquanto")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Marcar todas como lidas" })).toBeNull();
  });

  it.each([
    ["budget", { pathname: "/planning", params: { section: "budgets" } }],
    ["reduction_goal", { pathname: "/planning", params: { section: "budgets" } }],
    ["savings_goal", { pathname: "/planning", params: { section: "goals", goalId: "e-1" } }],
    ["reminder", { pathname: "/planning", params: { section: "accounts" } }],
    ["wallet", "/wallets"],
  ] as const)("ao tocar, marca como lida e abre a tela de %s", async (entityType, href) => {
    const item = notification({ entityType, entityId: "e-1" });
    const api = setupApi()
      .on("GET", "/api/notifications", page([item]))
      .on("POST", "/api/notifications/:id/read", { body: { ...item, readAt: "2026-10-04T12:00:00.000Z" } });
    await renderWithProviders(<NotificationsScreen />, { sheets: true });
    await fireEvent.press(await screen.findByTestId(`notification-${item.id}`));
    await waitFor(() => expect(api.callsTo("POST", "/api/notifications/:id/read")).toHaveLength(1));
    expect(api.lastCall("POST", "/api/notifications/:id/read")!.path).toBe(`/api/notifications/${item.id}/read`);
    expect(mockRouter.navigate).toHaveBeenCalledWith(href);
  });

  it("abre os detalhes da transação do aviso, buscada pelo id", async () => {
    const tx = transaction({ id: "tx-incomum", description: "Compra fora do padrão" });
    const item = notification({ kind: "unusual_transaction", entityType: "transaction", entityId: tx.id });
    const api = setupApi()
      .on("GET", "/api/notifications", page([item]))
      .on("POST", "/api/notifications/:id/read", { body: item })
      .on("GET", "/api/transactions/:id", { body: tx });
    await renderWithProviders(<NotificationsScreen />, { sheets: true });
    await fireEvent.press(await screen.findByTestId(`notification-${item.id}`));
    const details = await screen.findByTestId("transaction-details");
    expect(within(details).getByText("Compra fora do padrão")).toBeOnTheScreen();
    expect(api.lastCall("GET", "/api/transactions/:id")!.path).toBe("/api/transactions/tx-incomum");
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it("o lembrete diário (sem entidade) abre o formulário de nova transação; lida não é marcada de novo", async () => {
    const item = notification({
      kind: "daily_reminder",
      title: "Registrou as despesas de hoje?",
      entityType: null,
      entityId: null,
      readAt: "2026-10-04T12:00:00.000Z",
    });
    const api = setupApi().on("GET", "/api/notifications", page([item]));
    await renderWithProviders(<NotificationsScreen />, { sheets: true });
    await fireEvent.press(await screen.findByTestId(`notification-${item.id}`));
    expect(await screen.findByText("Nova transação")).toBeOnTheScreen();
    expect(api.callsTo("POST", "/api/notifications/:id/read")).toHaveLength(0);
  });

  it("o sino mostra o contador, abre a caixa e o contador some ao marcar todas como lidas", async () => {
    let unread = 3;
    const items = [notification(), notification(), notification()];
    const api = setupApi()
      .on("GET", "/api/notifications/unread-count", () => ({ body: { count: unread } }))
      .on("GET", "/api/notifications", () =>
        page(unread ? items : items.map((item) => ({ ...item, readAt: "2026-10-04T12:00:00.000Z" }))),
      )
      .on("POST", "/api/notifications/read-all", () => {
        unread = 0;
        return { body: { updated: 3 } };
      });
    await renderWithProviders(
      <>
        <AppBar />
        <NotificationsScreen />
      </>,
      { sheets: true },
    );
    const bell = await screen.findByRole("button", { name: "Notificações, 3 não lidas" });
    expect(screen.getByTestId("notifications-badge", { includeHiddenElements: true })).toHaveTextContent("3");
    await fireEvent.press(bell);
    expect(mockRouter.navigate).toHaveBeenCalledWith("/notifications");

    await fireEvent.press(await screen.findByRole("button", { name: "Marcar todas como lidas" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/notifications/read-all")).toHaveLength(1));
    expect(await screen.findByText("Todas as notificações foram marcadas como lidas")).toBeOnTheScreen();
    expect(await screen.findByRole("button", { name: "Notificações" })).toBeOnTheScreen();
    expect(screen.queryByTestId("notifications-badge", { includeHiddenElements: true })).toBeNull();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Marcar todas como lidas" })).toBeNull());
  });

  it("o sino usa o número do resumo do Início enquanto a contagem não chega", async () => {
    let answer!: (count: number) => void;
    setupApi().on(
      "GET",
      "/api/notifications/unread-count",
      () => new Promise((resolve) => (answer = (count) => resolve({ body: { count } }))),
    );
    queryClient.setQueryData(queryKeys.overview(), overview({ unreadNotifications: 120 }));
    await renderWithProviders(<AppBar />);
    expect(await screen.findByRole("button", { name: "Notificações, 120 não lidas" })).toBeOnTheScreen();
    expect(screen.getByTestId("notifications-badge", { includeHiddenElements: true })).toHaveTextContent("99+");
    await waitFor(() => expect(answer).toBeDefined());
    answer(2);
    expect(await screen.findByRole("button", { name: "Notificações, 2 não lidas" })).toBeOnTheScreen();
  });
});

describe("destino e dados do aviso", () => {
  it("decide a tela pelo tipo da entidade", () => {
    expect(notificationTarget({ kind: "budget_exceeded", entityType: "budget", entityId: "b" })).toEqual({
      type: "route",
      href: { pathname: "/planning", params: { section: "budgets" } },
    });
    expect(notificationTarget({ kind: "goal_deadline", entityType: "savings_goal", entityId: null })).toEqual({
      type: "route",
      href: { pathname: "/planning", params: { section: "goals" } },
    });
    expect(notificationTarget({ kind: "unusual_transaction", entityType: "transaction", entityId: "t" })).toEqual({
      type: "transaction",
      id: "t",
    });
    expect(notificationTarget({ kind: "daily_reminder", entityType: null, entityId: null })).toEqual({
      type: "newTransaction",
    });
    expect(notificationTarget({ kind: "budget_warning", entityType: null, entityId: null })).toBeNull();
  });

  it("lê os campos de texto do push e ignora valores desconhecidos", () => {
    expect(parsePushData({ notificationId: "n1", kind: "low_balance", entityType: "wallet", entityId: "w1" })).toEqual({
      notificationId: "n1",
      kind: "low_balance",
      entityType: "wallet",
      entityId: "w1",
    });
    expect(parsePushData({ notificationId: "n2", kind: "daily_reminder", entityType: "", entityId: "" })).toEqual({
      notificationId: "n2",
      kind: "daily_reminder",
      entityType: null,
      entityId: null,
    });
    expect(parsePushData({ entityType: "planeta", kind: 3 })).toEqual({
      notificationId: null,
      kind: null,
      entityType: null,
      entityId: null,
    });
    expect(parsePushData(null).entityType).toBeNull();
  });

  it("formata a data relativa", () => {
    const now = new Date(2026, 9, 10, 15, 0, 0);
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
    expect(relativeTime(ago(20_000), now)).toBe("agora");
    expect(relativeTime(ago(12 * 60_000), now)).toBe("há 12 min");
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("há 3 h");
    expect(relativeTime(new Date(2026, 9, 9, 23, 0).toISOString(), now)).toBe("ontem");
    expect(relativeTime(new Date(2026, 9, 6, 9, 0).toISOString(), now)).toBe("há 4 dias");
    expect(relativeTime(new Date(2026, 8, 12, 9, 0).toISOString(), now)).toBe("12 de set.");
    expect(relativeTime(new Date(2025, 11, 25, 9, 0).toISOString(), now)).toBe("25/12/2025");
    expect(relativeTime("invalido", now)).toBe("");
  });

  it("descreve o sino para leitores de tela", () => {
    expect(bellLabel(0)).toBe("Notificações");
    expect(bellLabel(1)).toBe("Notificações, 1 não lida");
    expect(bellLabel(4)).toBe("Notificações, 4 não lidas");
  });
});
