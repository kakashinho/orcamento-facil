import { describe, expect, it } from "vitest";
import { DomainEvents, type FinanceChangedEvent } from "../../src/infrastructure/events/domain-events.js";
import { EventLogger, type LogEntry } from "../../src/infrastructure/logging/event-logger.js";
import { createLogger } from "../../src/infrastructure/logging/logger.js";

function setup() {
  const logged: LogEntry[] = [];
  const eventLog = new EventLogger({ insert: async (entry) => void logged.push(entry) }, createLogger("silent"));
  return { events: new DomainEvents(eventLog), eventLog, logged };
}

const event: FinanceChangedEvent = {
  type: "finance.changed",
  userId: "user-1",
  cause: "transaction.created",
  transactionId: "tx-1",
  walletIds: ["wallet-1"],
  origin: "user",
};

describe("eventos de domínio", () => {
  it("entrega o evento a cada assinante, sem esperar por eles", async () => {
    const { events } = setup();
    const received: string[] = [];
    events.subscribe("finance.changed", "a", async (e) => void received.push(`a:${e.cause}`));
    events.subscribe("finance.changed", "b", async (e) => void received.push(`b:${e.transactionId}`));

    events.publish(event);
    expect(received).toEqual([]);
    await events.idle();
    expect(received).toEqual(["a:transaction.created", "b:tx-1"]);
  });

  it("erro num assinante não chega a quem publicou e vira registro, sem afetar os outros", async () => {
    const { events, eventLog, logged } = setup();
    const received: string[] = [];
    events.subscribe("finance.changed", "quebrado", async () => {
      throw new Error("falhou");
    });
    events.subscribe("finance.changed", "ok", async () => void received.push("ok"));

    expect(() => events.publish(event)).not.toThrow();
    await events.idle();
    await eventLog.flush();
    expect(received).toEqual(["ok"]);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      level: "error",
      event: "events.handler_failed",
      userId: "user-1",
      context: { type: "finance.changed", handler: "quebrado" },
    });
  });

  it("idle() aguarda handlers lentos e os disparados por outros handlers", async () => {
    const { events } = setup();
    const order: string[] = [];
    events.subscribe("finance.changed", "lento", async (e) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(e.cause);
      if (e.cause === "transaction.created") events.publish({ ...e, cause: "undo" });
    });

    events.publish(event);
    await events.idle();
    expect(order).toEqual(["transaction.created", "undo"]);
  });

  it("sem assinantes, publicar não faz nada", async () => {
    const { events } = setup();
    events.publish(event);
    await expect(events.idle()).resolves.toBeUndefined();
  });
});
