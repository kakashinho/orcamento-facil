import { normalizeText, tokenize } from "../../shared/text.js";

/**
 * Sugestão de categoria por correspondência de palavras-chave (R44).
 * Três fontes de evidência, somadas por categoria:
 *  1. dicionário de palavras-chave das categorias predefinidas;
 *  2. nome de categorias personalizadas do usuário presente na descrição;
 *  3. histórico do usuário: palavras de descrições já categorizadas por ele
 *     (o sistema "aprende" com as escolhas anteriores).
 */

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  food: [
    "mercado", "supermercado", "restaurante", "lanche", "lanchonete", "almoco", "jantar", "cafe da manha",
    "padaria", "ifood", "rappi", "pizza", "pizzaria", "hamburguer", "burger", "acougue", "feira", "hortifruti",
    "sorvete", "comida", "refeicao", "delivery", "marmita", "doceria", "atacadao", "assai", "carrefour",
    "pao de acucar", "mcdonalds", "subway", "sushi", "churrascaria", "quitanda",
  ],
  transport: [
    "uber", "99", "taxi", "gasolina", "combustivel", "etanol", "alcool", "diesel", "onibus", "metro", "trem",
    "estacionamento", "pedagio", "passagem", "bilhete unico", "oficina", "mecanico", "ipva", "licenciamento",
    "posto", "shell", "ipiranga", "petrobras", "pneu", "revisao do carro", "lavagem", "cabify", "moto",
  ],
  leisure: [
    "cinema", "netflix", "spotify", "show", "teatro", "viagem", "hotel", "pousada", "passeio", "jogo", "game",
    "steam", "playstation", "xbox", "parque", "festa", "balada", "bar", "cerveja", "chopp", "ingresso", "museu",
    "clube", "disney", "prime video", "hbo", "max", "globoplay", "youtube premium", "airbnb", "boliche",
  ],
  housing: [
    "aluguel", "condominio", "luz", "energia", "conta de luz", "agua", "conta de agua", "internet", "iptu", "gas",
    "reforma", "moveis", "faxina", "diarista", "limpeza", "enel", "sabesp", "copel", "cemig", "light",
    "eletropaulo", "vivo fibra", "claro net", "telefone fixo", "material de construcao", "manutencao da casa",
  ],
  health: [
    "farmacia", "drogaria", "remedio", "medicamento", "medico", "consulta", "exame", "hospital", "dentista",
    "plano de saude", "unimed", "amil", "bradesco saude", "sulamerica", "academia", "psicologo", "terapia",
    "fisioterapia", "vacina", "laboratorio", "oculos", "otica", "nutricionista", "drogasil", "pague menos",
  ],
  education: [
    "escola", "faculdade", "universidade", "curso", "livro", "livraria", "mensalidade escolar", "material escolar",
    "udemy", "alura", "apostila", "matricula", "idiomas", "ingles",
  ],
  salary: [
    "salario", "pagamento", "holerite", "pro labore", "13o", "decimo terceiro", "ferias", "bonus", "plr",
    "freela", "freelance", "comissao", "adiantamento salarial", "vale alimentacao",
  ],
};

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "no", "na", "nos", "nas", "em", "com", "para", "pra", "pro", "e", "o", "a",
  "os", "as", "um", "uma", "uns", "umas", "por", "ao", "aos", "r", "reais", "real", "conta", "compra",
]);

export interface SuggestableCategory {
  id: string;
  name: string;
  systemKey: string | null;
}

export interface CategorizedSample {
  description: string;
  categoryId: string;
}

export interface CategorySuggestion {
  categoryId: string;
  name: string;
  confidence: number;
  reasons: string[];
}

const KEYWORD_WEIGHT = 1;
const CUSTOM_NAME_WEIGHT = 1.5;
const HISTORY_WEIGHT = 2;

function containsPhrase(normalizedText: string, tokens: Set<string>, phrase: string): boolean {
  return phrase.includes(" ") ? ` ${normalizedText} `.includes(` ${phrase} `) : tokens.has(phrase);
}

export function suggestCategories(
  description: string,
  categories: SuggestableCategory[],
  history: CategorizedSample[],
  limit = 3,
): CategorySuggestion[] {
  const tokenList = tokenize(description);
  const tokens = new Set(tokenList);
  const normalized = tokenList.join(" ");
  if (tokens.size === 0) return [];

  const scores = new Map<string, { score: number; reasons: Set<string> }>();
  const add = (categoryId: string, value: number, reason: string) => {
    const entry = scores.get(categoryId) ?? { score: 0, reasons: new Set<string>() };
    entry.score += value;
    entry.reasons.add(reason);
    scores.set(categoryId, entry);
  };

  for (const category of categories) {
    if (category.systemKey) {
      for (const keyword of CATEGORY_KEYWORDS[category.systemKey] ?? []) {
        if (containsPhrase(normalized, tokens, keyword)) add(category.id, KEYWORD_WEIGHT, `palavra-chave "${keyword}"`);
      }
    } else {
      const name = tokenize(category.name).join(" ");
      if (name.length > 0 && containsPhrase(normalized, tokens, name)) {
        add(category.id, CUSTOM_NAME_WEIGHT, "nome da categoria na descrição");
      }
    }
  }

  // Aprendizado com o histórico: P(categoria | palavra) para cada palavra significativa.
  const usable = new Set(categories.map((category) => category.id));
  const tokenStats = new Map<string, Map<string, number>>();
  for (const sample of history) {
    if (!usable.has(sample.categoryId)) continue;
    for (const token of new Set(tokenize(sample.description))) {
      if (STOPWORDS.has(token) || /^\d+$/.test(token)) continue;
      const perCategory = tokenStats.get(token) ?? new Map<string, number>();
      perCategory.set(sample.categoryId, (perCategory.get(sample.categoryId) ?? 0) + 1);
      tokenStats.set(token, perCategory);
    }
  }
  for (const token of tokens) {
    if (STOPWORDS.has(token)) continue;
    const perCategory = tokenStats.get(token);
    if (!perCategory) continue;
    const total = [...perCategory.values()].reduce((sum, value) => sum + value, 0);
    for (const [categoryId, hits] of perCategory) {
      add(categoryId, HISTORY_WEIGHT * (hits / total), `histórico: "${token}"`);
    }
  }

  const byId = new Map(categories.map((category) => [category.id, category]));
  const ranked = [...scores.entries()]
    .filter(([categoryId]) => byId.has(categoryId))
    .sort((a, b) => b[1].score - a[1].score);
  const totalScore = ranked.reduce((sum, [, entry]) => sum + entry.score, 0);

  return ranked.slice(0, limit).map(([categoryId, entry]) => ({
    categoryId,
    name: byId.get(categoryId)!.name,
    // Confiança: participação no total, atenuada quando há pouca evidência.
    confidence: Number(((entry.score / totalScore) * Math.min(1, entry.score / 2)).toFixed(2)),
    reasons: [...entry.reasons].slice(0, 5),
  }));
}

export { normalizeText };
