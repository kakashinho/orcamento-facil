import { useEffect, useState } from "react";

/** Valor que só muda depois de `delayMs` sem alterações (busca e sugestões sem requisições a cada tecla — R86). */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
