import { installGlobalErrorHandler } from "./global-error-handler";
import { createLogger, redact } from "./logger";

describe("logger (R85)", () => {
  it("mascara senhas, tokens e assinaturas, inclusive aninhados", () => {
    expect(
      redact({ email: "a@b.com", password: "x", nested: { refreshToken: "t", list: [{ signature: "s", ok: 1 }] } }),
    ).toEqual({
      email: "a@b.com",
      password: "[redacted]",
      nested: { refreshToken: "[redacted]", list: [{ signature: "[redacted]", ok: 1 }] },
    });
  });

  it("registra evento, contexto e erro, respeitando o nível mínimo", () => {
    const sink = jest.fn();
    const logger = createLogger({ minLevel: "info", sink, now: () => new Date("2026-10-04T12:00:00Z") });
    logger.debug("ignorado");
    logger.info("auth.signed_in", { userId: "1", accessToken: "segredo" });
    logger.error("http.server_error", new Error("boom"), { status: 500 });
    const entries = logger.entries();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      level: "info",
      event: "auth.signed_in",
      timestamp: "2026-10-04T12:00:00.000Z",
      context: { userId: "1", accessToken: "[redacted]" },
    });
    expect(entries[1].error).toMatchObject({ name: "Error", message: "boom" });
    expect(sink).toHaveBeenCalledTimes(2);
  });

  it("guarda só os registros mais recentes e nunca falha por causa do destino", () => {
    const logger = createLogger({
      capacity: 2,
      sink: () => {
        throw new Error("sink quebrado");
      },
    });
    logger.info("a");
    logger.info("b");
    logger.info("c");
    expect(logger.entries().map((e) => e.event)).toEqual(["b", "c"]);
  });

  it("registra erros não tratados e repassa ao tratador padrão", () => {
    const logger = createLogger();
    const previous = jest.fn();
    let current: (error: unknown, fatal?: boolean) => void = previous;
    const utils = { getGlobalHandler: () => current, setGlobalHandler: (h: typeof current) => (current = h) };
    const uninstall = installGlobalErrorHandler(logger, utils);
    current(new Error("falhou"), true);
    expect(logger.entries()[0]).toMatchObject({ level: "error", event: "app.fatal_error", context: { fatal: true } });
    expect(previous).toHaveBeenCalled();
    uninstall();
    expect(current).toBe(previous);
  });
});
