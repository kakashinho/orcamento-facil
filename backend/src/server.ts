import "dotenv/config";
import { buildApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { createContainer } from "./container.js";

const config = loadConfig();
const container = createContainer(config);
const app = await buildApp(container);

let shuttingDown = false;
let stopHousekeeping = (): void => undefined;
let stopJobs = (): void => undefined;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Encerrando o servidor");
  try {
    stopHousekeeping();
    stopJobs();
    await app.close();
    await container.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, "Falha no encerramento");
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.host, port: config.port });
  // Limpeza periódica de dados vencidos (sessões, links de recuperação, histórico e logs antigos).
  stopHousekeeping = container.services.housekeeping.schedule(config.housekeeping.intervalMinutes);
  // Tarefas de negócio (ocorrências de séries, lembretes, reenvio de push), com trava entre instâncias.
  stopJobs = container.services.jobs.schedule(config.jobs.intervalMinutes);
} catch (error) {
  app.log.fatal({ err: error }, "Não foi possível iniciar o servidor");
  await container.close();
  process.exit(1);
}
