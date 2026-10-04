// Lista todas as rotas da API com método, caminho, se exige login e descrição.
// Uso: npm run routes   (lê o .env; não precisa do banco rodando)
import "dotenv/config";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";
import { createContainer } from "../src/container.js";

interface Operation {
  summary?: string;
  tags?: string[];
  security?: unknown[];
}

const container = createContainer(loadConfig({ ...process.env, LOG_LEVEL: "silent" }));
const app = await buildApp(container);
await app.ready();

const spec = app.swagger() as { paths: Record<string, Record<string, Operation>> };
const byTag = new Map<string, string[]>();
for (const [path, operations] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(operations)) {
    const tag = operation.tags?.[0] ?? "Outros";
    const lock = operation.security ? "🔒" : "  ";
    const line = `  ${method.toUpperCase().padEnd(6)} ${lock} ${path.padEnd(40)} ${operation.summary ?? ""}`;
    byTag.set(tag, [...(byTag.get(tag) ?? []), line]);
  }
}

for (const [tag, lines] of byTag) {
  console.log(`\n${tag}`);
  for (const line of lines) console.log(line);
}
console.log("\n🔒 = exige header Authorization: Bearer <accessToken>");

await app.close();
await container.close();
