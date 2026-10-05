import type { ReactNode } from "react";
import { Animated, KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from "react-native";
import { Icon, type IconName } from "../icons/icon";
import { radii } from "../theme/metrics";
import { useTheme } from "../theme/theme-provider";
import { usePresence } from "./sheet";
import { Text } from "./text";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: IconName;
  /** Texto ou conteúdo do corpo. */
  children?: ReactNode;
  /** Botões de ação, alinhados à direita. */
  actions: ReactNode;
  testID?: string;
}

/** Diálogo básico do Material 3 (ícone, título centralizado, corpo e ações). */
export function Dialog({ open, onClose, title, icon, children, actions, testID }: DialogProps) {
  const { colors } = useTheme();
  const { mounted, progress } = usePresence(open, 400, 150);
  if (!mounted) return null;

  const scale = progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.4, 1.04, 1] });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.fill} testID={testID}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: progress }]}>
          <Pressable style={styles.fill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" />
        </Animated.View>
        <KeyboardAvoidingView behavior="padding" style={styles.root} pointerEvents="box-none">
          <Animated.View
            accessibilityViewIsModal
            accessibilityRole="alert"
            style={[styles.card, { backgroundColor: colors.surface, opacity: progress, transform: [{ scale }] }]}
          >
            {icon ? (
              <View style={styles.icon}>
                <Icon name={icon} size={28} color="primary" />
              </View>
            ) : null}
            <Text variant="titleLarge" align="center" accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {typeof children === "string" ? (
              <Text color="onSurfaceVariant" align="center" style={styles.body}>
                {children}
              </Text>
            ) : children ? (
              <View style={styles.body}>{children}</View>
            ) : null}
            <View style={styles.actions}>{actions}</View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  fill: { flex: 1 },
  card: { width: "100%", maxWidth: 400, borderRadius: radii.xxl, padding: 24 },
  icon: { alignItems: "center", marginBottom: 12 },
  title: { marginBottom: 8 },
  body: { marginBottom: 20 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
});
