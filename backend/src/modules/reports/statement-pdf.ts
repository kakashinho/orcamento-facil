import PDFDocument from "pdfkit";
import { formatDateBr } from "../../shared/dates.js";
import type { MovementKind, StatementReport } from "./report.service.js";

const PAGE_MARGIN = 40;
const ROW_HEIGHT = 16;
const COLUMNS = [
  { key: "date", label: "Data", width: 58, align: "left" },
  { key: "description", label: "Descrição", width: 197, align: "left" },
  { key: "category", label: "Categoria", width: 90, align: "left" },
  { key: "amount", label: "Valor", width: 85, align: "right" },
  { key: "balance", label: "Saldo", width: 85, align: "right" },
] as const;

const KIND_LABEL: Record<MovementKind, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer_in: "Transferência recebida",
  transfer_out: "Transferência enviada",
};

/** Formata valor; usa o código da moeda quando o símbolo não existe nas fontes padrão do PDF. */
function money(value: number, currency: string): string {
  const formatted = new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
  return /[^\u0000-ÿ€]/.test(formatted)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency, currencyDisplay: "code" }).format(value)
    : formatted;
}

/** Gera o PDF do extrato (R41) a partir do mesmo relatório servido em JSON. */
export function renderStatementPdf(
  report: StatementReport,
  meta: { holder: string; generatedAtLabel: string },
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    bufferPages: true,
    info: { Title: "Extrato — Orçamento Fácil", Author: "Orçamento Fácil" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = PAGE_MARGIN;
  const contentWidth = doc.page.width - PAGE_MARGIN * 2;
  const bottomLimit = () => doc.page.height - PAGE_MARGIN - 30;

  doc.font("Helvetica-Bold").fontSize(18).fillColor("#1b5e20").text("Orçamento Fácil", left, PAGE_MARGIN);
  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor("#111111")
    .text(`Extrato de ${formatDateBr(report.from)} a ${formatDateBr(report.to)}`);
  doc.fontSize(9).fillColor("#555555").text(`Titular: ${meta.holder}   ·   Gerado em ${meta.generatedAtLabel}`);
  doc.moveDown(1);

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(left, y - 2, contentWidth, ROW_HEIGHT).fill("#e8f5e9");
    let x = left + 4;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#1b5e20");
    for (const column of COLUMNS) {
      doc.text(column.label, x, y + 2, { width: column.width - 8, align: column.align, lineBreak: false });
      x += column.width;
    }
    doc.y = y + ROW_HEIGHT;
  };

  const ensureSpace = (rows: number, repeatHeader: boolean) => {
    if (doc.y + rows * ROW_HEIGHT > bottomLimit()) {
      doc.addPage();
      doc.y = PAGE_MARGIN;
      if (repeatHeader) drawHeader();
    }
  };

  const drawRow = (cells: Record<(typeof COLUMNS)[number]["key"], string>, options: { bold?: boolean; color?: string } = {}) => {
    const y = doc.y;
    let x = left + 4;
    doc.font(options.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).fillColor(options.color ?? "#111111");
    for (const column of COLUMNS) {
      doc.text(cells[column.key], x, y + 3, {
        width: column.width - 8,
        align: column.align,
        lineBreak: false,
        ellipsis: true,
      });
      x += column.width;
    }
    doc
      .moveTo(left, y + ROW_HEIGHT)
      .lineTo(left + contentWidth, y + ROW_HEIGHT)
      .lineWidth(0.3)
      .strokeColor("#dddddd")
      .stroke();
    doc.y = y + ROW_HEIGHT;
  };

  if (report.wallets.length === 0) {
    doc.font("Helvetica").fontSize(10).fillColor("#111111").text("Nenhuma carteira cadastrada.");
  }

  for (const section of report.wallets) {
    ensureSpace(5, false);
    const { currency } = section.wallet;
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#111111")
      .text(`${section.wallet.name} (${currency})`, left, doc.y + 6);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#333333")
      .text(`Saldo inicial em ${formatDateBr(report.from)}: ${money(section.openingBalance, currency)}`);
    doc.moveDown(0.4);
    drawHeader();

    if (section.entries.length === 0) {
      ensureSpace(1, true);
      drawRow({ date: "", description: "Sem movimentações no período.", category: "", amount: "", balance: "" }, { color: "#777777" });
    }
    for (const entry of section.entries) {
      ensureSpace(1, true);
      drawRow(
        {
          date: formatDateBr(entry.date),
          description: entry.description,
          category: entry.category?.name ?? KIND_LABEL[entry.kind],
          amount: money(entry.amount, currency),
          balance: money(entry.balance, currency),
        },
        { color: entry.amount < 0 ? "#b71c1c" : "#1b5e20" },
      );
    }

    ensureSpace(3, false);
    doc.moveDown(0.3);
    drawRow({ date: "", description: "Total de entradas", category: "", amount: money(section.totalIn, currency), balance: "" }, { bold: true });
    drawRow({ date: "", description: "Total de saídas", category: "", amount: money(-section.totalOut, currency), balance: "" }, { bold: true });
    drawRow(
      { date: "", description: `Saldo final em ${formatDateBr(report.to)}`, category: "", amount: "", balance: money(section.closingBalance, currency) },
      { bold: true },
    );
    doc.moveDown(1);
  }

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    // O rodapé fica dentro da margem inferior; zerá-la evita que o pdfkit crie uma página nova.
    doc.page.margins.bottom = 0;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#777777")
      .text(`Página ${index + 1} de ${range.count}`, left, doc.page.height - PAGE_MARGIN - 10, {
        width: contentWidth,
        align: "right",
        lineBreak: false,
      });
  }

  doc.end();
  return finished;
}
