import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii } from "../theme/metrics";
import { useTheme } from "../theme/theme-provider";
import { Text } from "./text";

const InsideSheetContext = createContext(false);

/**
 * Indica que o componente está dentro de uma folha. Modais não devem ser aninhados (o Android
 * não apresenta um Modal dentro de outro): componentes que abririam outra folha mostram o
 * conteúdo no lugar.
 */
export function useInsideSheet(): boolean {
  return useContext(InsideSheetContext);
}

/** Curva do protótipo (cubic-bezier(0.2, 0.8, 0.2, 1)). */
export const emphasizedEasing = Easing.bezier(0.2, 0.8, 0.2, 1);

/**
 * Mantém o conteúdo montado durante a animação de saída: `open` controla a intenção,
 * `mounted` só fica falso quando a animação termina.
 */
export function usePresence(open: boolean, enterMs: number, exitMs: number) {
  const [progress] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(open);
  const [previousOpen, setPreviousOpen] = useState(open);
  // Ao abrir, monta na mesma renderização (padrão "valor da renderização anterior" do React).
  if (open !== previousOpen) {
    setPreviousOpen(open);
    if (open) setMounted(true);
  }

  // Driver JS: dentro de um Modal recém-criado, a animação pelo driver nativo pode não chegar
  // às views (o diálogo ficava invisível no Android). As animações são curtas; o custo é mínimo.
  // Efeito de layout: a limpeza roda no commit, então um aviso de "terminou" atrasado de uma
  // saída antiga nunca desmonta algo reaberto.
  useLayoutEffect(() => {
    if (open) {
      const enter = Animated.timing(progress, {
        toValue: 1,
        duration: enterMs,
        easing: emphasizedEasing,
        useNativeDriver: false,
      });
      enter.start();
      return () => enter.stop();
    }
    if (!mounted) return; // fechado e desmontado: nada a animar
    let cancelled = false;
    const exit = Animated.timing(progress, {
      toValue: 0,
      duration: exitMs,
      easing: Easing.in(Easing.quad),
      useNativeDriver: false,
    });
    exit.start(({ finished }) => {
      if (finished && !cancelled) setMounted(false);
    });
    return () => {
      cancelled = true;
      exit.stop();
    };
  }, [open, mounted, enterMs, exitMs, progress]);

  return { mounted, progress };
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  testID?: string;
}

/**
 * Folha inferior modal (bottom sheet) do Material 3, com puxador e título fixos.
 * Em telas largas fica centralizada com no máximo 640dp (R82).
 */
export function Sheet({ open, onClose, title, children, testID }: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { mounted, progress } = usePresence(open, 340, 200);

  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root} testID={testID}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: progress }]}>
          <Pressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" />
        </Animated.View>
        <KeyboardAvoidingView behavior="padding" style={styles.avoider} pointerEvents="box-none">
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.panel,
              // Percentual do espaço acima do teclado (o KeyboardAvoidingView encolhe a área útil).
              { backgroundColor: colors.surface, maxHeight: "92%", transform: [{ translateY }] },
            ]}
          >
            {/* Tocar no cabeçalho fecha o teclado e revela os botões da folha. */}
            <Pressable style={styles.header} onPress={Keyboard.dismiss} accessible={false}>
              <View style={[styles.handle, { backgroundColor: colors.outlineVariant }]} />
              {title ? (
                <Text variant="titleMedium" weight="medium" accessibilityRole="header" style={styles.title}>
                  {title}
                </Text>
              ) : null}
            </Pressable>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
            >
              <InsideSheetContext.Provider value>{children}</InsideSheetContext.Provider>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  avoider: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  panel: {
    width: "100%",
    maxWidth: 640,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    overflow: "hidden",
  },
  header: { paddingTop: 12, paddingBottom: 8 },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: radii.full },
  title: { paddingHorizontal: 20, paddingTop: 12 },
  content: { paddingHorizontal: 20 },
});
