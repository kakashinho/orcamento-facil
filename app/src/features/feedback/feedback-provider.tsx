import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Snackbar } from "@/ui";
import { SuccessOverlay } from "./success-overlay";

export interface SnackbarOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Padrão: 4 s (6 s quando há ação, como no "Desfazer"). */
  durationMs?: number;
}

interface FeedbackApi {
  showSnackbar: (options: SnackbarOptions | string) => void;
  hideSnackbar: () => void;
  /** Confirmação animada (R77). */
  celebrate: (message: string) => void;
  /** Distância do snackbar até a borda inferior (acima da barra de navegação). */
  setBottomOffset: (offset: number) => void;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

interface ActiveSnackbar extends SnackbarOptions {
  id: number;
}

/** Fornece snackbar e confirmação animada a todas as telas. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [snackbar, setSnackbar] = useState<ActiveSnackbar | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [bottomOffset, setBottomOffset] = useState(0);
  const counter = useRef(0);

  const hideSnackbar = useCallback(() => setSnackbar(null), []);

  const showSnackbar = useCallback((options: SnackbarOptions | string) => {
    const value = typeof options === "string" ? { message: options } : options;
    counter.current += 1;
    setSnackbar({ ...value, id: counter.current });
  }, []);

  useEffect(() => {
    if (!snackbar) return;
    const duration = snackbar.durationMs ?? (snackbar.actionLabel ? 6000 : 4000);
    const timer = setTimeout(() => setSnackbar((current) => (current?.id === snackbar.id ? null : current)), duration);
    return () => clearTimeout(timer);
  }, [snackbar]);

  const celebrate = useCallback((message: string) => setCelebration(message), []);
  const endCelebration = useCallback(() => setCelebration(null), []);

  const value = useMemo<FeedbackApi>(
    () => ({ showSnackbar, hideSnackbar, celebrate, setBottomOffset }),
    [showSnackbar, hideSnackbar, celebrate],
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {snackbar ? (
        <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(bottomOffset, insets.bottom) + 16 }]}>
          <View style={styles.inner}>
            <Snackbar
              key={snackbar.id}
              message={snackbar.message}
              actionLabel={snackbar.actionLabel}
              onAction={() => {
                setSnackbar(null);
                snackbar.onAction?.();
              }}
              onClose={hideSnackbar}
            />
          </View>
        </View>
      ) : null}
      {celebration ? <SuccessOverlay message={celebration} onDone={endCelebration} /> : null}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("useFeedback precisa estar dentro de <FeedbackProvider>.");
  return context;
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  inner: { width: "100%", maxWidth: 560 },
});
