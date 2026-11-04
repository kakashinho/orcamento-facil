/**
 * CSVs da demonstração, gerados a partir do que a API devolve (ou seja, do próprio banco). Formato
 * pensado para abrir no Excel em português: separador ";", vírgula decimal, datas AAAA-MM-DD e BOM UTF-8.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ApiClient } from "./api-client.js";
import { addMonths, firstOfMonth, lastOfMonth, monthOf, todayIso } from "./dates.js";

type Cell = string | number | boolean | null | undefined;

function format(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") return String(cell).replace(".", ",");
  if (typeof cell === "boolean") return cell ? "sim" : "não";
  return /[;"\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

function write(dir: string, name: string, header: string[], rows: Cell[][]): void {
  const lines = [header, ...rows].map((row) => row.map(format).join(";"));
  writeFileSync(join(dir, name), `﻿${lines.join("\r\n")}\r\n`, "utf8");
  console.log(`  ${name} (${rows.length} linha${rows.length === 1 ? "" : "s"})`);
}

const KIND_LABEL: Record<string, string> = {
  budget_warning: "Orçamento em atenção",
  budget_exceeded: "Orçamento estourado",
  daily_limit_exceeded: "Limite diário estourado",
  reduction_exceeded: "Meta de redução estourada",
  unusual_transaction: "Transação incomum",
  low_balance: "Saldo abaixo do mínimo",
  goal_achieved: "Meta atingida",
  goal_deadline: "Prazo da meta",
  daily_reminder: "Lembrete diário",
  bill_reminder: "Lembrete de conta",
};
const FREQUENCY: Record<string, string> = { weekly: "Semanal", monthly: "Mensal", yearly: "Anual" };
const WALLET_TYPE: Record<string, string> = {
  checking: "Conta corrente", savings: "Poupança", cash: "Dinheiro", investment: "Investimento", credit_card: "Cartão de crédito", other: "Outra",
};
const BUDGET_STATE: Record<string, string> = { ok: "Dentro", warning: "Em atenção", exceeded: "Estourado" };
const SERIES_STATUS: Record<string, string> = { active: "Ativa", ended: "Encerrada", cancelled: "Cancelada" };
const GOAL_STATUS: Record<string, string> = { active: "Ativa", achieved: "Atingida", cancelled: "Cancelada" };

/** Requisito → onde mostrar → o que a demonstração já tem → CSV de apoio. */
const REQUIREMENTS: string[][] = [
  ["R13 · R50", "Gráfico de pizza das despesas por categoria, com opção de anéis", "Início › Ver análises › Despesas por categoria", "6 meses de despesas em 9 categorias", "11-gastos-por-categoria.csv"],
  ["R14", "Evolução do saldo (30 dias ou 12 meses; todas as carteiras ou uma)", "Análises › Evolução do saldo", "Saldo diário e mensal calculado sobre o histórico", "12-evolucao-do-saldo.csv"],
  ["R35 · R75", "Saldo médio diário e economia do mês comparada à média dos meses anteriores", "Análises › Indicadores do mês", "Mês corrente com 6 meses de comparação", "14-indicadores-do-mes.csv"],
  ["R36", "As 10 maiores despesas do mês", "Análises › Maiores despesas", "Inclui a ressonância de R$ 1.150", "14-indicadores-do-mes.csv"],
  ["R38", "Resumo anual com totais e médias", "Análises › Resumo anual", "12 meses, 7 com movimento", "13-receitas-e-despesas-por-mes.csv"],
  ["R63", "Projeção do saldo pelas recorrências e parcelas restantes", "Análises › Projeção", "Salário, aluguel, assinaturas e 3 parcelamentos", "15-projecao-do-saldo.csv"],
  ["R46", "Ocultar categorias dos relatórios", "Análises › Categorias visíveis", 'Categoria "Outros" oculta (o cartão mostra o que ficou de fora)', "11-gastos-por-categoria.csv"],
  ["R30", "Compartilhar um cartão como imagem (PNG)", "Cartões das Análises e gráfico Orçado × gasto › ícone de compartilhar", "Qualquer cartão com dados", "—"],
  ["R37", "Recorrências (semanal, mensal, anual)", "Nova transação › Repetir · Planejamento › Contas", "Salário, aluguel, Netflix, Spotify, academia; revista cancelada", "04-recorrencias-e-parcelamentos.csv"],
  ["R62", "Parcelamento de 2 a 72 vezes, com a sobra dos centavos na 1ª parcela", "Nova transação › Parcelar · Planejamento › Contas", "Notebook 12x, Smart TV 10x, fone 3x (encerrado)", "04-recorrencias-e-parcelamentos.csv"],
  ["R34", "Lembretes de contas fixas", "Planejamento › Contas › Lembretes", "Luz, internet, IPTU, aluguel; seguro pausado", "08-lembretes-de-contas.csv"],
  ["R21 · R74", "Orçamentos mensais e limites diários por categoria", "Planejamento › Orçamentos", "6 mensais + 1 diário em estados diferentes", "05-orcamentos-do-mes.csv"],
  ["R45", "Gráfico orçado × gasto", "Planejamento › Orçamentos", "6 categorias", "05-orcamentos-do-mes.csv"],
  ["R23", "Histórico dos orçamentos e comparação entre meses", "Planejamento › Orçamentos › Histórico", "Limites reajustados em Alimentação e Transporte", "06-historico-de-orcamentos.csv"],
  ["R67", "Metas de redução de gastos por categoria", "Planejamento › Orçamentos › Metas de redução", "Lazer −15% (no ritmo) e Restaurantes −30% (estourada)", "07-metas-de-reducao.csv"],
  ["R15 · R16", "Metas de economia com prazo e progresso", "Planejamento › Metas", "Ativas, atingida e cancelada", "09-metas-de-economia.csv"],
  ["R17 · R68", "Destinar receitas à meta; celebração ao atingir", "Detalhe da meta › Vincular receita · Nova receita › Destinar a uma meta", '"Presente de formatura" falta R$ 50: vincule "Bônus anual" com R$ 50', "10-vinculos-das-metas.csv"],
  ["R22 · R47", "Central de notificações com sino e contador", "Sino na barra superior", "10 tipos de aviso gerados pelas regras reais", "16-notificacoes.csv"],
  ["R78", "Saldo mínimo por carteira", "Carteiras (selo Abaixo do mínimo)", "Carteira Dinheiro com mínimo de R$ 100", "01-carteiras.csv"],
  ["R18", "Push pelo Firebase Cloud Messaging", "Preferências › Notificações", "Aparelho registrado ao entrar; avisos novos chegam com o app fechado", "—"],
  ["R24 · R25 · R76", "Anexos (foto, PDF, comprovante) cifrados", "Detalhes da transação › Anexos", "4 anexos em 4 transações", "17-anexos.csv"],
  ["R57", "Observações nas transações", "Detalhes da transação", "Várias transações com observação", "02-transacoes.csv"],
  ["R52", "Arquivo de transações antigas", "Preferências › Arquivo de transações", "Lançamentos do primeiro mês arquivados", "02-transacoes.csv"],
  ["R81", "Dados financeiros cifrados no banco e arquivos temporários apagados", "—", "Valores e anexos cifrados (AES) no PostgreSQL", "—"],
];

export async function exportCsv(
  api: ApiClient,
  outDir: string,
  demo: { email: string; password: string; base: string },
): Promise<void> {
  // Um token novo: a demonstração pode ter durado mais que a validade do anterior.
  await api.login({ email: demo.email }, demo.password);
  console.log(`CSVs em ${outDir}`);
  const today = todayIso();
  const month = monthOf(today);

  write(outDir, "00-roteiro-por-requisito.csv", ["Requisito", "O que a Sprint 2 entregou", "Onde mostrar no app", "O que a demonstração já tem", "CSV de apoio"], REQUIREMENTS);

  type Wallet = { name: string; type: string; currency: string; isDefault: boolean; balance: number; initialBalance: number; minBalance: number | null };
  const wallets = (await api.get<{ data: Wallet[] }>("/api/wallets")).data;
  write(outDir, "01-carteiras.csv", ["Carteira", "Tipo", "Moeda", "Padrão", "Saldo inicial", "Saldo atual", "Saldo mínimo (R78)", "Abaixo do mínimo"],
    wallets.map((w) => [w.name, WALLET_TYPE[w.type] ?? w.type, w.currency, w.isDefault, w.initialBalance, w.balance, w.minBalance, w.minBalance !== null && w.balance < w.minBalance]));

  type Tx = {
    id: string; type: string; amount: number; currency: string; date: string; description: string; notes: string | null;
    wallet: { name: string }; category: { name: string } | null; tags: { name: string }[]; archived: boolean;
    series: { kind: string; occurrence: number; total: number | null } | null;
  };
  const transactions = await api.listAll<Tx>("/api/transactions", { archived: "all", sort: "date", order: "desc" });
  const attachmentCount = new Map<string, number>();
  type Attachment = { id: string; kind: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string };
  const attachments: { tx: Tx; item: Attachment }[] = [];
  for (const tx of transactions) {
    const list = (await api.get<{ data: Attachment[] }>(`/api/transactions/${tx.id}/attachments`)).data;
    if (list.length) attachmentCount.set(tx.id, list.length);
    for (const item of list) attachments.push({ tx, item });
  }
  write(outDir, "02-transacoes.csv", ["Data", "Tipo", "Descrição", "Categoria", "Carteira", "Valor", "Moeda", "Tags", "Observações (R57)", "Origem", "Arquivada (R52)", "Anexos"],
    transactions.map((t) => [
      t.date, t.type === "income" ? "Receita" : "Despesa", t.description, t.category?.name ?? "", t.wallet.name, t.type === "income" ? t.amount : -t.amount, t.currency,
      t.tags.map((tag) => tag.name).join(", "), t.notes,
      t.series ? (t.series.kind === "installment" ? `Parcela ${t.series.occurrence}/${t.series.total}` : `Recorrência #${t.series.occurrence}`) : "Avulsa",
      t.archived, attachmentCount.get(t.id) ?? 0,
    ]));

  const transfers = await api.listAll<{ date: string; sourceWallet: { name: string; currency: string }; targetWallet: { name: string; currency: string }; amount: number; targetAmount: number; exchangeRate: number | null; description: string | null }>("/api/transfers");
  write(outDir, "03-transferencias.csv", ["Data", "Origem", "Destino", "Valor de saída", "Moeda de saída", "Valor de entrada", "Moeda de entrada", "Cotação", "Descrição"],
    transfers.map((t) => [t.date, t.sourceWallet.name, t.targetWallet.name, t.amount, t.sourceWallet.currency, t.targetAmount, t.targetWallet.currency, t.exchangeRate, t.description]));

  type Series = {
    kind: string; type: string; frequency: string; description: string; wallet: { name: string }; category: { name: string } | null; amount: number;
    totalAmount: number | null; installments: number | null; startDate: string; endDate: string | null; nextDate: string | null; generatedCount: number; remaining: number | null; status: string;
  };
  const series = (await api.get<{ data: Series[] }>("/api/series", { status: "all" })).data;
  write(outDir, "04-recorrencias-e-parcelamentos.csv", ["Tipo", "Descrição", "Receita/Despesa", "Frequência", "Valor da ocorrência", "Valor total", "Parcelas", "Já geradas", "Restantes", "Início", "Próxima data", "Carteira", "Categoria", "Situação"],
    series.map((s) => [
      s.kind === "recurring" ? "Recorrência" : "Parcelamento", s.description, s.type === "income" ? "Receita" : "Despesa", FREQUENCY[s.frequency] ?? s.frequency, s.amount, s.totalAmount,
      s.installments, s.generatedCount, s.remaining, s.startDate, s.nextDate, s.wallet.name, s.category?.name ?? "", SERIES_STATUS[s.status] ?? s.status,
    ]));

  type Status = { category: { name: string }; period: string; currency: string; limit: number; spent: number | null; remaining: number | null; percent: number | null; state: string };
  const budgetStatus = await api.get<{ monthly: Status[]; daily: Status[] }>("/api/budgets/status", { month, date: today });
  write(outDir, "05-orcamentos-do-mes.csv", ["Categoria", "Período", "Limite", "Gasto", "Restante", "Percentual", "Situação"],
    [...budgetStatus.monthly, ...budgetStatus.daily].map((b) => [b.category.name, b.period === "monthly" ? "Mensal" : "Diário (hoje)", b.limit, b.spent, b.remaining, b.percent, BUDGET_STATE[b.state] ?? b.state]));

  const history = await api.get<{ months: { month: string; items: Status[] }[] }>("/api/budgets/history", { fromMonth: monthOf(addMonths(today, -5)), toMonth: month });
  write(outDir, "06-historico-de-orcamentos.csv", ["Mês", "Categoria", "Limite que valia", "Gasto", "Percentual", "Situação"],
    history.months.flatMap((m) => m.items.map((b) => [m.month, b.category.name, b.limit, b.spent, b.percent, BUDGET_STATE[b.state] ?? b.state])));

  const reductions = (await api.get<{ data: { category: { name: string }; percent: number; baseline: number; target: number; spent: number | null; state: string; startMonth: string }[] }>("/api/reduction-goals", { month })).data;
  write(outDir, "07-metas-de-reducao.csv", ["Categoria", "Redução", "Média dos 3 meses anteriores (base)", "Alvo do mês", "Gasto no mês", "Situação", "Início"],
    reductions.map((r) => [r.category.name, `${r.percent}%`, r.baseline, r.target, r.spent, r.state === "on_track" ? "No ritmo" : "Estourada", r.startMonth]));

  type Reminder = { title: string; amount: number | null; currency: string; frequency: string; nextDueDate: string; seriesId: string | null; active: boolean };
  const reminders = (await api.get<{ data: Reminder[] }>("/api/reminders")).data;
  write(outDir, "08-lembretes-de-contas.csv", ["Conta", "Valor", "Frequência", "Próximo vencimento", "Vem de uma recorrência", "Ativo"],
    reminders.map((r) => [r.title, r.amount, FREQUENCY[r.frequency] ?? r.frequency, r.nextDueDate, r.seriesId !== null, r.active]));

  type Goal = { id: string; name: string; category: { name: string }; targetAmount: number; deadline: string; status: string; saved: number | null; percent: number | null; remaining: number | null; daysLeft: number; achievedAt: string | null };
  const goals = (await api.get<{ data: Goal[] }>("/api/goals", { status: "all" })).data;
  write(outDir, "09-metas-de-economia.csv", ["Meta", "Categoria", "Valor alvo", "Guardado", "Percentual", "Falta", "Prazo", "Dias restantes", "Situação"],
    goals.map((g) => [g.name, g.category.name, g.targetAmount, g.saved, g.percent, g.remaining, g.deadline, g.status === "active" ? g.daysLeft : null, GOAL_STATUS[g.status] ?? g.status]));

  const links: Cell[][] = [];
  for (const goal of goals) {
    const detail = await api.get<{ contributions: { transaction: { date: string; description: string; amount: number }; amount: number; counted: number }[] }>(`/api/goals/${goal.id}`);
    for (const c of detail.contributions) links.push([goal.name, c.transaction.description, c.transaction.date, c.transaction.amount, c.amount, c.counted]);
  }
  write(outDir, "10-vinculos-das-metas.csv", ["Meta", "Receita vinculada", "Data da receita", "Valor da receita", "Valor destinado", "Valor que conta"], links);

  const byCategory: Cell[][] = [];
  for (let offset = -5; offset <= 0; offset++) {
    const from = firstOfMonth(addMonths(today, offset));
    const report = await api.get<{ categories: { category: { name: string } | null; count: number; convertedTotal: number | null; share: number | null }[]; hidden: { count: number; convertedTotal: number | null } }>(
      "/api/reports/by-category", { from, to: lastOfMonth(from), type: "expense" });
    for (const row of report.categories) byCategory.push([monthOf(from), row.category?.name ?? "Sem categoria", row.count, row.convertedTotal, row.share]);
    if (report.hidden.count) byCategory.push([monthOf(from), "(categorias ocultas — R46)", report.hidden.count, report.hidden.convertedTotal, null]);
  }
  write(outDir, "11-gastos-por-categoria.csv", ["Mês", "Categoria", "Lançamentos", "Total em BRL", "Participação (%)"], byCategory);

  const evolution = await api.get<{ points: { date: string; balance: number | null }[] }>("/api/reports/balance-evolution", { from: firstOfMonth(addMonths(today, -11)), to: today, granularity: "month" });
  write(outDir, "12-evolucao-do-saldo.csv", ["Mês", "Saldo de fim de mês (BRL, todas as carteiras)"], evolution.points.map((p) => [p.date.slice(0, 7), p.balance]));

  const monthly = await api.get<{ months: { month: string; converted: { income: number; expense: number; net: number } | null }[] }>("/api/reports/monthly", { fromMonth: monthOf(addMonths(today, -11)), toMonth: month });
  write(outDir, "13-receitas-e-despesas-por-mes.csv", ["Mês", "Receitas", "Despesas", "Resultado"], monthly.months.map((m) => [m.month, m.converted?.income ?? 0, m.converted?.expense ?? 0, m.converted?.net ?? 0]));

  const indicators = await api.get<{
    averageDailyBalance: number | null; days: number; savings: { saved: number | null; previousAverage: number | null; difference: number | null; differencePercent: number | null };
    topExpenses: { transaction: Tx; convertedAmount: number | null }[];
  }>("/api/reports/month-indicators", { month });
  write(outDir, "14-indicadores-do-mes.csv", ["Indicador", "Valor", "Detalhe"], [
    ["Saldo médio diário (R35)", indicators.averageDailyBalance, `${indicators.days} dias do mês`],
    ["Economia do mês (R75)", indicators.savings.saved, "receitas − despesas"],
    ["Média de economia dos meses anteriores", indicators.savings.previousAverage, ""],
    ["Diferença", indicators.savings.difference, indicators.savings.differencePercent === null ? "" : `${String(indicators.savings.differencePercent).replace(".", ",")}%`],
    ...indicators.topExpenses.map((e, index) => [`Maior despesa #${index + 1} (R36)`, e.convertedAmount, `${e.transaction.description} · ${e.transaction.date}`]),
  ]);

  const projection = await api.get<{ startBalance: number | null; months: { month: string; openingBalance: number | null; expectedIncome: number | null; expectedExpense: number | null; closingBalance: number | null }[] }>("/api/reports/projection", { months: 6 });
  write(outDir, "15-projecao-do-saldo.csv", ["Mês", "Saldo inicial", "Receitas previstas", "Despesas previstas", "Saldo final previsto"],
    projection.months.map((m) => [m.month, m.openingBalance, m.expectedIncome, m.expectedExpense, m.closingBalance]));

  const notifications = await api.listAll<{ kind: string; title: string; body: string; readAt: string | null; createdAt: string }>("/api/notifications", {}, 50);
  write(outDir, "16-notificacoes.csv", ["Quando", "Tipo", "Título", "Texto (sem valores em dinheiro)", "Lida"],
    notifications.map((n) => [n.createdAt.replace("T", " ").slice(0, 19), KIND_LABEL[n.kind] ?? n.kind, n.title, n.body, n.readAt !== null]));

  write(outDir, "17-anexos.csv", ["Transação", "Data", "Tipo", "Arquivo", "Formato", "Tamanho (KB)"],
    attachments.map(({ tx, item }) => [tx.description, tx.date, item.kind === "receipt" ? "Comprovante" : item.kind === "photo" ? "Foto" : "Documento", item.fileName, item.mimeType, Math.round(item.sizeBytes / 102.4) / 10]));

  write(outDir, "18-acesso-demonstracao.csv", ["Item", "Valor"], [
    ["Servidor (emulador Android)", "http://10.0.2.2"],
    ["Servidor (celular na mesma rede)", "http://<IP do computador>"],
    ["E-mail", demo.email],
    ["Senha", demo.password],
    ["Documentação interativa da API", `${demo.base}/docs`],
  ]);
}
