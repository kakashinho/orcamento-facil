/**
 * Dados de demonstração da Sprint 2: cria uma conta com meses de histórico e preenche tudo o que a
 * sprint entregou (orçamentos, metas, recorrências, parcelas, lembretes, avisos, anexos...), sempre pela
 * API — assim os valores saem cifrados e os avisos nascem pelas mesmas regras do uso real.
 *
 *   npm run demo:seed                    # API em http://localhost (Nginx do docker compose)
 *   npm run demo:seed -- --reset         # apaga a conta de demonstração antes e recria
 *   npm run demo:seed -- --only-csv      # só regera os CSVs do que já está no banco
 *
 * Opções: --api <url> (ou DEMO_API_URL) · --db <url> (ou DATABASE_URL, só usada em --reset e nos
 * ajustes de vigência dos orçamentos) · --out <pasta dos CSVs>.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { ApiClient, ApiError } from "./demo/api-client.js";
import { addDays, addMonths, firstOfMonth, monthOf, random, todayIso, withDay } from "./demo/dates.js";
import { exportCsv } from "./demo/export-csv.js";
import { makePdf, makeReceiptPng } from "./demo/files.js";

const DEMO = {
  email: "demo@orcamentofacil.app",
  username: "demo",
  password: "Facil@2026",
};
const ADMIN = { email: "admin@orcamentofacil.local", username: "admin", password: "Gestor@2026!" };

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};

const BASE = (option("api") ?? process.env.DEMO_API_URL ?? "http://localhost").replace(/\/$/, "");
const DB_URL = option("db") ?? process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/myapi";
const OUT = resolve(option("out") ?? "../apresentacao/csv");

type Id = string;
interface Tx {
  id: Id;
  date: string;
  amount: number;
  description: string;
}

const log = (message: string) => console.log(`• ${message}`);

async function resetDemoAccounts() {
  const pool = new pg.Pool({ connectionString: DB_URL });
  try {
    const result = await pool.query("delete from users where email = any($1)", [[DEMO.email, ADMIN.email]]);
    log(`conta de demonstração apagada (${result.rowCount ?? 0} usuário(s))`);
  } finally {
    await pool.end();
  }
}

async function main() {
  if (flag("only-csv")) {
    const api = new ApiClient(BASE);
    await api.login({ email: DEMO.email }, DEMO.password);
    mkdirSync(OUT, { recursive: true });
    await exportCsv(api, OUT, { email: DEMO.email, password: DEMO.password, base: BASE });
    return;
  }

  if (flag("reset")) await resetDemoAccounts();

  const api = new ApiClient(BASE);
  const today = todayIso();
  const monthStart = (offset: number) => firstOfMonth(addMonths(today, offset));
  /** Dia `day` do mês `offset` (limitado a hoje no mês corrente). */
  const dateIn = (offset: number, day: number) => {
    const date = withDay(monthStart(offset), day);
    return date > today ? today : date;
  };
  const rnd = random(2026);

  log(`API ${BASE} · hoje ${today}`);
  try {
    await api.register({ email: DEMO.email, username: DEMO.username, password: DEMO.password, primaryCurrency: "BRL" });
  } catch (error) {
    if (error instanceof ApiError && error.code === "EMAIL_ALREADY_REGISTERED") {
      throw new Error("A conta de demonstração já existe. Rode de novo com --reset para recriá-la.");
    }
    throw error;
  }
  log(`conta criada: ${DEMO.email} / ${DEMO.password}`);
  await api.patch("/api/users/me", { theme: "system" });

  // ------------------------------------------------------------------ carteiras
  const wallets = await api.get<{ data: { id: Id; isDefault: boolean }[] }>("/api/wallets");
  const defaultWallet = wallets.data.find((w) => w.isDefault)!;
  await api.patch(`/api/wallets/${defaultWallet.id}`, { name: "Conta Corrente", type: "checking", initialBalance: 3200 });
  const wallet = {
    checking: defaultWallet.id,
    savings: (await api.post<{ id: Id }>("/api/wallets", { name: "Poupança", type: "savings", initialBalance: 8000 })).id,
    cash: (await api.post<{ id: Id }>("/api/wallets", { name: "Dinheiro", type: "cash", initialBalance: 350, minBalance: 100 })).id,
    card: (await api.post<{ id: Id }>("/api/wallets", { name: "Cartão Nubank", type: "credit_card", initialBalance: 0 })).id,
    usd: (await api.post<{ id: Id }>("/api/wallets", { name: "Conta Global (USD)", type: "checking", currency: "USD", initialBalance: 600 })).id,
  };
  log("5 carteiras criadas (uma em dólar e uma com saldo mínimo — R78)");

  // ------------------------------------------------------------------ categorias
  const customCategories: [string, "income" | "expense"][] = [
    ["Restaurantes", "expense"],
    ["Combustível", "expense"],
    ["Assinaturas", "expense"],
    ["Vestuário", "expense"],
    ["Pets", "expense"],
    ["Freelance", "income"],
    ["Investimentos", "income"],
  ];
  for (const [name, type] of customCategories) await api.post("/api/categories", { name, type });
  const categoryList = await api.get<{ data: { id: Id; name: string }[] }>("/api/categories");
  const category = (name: string): Id => {
    const found = categoryList.data.find((c) => c.name === name);
    if (!found) throw new Error(`Categoria não encontrada: ${name}`);
    return found.id;
  };
  await api.put(`/api/categories/${category("Outros")}/visibility`, { hiddenInReports: true });
  log('categorias personalizadas criadas e "Outros" oculta nos relatórios (R46)');

  // ------------------------------------------------------------------ recorrências e parcelamentos
  const key = () => ({ "idempotency-key": randomUUID() });
  type SeriesResult = { series: { id: Id }; transactions: Tx[] };
  const recurring = (body: Record<string, unknown>) => api.post<SeriesResult>("/api/series/recurring", body, key());
  const installments = (body: Record<string, unknown>) => api.post<SeriesResult>("/api/series/installments", body, key());

  const salary = await recurring({
    type: "income", amount: 6200, description: "Salário - Empresa Alfa", date: withDay(monthStart(-5), 1),
    walletId: wallet.checking, categoryId: category("Salário"), frequency: "monthly", notes: "Depósito no primeiro dia do mês",
  });
  const rent = await recurring({
    type: "expense", amount: 1500, description: "Aluguel", date: withDay(monthStart(-5), 10),
    walletId: wallet.checking, categoryId: category("Moradia"), frequency: "monthly", tags: ["casa"],
  });
  await recurring({
    type: "expense", amount: 55.9, description: "Netflix", date: withDay(monthStart(-4), 15),
    walletId: wallet.card, categoryId: category("Assinaturas"), frequency: "monthly",
  });
  await recurring({
    type: "expense", amount: 21.9, description: "Spotify", date: withDay(monthStart(-3), 18),
    walletId: wallet.card, categoryId: category("Assinaturas"), frequency: "monthly",
  });
  await recurring({
    type: "expense", amount: 119.9, description: "Academia", date: withDay(monthStart(-4), 20),
    walletId: wallet.card, categoryId: category("Saúde"), frequency: "monthly",
  });
  const magazine = await recurring({
    type: "expense", amount: 29.9, description: "Revista digital", date: withDay(monthStart(-3), 12),
    walletId: wallet.card, categoryId: category("Educação"), frequency: "monthly",
  });
  await api.delete(`/api/series/${magazine.series.id}`);
  const notebook = await installments({
    totalAmount: 4800, installments: 12, date: withDay(monthStart(-3), 8), description: "Notebook Dell",
    walletId: wallet.card, categoryId: category("Educação"), notes: "Compra parcelada em 12x sem juros",
  });
  await installments({
    totalAmount: 3000, installments: 10, date: withDay(monthStart(-2), 3), description: "Smart TV 50 polegadas",
    walletId: wallet.card, categoryId: category("Moradia"),
  });
  await installments({
    totalAmount: 300, installments: 3, date: addMonths(today, -2), description: "Fone de ouvido",
    walletId: wallet.card, categoryId: category("Lazer"),
  });
  log("6 séries criadas: salário, aluguel e assinaturas recorrentes, 3 parcelamentos (um já encerrado) e 1 recorrência cancelada (R37, R62)");

  // ------------------------------------------------------------------ histórico de transações
  const created: { incomes: Tx[]; byDescription: Record<string, Tx> } = { incomes: [...salary.transactions], byDescription: {} };
  const notesPool = ["Compra do mês", "Dividido com a família", "Paguei no débito", "Promoção da semana", "Reembolsável"];
  async function add(
    input: { type: "income" | "expense"; amount: number; description: string; date: string; walletId: Id; categoryId: Id; tags?: string[]; notes?: string },
  ): Promise<Tx> {
    const tx = await api.post<Tx>("/api/transactions", input);
    created.byDescription[`${input.description}|${input.date}`] = tx;
    if (input.type === "income") created.incomes.push(tx);
    return tx;
  }

  const places = {
    mercado: ["Supermercado Pão de Açúcar", "Mercado Extra", "Atacadão", "Hortifruti do bairro"],
    restaurante: ["Almoço no restaurante", "Pizzaria Napolitana", "Hamburgueria", "Café da tarde", "Sushi com amigos"],
    transporte: ["Uber", "99 Pop", "Estacionamento", "Recarga do bilhete único"],
    lazer: ["Cinema", "Show de música", "Parque de diversões", "Livraria", "Bar com amigos", "Jogo digital"],
    saude: ["Farmácia Drogasil", "Consulta médica", "Exame de sangue", "Dentista"],
  };
  for (let offset = -6; offset <= -1; offset++) {
    for (let i = 0; i < 4; i++) {
      await add({
        type: "expense", amount: rnd.between(60, 140), description: rnd.pick(places.mercado), date: dateIn(offset, rnd.int(1, 28)),
        walletId: rnd.float() < 0.3 ? wallet.card : wallet.checking, categoryId: category("Alimentação"),
        tags: rnd.float() < 0.5 ? ["casa"] : undefined, notes: rnd.float() < 0.15 ? rnd.pick(notesPool) : undefined,
      });
    }
    for (let i = 0; i < 3; i++) {
      await add({
        type: "expense", amount: rnd.between(25, 80), description: rnd.pick(places.restaurante), date: dateIn(offset, rnd.int(1, 28)),
        walletId: rnd.float() < 0.5 ? wallet.card : wallet.checking, categoryId: category("Restaurantes"),
      });
    }
    for (let i = 0; i < 5; i++) {
      await add({
        type: "expense", amount: rnd.between(12, 70), description: rnd.pick(places.transporte), date: dateIn(offset, rnd.int(1, 28)),
        walletId: wallet.checking, categoryId: category("Transporte"),
      });
    }
    await add({ type: "expense", amount: rnd.between(150, 220), description: "Posto de combustível", date: dateIn(offset, rnd.int(1, 28)), walletId: wallet.checking, categoryId: category("Combustível") });
    for (let i = 0; i < 3; i++) {
      await add({
        type: "expense", amount: rnd.between(40, 180), description: rnd.pick(places.lazer), date: dateIn(offset, rnd.int(1, 28)),
        walletId: wallet.card, categoryId: category("Lazer"), tags: rnd.float() < 0.3 ? ["amigos"] : undefined,
      });
    }
    for (let i = 0; i < 2; i++) {
      await add({
        type: "expense", amount: rnd.between(30, 160), description: rnd.pick(places.saude), date: dateIn(offset, rnd.int(1, 28)),
        walletId: wallet.checking, categoryId: category("Saúde"), notes: i === 1 && rnd.float() < 0.5 ? "Guardar o recibo para o IR" : undefined,
      });
    }
    await add({ type: "expense", amount: rnd.between(150, 210), description: "Conta de luz", date: dateIn(offset, 12), walletId: wallet.checking, categoryId: category("Moradia"), tags: ["casa"] });
    await add({ type: "expense", amount: 119.9, description: "Internet", date: dateIn(offset, 14), walletId: wallet.checking, categoryId: category("Moradia"), tags: ["casa"] });
    await add({ type: "expense", amount: rnd.between(60, 90), description: "Conta de água", date: dateIn(offset, 16), walletId: wallet.checking, categoryId: category("Moradia"), tags: ["casa"] });
    await add({ type: "expense", amount: rnd.between(60, 140), description: "Ração e petiscos", date: dateIn(offset, rnd.int(1, 28)), walletId: wallet.checking, categoryId: category("Pets") });
    if (offset % 2 === 0) {
      await add({ type: "expense", amount: rnd.between(80, 350), description: "Loja de roupas", date: dateIn(offset, rnd.int(1, 28)), walletId: wallet.card, categoryId: category("Vestuário") });
    }
    if (offset % 3 === 0) {
      await add({ type: "expense", amount: rnd.between(40, 120), description: "Presente de aniversário", date: dateIn(offset, rnd.int(1, 28)), walletId: wallet.checking, categoryId: category("Outros") });
    }
    await add({ type: "income", amount: rnd.between(70, 110), description: "Dividendos", date: dateIn(offset, 20), walletId: wallet.savings, categoryId: category("Investimentos") });
  }
  const freelance3 = await add({ type: "income", amount: 1800, description: "Freelance - site da padaria", date: dateIn(-3, 22), walletId: wallet.checking, categoryId: category("Freelance"), notes: "Projeto entregue em duas semanas" });
  await add({ type: "income", amount: 1200, description: "Freelance - identidade visual", date: dateIn(-5, 18), walletId: wallet.checking, categoryId: category("Freelance") });
  const bike = await add({ type: "income", amount: 700, description: "Venda da bicicleta", date: dateIn(-4, 9), walletId: wallet.checking, categoryId: category("Outros") });
  const freelance1 = await add({ type: "income", amount: 2200, description: "Freelance - aplicativo de delivery", date: dateIn(-1, 14), walletId: wallet.checking, categoryId: category("Freelance") });
  const bonus = await add({ type: "income", amount: 2500, description: "Bônus anual", date: dateIn(-1, 28), walletId: wallet.checking, categoryId: category("Salário"), notes: "Bônus por metas" });
  log(`histórico de 6 meses lançado (${Object.keys(created.byDescription).length} transações avulsas, com tags e observações — R57)`);

  // fatura do cartão: o gasto de cada mês é pago no dia 10 do mês seguinte (a de outubro ainda está aberta)
  const cardSpending = new Map<string, number>();
  for (const tx of await api.listAll<Tx & { type: string }>("/api/transactions", { walletId: wallet.card, type: "expense", archived: "all" })) {
    cardSpending.set(monthOf(tx.date), (cardSpending.get(monthOf(tx.date)) ?? 0) + tx.amount);
  }
  for (let offset = -6; offset <= -2; offset++) {
    const total = Math.round((cardSpending.get(monthOf(monthStart(offset))) ?? 0) * 100) / 100;
    if (total > 0) {
      await api.post("/api/transfers", { sourceWalletId: wallet.checking, targetWalletId: wallet.card, amount: total, date: withDay(monthStart(offset + 1), 10), description: "Pagamento da fatura" });
    }
  }

  // transferências entre carteiras (uma em outra moeda)
  await api.post("/api/transfers", { sourceWalletId: wallet.checking, targetWalletId: wallet.savings, amount: 800, date: dateIn(-1, 6), description: "Reserva do mês" });
  await api.post("/api/transfers", { sourceWalletId: wallet.checking, targetWalletId: wallet.savings, amount: 600, date: addDays(today, -2), description: "Reserva do mês" });
  try {
    await api.post("/api/transfers", { sourceWalletId: wallet.checking, targetWalletId: wallet.usd, amount: 1500, date: dateIn(-2, 20), description: "Compra de dólares para a viagem" });
  } catch (error) {
    log(`transferência em dólar ignorada (cotação indisponível): ${(error as Error).message}`);
  }

  // arquivar os lançamentos do primeiro mês (R52)
  await api.post("/api/transactions/archive", { before: monthStart(-5) });

  // ------------------------------------------------------------------ orçamentos e metas de redução
  const budgetPlan: [string, number, number?][] = [
    ["Alimentação", 520, 450],
    ["Restaurantes", 200],
    ["Transporte", 400, 350],
    ["Lazer", 450, 400],
    ["Saúde", 250],
    ["Moradia", 2400],
  ];
  const budgetIds: Record<string, Id> = {};
  for (const [name, amount, previous] of budgetPlan) {
    budgetIds[name] = (await api.post<{ id: Id }>("/api/budgets", { categoryId: category(name), period: "monthly", amount: previous ?? amount })).id;
  }
  await api.post("/api/budgets", { categoryId: category("Restaurantes"), period: "daily", amount: 50 });
  // Vigência: os limites "valem desde" meses atrás, para o histórico (R23) mostrar a evolução. Não há rota para isso.
  const pool = new pg.Pool({ connectionString: DB_URL });
  try {
    await pool.query("update budgets set valid_from = $1 where user_id = (select id from users where email = $2) and period = 'monthly'", [
      monthOf(addMonths(today, -5)),
      DEMO.email,
    ]);
  } finally {
    await pool.end();
  }
  for (const [name, amount, previous] of budgetPlan) {
    if (previous !== undefined) await api.patch(`/api/budgets/${budgetIds[name]}`, { amount });
  }
  log("6 orçamentos mensais (2 com limite reajustado) e 1 limite diário (R21, R23, R74)");

  await api.post("/api/reduction-goals", { categoryId: category("Lazer"), percent: 15 });
  await api.post("/api/reduction-goals", { categoryId: category("Restaurantes"), percent: 30 });
  log("2 metas de redução de gastos (R67)");

  // ------------------------------------------------------------------ mês corrente: a "história" dos avisos
  const d = (day: number) => dateIn(0, day);
  await add({ type: "expense", amount: 238.4, description: "Supermercado Pão de Açúcar", date: d(1), walletId: wallet.checking, categoryId: category("Alimentação"), tags: ["casa"] });
  await add({ type: "expense", amount: 164.2, description: "Mercado Extra", date: d(3), walletId: wallet.checking, categoryId: category("Alimentação"), tags: ["casa"], notes: "Compra do mês" });
  await add({ type: "expense", amount: 28, description: "Feira livre", date: d(4), walletId: wallet.checking, categoryId: category("Alimentação") });
  await add({ type: "expense", amount: 96, description: "Pizzaria Napolitana", date: d(2), walletId: wallet.card, categoryId: category("Restaurantes") });
  await add({ type: "expense", amount: 141, description: "Sushi com amigos", date: d(3), walletId: wallet.card, categoryId: category("Restaurantes"), tags: ["amigos"] });
  await add({ type: "expense", amount: 58, description: "Cinema", date: d(2), walletId: wallet.card, categoryId: category("Lazer") });
  await add({ type: "expense", amount: 180, description: "Show de música", date: d(3), walletId: wallet.card, categoryId: category("Lazer"), tags: ["amigos"] });
  await add({ type: "expense", amount: 74, description: "Uber", date: d(1), walletId: wallet.checking, categoryId: category("Transporte") });
  await add({ type: "expense", amount: 44, description: "Estacionamento", date: d(3), walletId: wallet.checking, categoryId: category("Transporte") });
  const pharmacy = await add({ type: "expense", amount: 87.9, description: "Farmácia Drogasil", date: d(2), walletId: wallet.checking, categoryId: category("Saúde"), notes: "Antialérgico e vitaminas" });
  await add({ type: "income", amount: 650, description: "Freelance - logotipo", date: d(2), walletId: wallet.checking, categoryId: category("Freelance"), notes: "Cliente pagou à vista" });
  const mri = await add({ type: "expense", amount: 1150, description: "Ressonância magnética", date: d(3), walletId: wallet.checking, categoryId: category("Saúde"), notes: "Pedido médico - aguardando reembolso do plano" });
  const lunch = await add({ type: "expense", amount: 62, description: "Almoço executivo", date: today, walletId: wallet.checking, categoryId: category("Restaurantes") });
  await add({ type: "expense", amount: 60, description: "Feira e padaria (dinheiro)", date: d(2), walletId: wallet.cash, categoryId: category("Alimentação") });
  await add({ type: "expense", amount: 210, description: "Lanche e táxi (dinheiro)", date: today, walletId: wallet.cash, categoryId: category("Transporte") });
  log("mês corrente lançado: orçamentos em atenção e estourados, transação incomum e saldo abaixo do mínimo (R74, R75, R78)");

  // ------------------------------------------------------------------ metas de economia
  const goalByName: Record<string, Id> = {};
  const makeGoal = async (name: string, targetAmount: number, deadline: string, categoryName: string) => {
    goalByName[name] = (await api.post<{ id: Id }>("/api/goals", { name, targetAmount, deadline, categoryId: category(categoryName) })).id;
  };
  await makeGoal("Viagem ao Chile", 9000, addMonths(today, 7), "Lazer");
  await makeGoal("Reserva de emergência", 15000, addMonths(today, 12), "Outros");
  await makeGoal("Celular novo", 1800, addMonths(today, 2), "Outros");
  await makeGoal("Presente de formatura", 600, addDays(today, 7), "Outros");
  await makeGoal("Moto", 12000, addMonths(today, 18), "Outros");
  const link = (goal: string, tx: Tx, amount?: number) =>
    api.post<{ achievedNow: boolean }>(`/api/goals/${goalByName[goal]}/contributions`, { transactionId: tx.id, ...(amount ? { amount } : {}) });
  const salaryAt = (offset: number) => salary.transactions.find((t) => monthOf(t.date) === monthOf(addMonths(today, offset)));

  await link("Viagem ao Chile", bonus, 1500);
  await link("Viagem ao Chile", freelance3, 1000);
  await link("Reserva de emergência", bike);
  const salaryPrev = salaryAt(-1);
  if (salaryPrev) await link("Reserva de emergência", salaryPrev, 1200);
  await link("Celular novo", freelance1, 1800); // completa a meta: gera o aviso de meta atingida (R68)
  const freelanceNow = Object.values(created.byDescription).find((t) => t.description === "Freelance - logotipo")!;
  await link("Presente de formatura", freelanceNow, 550); // falta pouco: dá para concluir ao vivo na apresentação
  await api.delete(`/api/goals/${goalByName["Moto"]}`);
  log("5 metas de economia: andamento, quase concluída, atingida, com prazo próximo e cancelada (R15, R16, R17, R68)");

  // ------------------------------------------------------------------ lembretes de contas
  await api.post("/api/reminders", { title: "Conta de luz", nextDueDate: addDays(today, 3), frequency: "monthly", amount: 187.4 });
  await api.post("/api/reminders", { title: "Internet", nextDueDate: addDays(today, 6), frequency: "monthly", amount: 119.9 });
  await api.post("/api/reminders", { title: "IPTU", nextDueDate: addDays(today, 45), frequency: "yearly", amount: 612 });
  await api.post("/api/reminders", { seriesId: rent.series.id });
  const paused = await api.post<{ id: Id }>("/api/reminders", { title: "Seguro do carro", nextDueDate: addDays(today, 20), frequency: "yearly", amount: 2350 });
  await api.patch(`/api/reminders/${paused.id}`, { active: false });
  log("5 lembretes de contas, um criado a partir do aluguel recorrente e um pausado (R34)");

  // ------------------------------------------------------------------ anexos
  const attach = (tx: Tx, kind: "receipt" | "document" | "photo", name: string, mime: string, content: Buffer) =>
    api.upload(`/api/transactions/${tx.id}/attachments`, { kind }, name, mime, content);
  await attach(pharmacy, "receipt", "cupom-drogasil.png", "image/png", makeReceiptPng(7));
  await attach(lunch, "receipt", "comprovante-almoco.png", "image/png", makeReceiptPng(21));
  await attach(mri, "document", "pedido-medico.pdf", "application/pdf", makePdf(["Pedido de exame", "Ressonancia magnetica", "Paciente: Demo Orcamento Facil", "Anexo de demonstracao (R24, R25)"]));
  const firstInstallment = notebook.transactions[0];
  if (firstInstallment) {
    await attach(firstInstallment, "document", "nota-fiscal-notebook.pdf", "application/pdf", makePdf(["Nota fiscal", "Notebook Dell - 12x sem juros", "Anexo de demonstracao (R24, R76)"]));
  }
  log("4 anexos (comprovantes em imagem e PDFs) cifrados no banco (R24, R25, R76)");

  // ------------------------------------------------------------------ tarefas agendadas (conta de administração)
  if (!flag("skip-jobs")) {
    try {
      const admin = new ApiClient(BASE);
      try {
        await admin.register({ email: ADMIN.email, username: ADMIN.username, password: ADMIN.password, primaryCurrency: "BRL" });
      } catch {
        await admin.login({ email: ADMIN.email }, ADMIN.password);
      }
      await admin.post("/api/admin/jobs/run");
      log("tarefas agendadas executadas (lembrete de prazo das metas, ocorrências das séries, push pendente)");
    } catch (error) {
      log(`tarefas agendadas não executadas: ${(error as Error).message}`);
    }
  }

  // ------------------------------------------------------------------ avisos: deixa os mais recentes como não lidos
  const notifications = await api.get<{ data: { id: Id; readAt: string | null }[] }>("/api/notifications", { limit: 50 });
  const unreadToKeep = 5;
  for (const notification of notifications.data.slice(unreadToKeep)) {
    if (!notification.readAt) await api.post(`/api/notifications/${notification.id}/read`);
  }
  log(`${notifications.data.length} avisos gerados; os ${Math.min(unreadToKeep, notifications.data.length)} mais recentes ficaram não lidos (R22)`);

  mkdirSync(OUT, { recursive: true });
  await exportCsv(api, OUT, { email: DEMO.email, password: DEMO.password, base: BASE });
  log(`pronto — entre no app com ${DEMO.email} (ou "${DEMO.username}") e a senha ${DEMO.password}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `\n✖ ${error.message}` : error);
  process.exit(1);
});
