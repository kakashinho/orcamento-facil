import { useEffect, useRef } from "react";
import { logger } from "./logger";

/**
 * Mede o tempo entre a tela abrir e os dados aparecerem (R83: meta de menos de 1 s em 4G) e
 * registra o evento `perf.screen_ready` (R85), visível no logcat do Android.
 */
export function useScreenMetric(screen: string, ready: boolean): void {
  const startedAt = useRef<number | null>(null);
  const reported = useRef(false);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (!ready || reported.current || startedAt.current === null) return;
    reported.current = true;
    const ms = Date.now() - startedAt.current;
    logger.info("perf.screen_ready", { screen, ms, withinTarget: ms < 1000 });
  }, [ready, screen]);
}
