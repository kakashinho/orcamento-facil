// Exportação agregadora do schema TARGET. drizzle.config.ts aponta para este
// arquivo (./src/db/schema.ts); cada fatia de schema é reexportada a partir daqui.
// TASK-006 adiciona o núcleo Auth; fatias seguintes (007/008) acrescentam novas
// reexportações sem quebrar este ponto de entrada.
export * from "./schema/auth.js";
export * from "./schema/finance.js";
