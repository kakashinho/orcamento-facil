import type { EventLogger } from "../logging/event-logger.js";

/** O que mudou no finance. Alertas e metas reagem a qualquer uma dessas causas. */
export type FinanceChangeCause =
  | "transaction.created"
  | "transaction.updated"
  | "transaction.deleted"
  | "transfer.changed"
  | "wallet.updated"
  | "undo"
  | "series.generated";

/** Publicado pelo finance (e pelo desfazer) depois que a transação de banco termina. */
export interface FinanceChangedEvent {
  type: "finance.changed";
  userId: string;
  cause: FinanceChangeCause;
  transactionId?: string;
  /** Carteiras cujo saldo pode ter mudado; vazio = reavaliar todas as carteiras do usuário. */
  walletIds: string[];
  /** `system` = gerado por tarefa agendada (ex.: ocorrência de série), não por ação do usuário. */
  origin: "user" | "system";
}

/** Publicado pelo planning quando orçamentos ou metas de redução mudam: os alertas reavaliam. */
export interface PlanningChangedEvent {
  type: "planning.changed";
  userId: string;
}

export type DomainEvent = FinanceChangedEvent | PlanningChangedEvent;
export type DomainEventType = DomainEvent["type"];
type EventOf<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;
export type DomainEventHandler<T extends DomainEventType> = (event: EventOf<T>) => Promise<void>;

interface Subscription {
  name: string;
  handler: (event: DomainEvent) => Promise<void>;
}

/**
 * Barramento de eventos em memória. Quem publica não espera os assinantes nem recebe os erros
 * deles: um alerta que falha nunca derruba o registro de uma despesa. Erros vão para o
 * `EventLogger` (sem valores financeiros). `idle()` aguarda os handlers pendentes — usado nos
 * testes e no encerramento do servidor.
 */
export class DomainEvents {
  private readonly subscriptions = new Map<DomainEventType, Subscription[]>();
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly eventLog: EventLogger) {}

  subscribe<T extends DomainEventType>(type: T, name: string, handler: DomainEventHandler<T>): void {
    const list = this.subscriptions.get(type) ?? [];
    list.push({ name, handler: handler as (event: DomainEvent) => Promise<void> });
    this.subscriptions.set(type, list);
  }

  publish(event: DomainEvent): void {
    for (const { name, handler } of this.subscriptions.get(event.type) ?? []) {
      const run = Promise.resolve()
        .then(() => handler(event))
        .catch((error: unknown) => {
          this.eventLog.record("events.handler_failed", {
            level: "error",
            userId: event.userId,
            message: error instanceof Error ? error.message : String(error),
            context: { type: event.type, handler: name },
          });
        });
      this.pending.add(run);
      void run.finally(() => this.pending.delete(run));
    }
  }

  /** Aguarda os handlers pendentes, inclusive os disparados por outros handlers. */
  async idle(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }
}
