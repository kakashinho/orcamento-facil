/**
 * CSVs de apoio da demonstração, gerados do que a API devolve (ou seja, do próprio banco). São só dois
 * arquivos — transações e planejamento — para abrir no Excel em português: separador ";", vírgula
 * decimal, datas AAAA-MM-DD e BOM UTF-8. Não são exigência de nenhum requisito.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ApiClient } from "./api-client.js";
import { monthOf, todayIso } from "./dates.js";

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

const FREQUENCY: Record<string, string> = { weekly: "Semanal", monthly: "Mensal", yearly: "Anual" };
const BUDGET_STATE: Record<string, string> = { ok: "Dentro", warning: "Em atenção", exceeded: "Estourado" };
const SERIES_STATUS: Record<string, string> = { active: "Ativa", ended: "Encerrada", cancelled: "Cancelada" };
const GOAL_STATUS: Record<string, string> = { active: "Ativa", achieved: "Atingida", cancelled: "Cancelada" };

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

  // ------------------------------------------------------------------ 1. transações
  type Tx = {
    id: string; type: string; amount: number; currency: string; date: string; description: string; notes: string | null;
    wallet: { name: string }; category: { name: string } | null; tags: { name: string }[]; archived: boolean;
    series: { kind: string; occurrence: number; total: number | null } | null;
  };
  const transactions = await api.listAll<Tx>("/api/transactions", { archived: "all", sort: "date", order: "desc" });
  const attachmentCount = new Map<string, number>();
  for (const tx of transactions) {
    const list = (await api.get<{ data: unknown[] }>(`/api/transactions/${tx.id}/attachments`)).data;
    if (list.length) attachmentCount.set(tx.id, list.length);
  }
  write(outDir, "01-transacoes.csv", ["Data", "Tipo", "Descrição", "Categoria", "Carteira", "Valor", "Moeda", "Tags", "Observações", "Origem", "Arquivada", "Anexos"],
    transactions.map((t) => [
      t.date, t.type === "income" ? "Receita" : "Despesa", t.description, t.category?.name ?? "", t.wallet.name, t.type === "income" ? t.amount : -t.amount, t.currency,
      t.tags.map((tag) => tag.name).join(", "), t.notes,
      t.series ? (t.series.kind === "installment" ? `Parcela ${t.series.occurrence}/${t.series.total}` : `Recorrência #${t.series.occurrence}`) : "Avulsa",
      t.archived, attachmentCount.get(t.id) ?? 0,
    ]));

  // ------------------------------------------------------------------ 2. planejamento (tudo da Sprint 2 numa tabela só)
  const planning: Cell[][] = [];
  type Status = { category: { name: string }; limit: number; spent: number | null; percent: number | null; state: string };
  const budgets = await api.get<{ monthly: Status[]; daily: Status[] }>("/api/budgets/status", { month, date: today });
  for (const b of budgets.monthly) planning.push(["Orçamento mensal", b.category.name, b.category.name, b.limit, b.spent, b.percent, BUDGET_STATE[b.state] ?? b.state, month]);
  for (const b of budgets.daily) planning.push(["Orçamento diário", b.category.name, b.category.name, b.limit, b.spent, b.percent, BUDGET_STATE[b.state] ?? b.state, `hoje (${today})`]);

  const reductions = (await api.get<{ data: { category: { name: string }; percent: number; baseline: number; target: number; spent: number | null; state: string }[] }>("/api/reduction-goals", { month })).data;
  for (const r of reductions) {
    const percent = r.spent === null ? null : Math.round((r.spent / r.target) * 1000) / 10;
    planning.push(["Meta de redução", `Reduzir ${r.percent}% em ${r.category.name}`, r.category.name, r.target, r.spent, percent, r.state === "on_track" ? "No ritmo" : "Estourada", `base ${String(r.baseline).replace(".", ",")}`]);
  }

  type Goal = { name: string; category: { name: string }; targetAmount: number; deadline: string; status: string; saved: number | null; percent: number | null; daysLeft: number };
  const goals = (await api.get<{ data: Goal[] }>("/api/goals", { status: "all" })).data;
  for (const g of goals) planning.push(["Meta de economia", g.name, g.category.name, g.targetAmount, g.saved, g.percent, GOAL_STATUS[g.status] ?? g.status, `prazo ${g.deadline}${g.status === "active" ? ` (${g.daysLeft} dias)` : ""}`]);

  type Series = {
    kind: string; type: string; frequency: string; description: string; category: { name: string } | null; amount: number; totalAmount: number | null;
    installments: number | null; nextDate: string | null; generatedCount: number; status: string;
  };
  const series = (await api.get<{ data: Series[] }>("/api/series", { status: "all" })).data;
  for (const s of series) {
    const installment = s.kind === "installment";
    planning.push([
      installment ? "Parcelamento" : s.type === "income" ? "Recorrência (receita)" : "Recorrência (despesa)", s.description, s.category?.name ?? "",
      installment ? s.totalAmount : s.amount, null, installment && s.installments ? Math.round((s.generatedCount / s.installments) * 1000) / 10 : null,
      SERIES_STATUS[s.status] ?? s.status,
      `${FREQUENCY[s.frequency] ?? s.frequency}${installment ? ` · ${s.generatedCount} de ${s.installments} parcelas` : ""}${s.nextDate ? ` · próxima em ${s.nextDate}` : ""}`,
    ]);
  }

  const reminders = (await api.get<{ data: { title: string; amount: number | null; frequency: string; nextDueDate: string; active: boolean }[] }>("/api/reminders")).data;
  for (const r of reminders) planning.push(["Lembrete de conta", r.title, "", r.amount, null, null, r.active ? "Ativo" : "Pausado", `${FREQUENCY[r.frequency] ?? r.frequency} · vence em ${r.nextDueDate}`]);

  write(outDir, "02-planejamento.csv", ["Tipo", "Nome", "Categoria", "Limite ou valor de referência", "Valor atual", "Percentual", "Situação", "Detalhe"], planning);
}
