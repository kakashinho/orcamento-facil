import { eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { users } from "../../db/schema.js";
import { requireAuth } from "../../http/auth.js";
import type { RouteDeps } from "../../http/route-deps.js";
import { isoDate, isoMonth, secured } from "../../http/schemas.js";
import { errors } from "../../shared/errors.js";
import { renderStatementPdf } from "./statement-pdf.js";

const kind = z.enum(["income", "expense", "transfer_in", "transfer_out"]);
const categoryInfo = z.object({ id: z.string(), name: z.string() }).nullable();

const statementResponse = z
  .object({
    from: z.string(),
    to: z.string(),
    generatedAt: z.string(),
    wallets: z.array(
      z.object({
        wallet: z.object({ id: z.string(), name: z.string(), currency: z.string(), type: z.string() }),
        openingBalance: z.number(),
        totalIn: z.number(),
        totalOut: z.number(),
        closingBalance: z.number(),
        entries: z.array(
          z.object({
            date: z.string(),
            kind,
            referenceId: z.string(),
            description: z.string(),
            category: categoryInfo,
            amount: z.number().meta({ description: "Com sinal: positivo entra, negativo sai" }),
            balance: z.number().meta({ description: "Saldo após o movimento" }),
          }),
        ),
      }),
    ),
  })
  .meta({ id: "Statement" });

const periodQuery = z.object({ from: isoDate, to: isoDate, walletId: z.uuid().optional() });

const MAX_PERIOD_DAYS = 366 * 5;

function assertPeriod(from: string, to: string) {
  if (from > to) throw errors.validation("A data inicial deve ser anterior ou igual à final.");
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (days > MAX_PERIOD_DAYS) throw errors.validation("O período máximo de um relatório é de 5 anos.");
}

export function reportRoutes(deps: RouteDeps): FastifyPluginAsyncZod {
  const { reports, db, clock } = deps.container;
  return async (app) => {
    app.addHook("onRequest", deps.authenticate);

    app.get(
      "/statement",
      {
        schema: {
          tags: ["Relatórios"],
          summary: "Extrato do período (R41)",
          description: "Por carteira: saldo inicial, movimentos em ordem cronológica com saldo corrente, totais e saldo final.",
          security: secured,
          querystring: periodQuery,
          response: { 200: statementResponse },
        },
      },
      async (request) => {
        assertPeriod(request.query.from, request.query.to);
        return reports.statement(requireAuth(request).userId, request.query);
      },
    );

    app.get(
      "/statement/pdf",
      {
        schema: {
          tags: ["Relatórios"],
          summary: "Extrato do período em PDF (R41)",
          security: secured,
          querystring: periodQuery,
          produces: ["application/pdf"],
        },
      },
      async (request, reply) => {
        const { userId } = requireAuth(request);
        assertPeriod(request.query.from, request.query.to);
        const report = await reports.statement(userId, request.query);
        const [user] = await db
          .select({ username: users.username, timezone: users.timezone })
          .from(users)
          .where(eq(users.id, userId));
        const generatedAtLabel = new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: user?.timezone ?? "America/Sao_Paulo",
        }).format(clock.now());
        const pdf = await renderStatementPdf(report, { holder: user?.username ?? "", generatedAtLabel });
        return reply
          .header("content-type", "application/pdf")
          .header(
            "content-disposition",
            `attachment; filename="extrato-${request.query.from}_${request.query.to}.pdf"`,
          )
          .send(pdf);
      },
    );

    app.get(
      "/cash-flow",
      {
        schema: {
          tags: ["Relatórios"],
          summary: "Fluxo de caixa do período (R58)",
          description:
            "Todas as entradas e saídas em ordem cronológica, com totais por moeda e total convertido para a moeda principal. Sem `walletId`, transferências internas são omitidas.",
          security: secured,
          querystring: periodQuery,
          response: {
            200: z.object({
              from: z.string(),
              to: z.string(),
              walletId: z.string().nullable(),
              primaryCurrency: z.string(),
              entries: z.array(
                z.object({
                  date: z.string(),
                  kind,
                  referenceId: z.string(),
                  description: z.string(),
                  wallet: z.object({ id: z.string(), name: z.string(), currency: z.string() }),
                  category: categoryInfo,
                  amount: z.number(),
                }),
              ),
              totals: z.array(z.object({ currency: z.string(), inflow: z.number(), outflow: z.number(), net: z.number() })),
              convertedTotal: z
                .object({
                  currency: z.string(),
                  inflow: z.number(),
                  outflow: z.number(),
                  net: z.number(),
                  ratesUpdatedAt: z.string().nullable(),
                  ratesStale: z.boolean(),
                })
                .nullable(),
            }),
          },
        },
      },
      async (request) => {
        assertPeriod(request.query.from, request.query.to);
        return reports.cashFlow(requireAuth(request).userId, request.query);
      },
    );

    app.get(
      "/by-category",
      {
        schema: {
          tags: ["Relatórios"],
          summary: "Totais por categoria no período (gráfico de pizza)",
          security: secured,
          querystring: z.object({ from: isoDate, to: isoDate, type: z.enum(["income", "expense"]).default("expense") }),
          response: {
            200: z.object({
              from: z.string(),
              to: z.string(),
              type: z.enum(["income", "expense"]),
              primaryCurrency: z.string(),
              convertedTotal: z.number().nullable(),
              categories: z.array(
                z.object({
                  category: categoryInfo,
                  count: z.number(),
                  totals: z.array(z.object({ currency: z.string(), total: z.number() })),
                  convertedTotal: z.number().nullable(),
                  share: z.number().nullable().meta({ description: "Percentual do total" }),
                }),
              ),
            }),
          },
        },
      },
      async (request) => {
        assertPeriod(request.query.from, request.query.to);
        return reports.byCategory(requireAuth(request).userId, request.query);
      },
    );

    app.get(
      "/monthly",
      {
        schema: {
          tags: ["Relatórios"],
          summary: "Receitas e despesas por mês (gráfico de evolução)",
          security: secured,
          querystring: z.object({ fromMonth: isoMonth, toMonth: isoMonth }),
          response: {
            200: z.object({
              fromMonth: z.string(),
              toMonth: z.string(),
              primaryCurrency: z.string(),
              months: z.array(
                z.object({
                  month: z.string(),
                  totals: z.array(
                    z.object({ currency: z.string(), income: z.number(), expense: z.number(), net: z.number() }),
                  ),
                  converted: z.object({ income: z.number(), expense: z.number(), net: z.number() }).nullable(),
                }),
              ),
            }),
          },
        },
      },
      async (request) => reports.monthly(requireAuth(request).userId, request.query),
    );
  };
}
