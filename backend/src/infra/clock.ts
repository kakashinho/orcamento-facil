/** Fonte de tempo injetável — permite testar expiração de bloqueio, tokens e janela de undo. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
