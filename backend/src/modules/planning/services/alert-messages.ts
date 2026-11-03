/**
 * Textos dos alertas. Regra (ADR-S2-005): nunca levam valores em dinheiro — só nomes e
 * percentuais. O detalhe aparece quando o usuário abre o orçamento, a meta ou a carteira.
 */
export interface AlertText {
  title: string;
  body: string;
}

export const alertMessages = {
  budgetWarning: (category: string): AlertText => ({
    title: "Orçamento quase no limite",
    body: `${category} chegou a 80% do orçamento do mês.`,
  }),
  budgetExceeded: (category: string): AlertText => ({
    title: "Orçamento ultrapassado",
    body: `${category} passou do orçamento do mês.`,
  }),
  dailyLimitExceeded: (category: string): AlertText => ({
    title: "Limite diário ultrapassado",
    body: `${category} passou do limite de hoje.`,
  }),
  reductionExceeded: (category: string): AlertText => ({
    title: "Meta de redução ultrapassada",
    body: `O gasto com ${category} passou da meta de redução deste mês.`,
  }),
};
