import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../icons/icon";
import { withAlpha } from "../theme/colors";
import { radii } from "../theme/metrics";
import { useTheme } from "../theme/theme-provider";
import { Text } from "./text";

/** Bloco pulsante exibido enquanto os dados carregam (R83: a tela aparece já com o esqueleto). */
export function Skeleton({ style, tone }: { style?: StyleProp<ViewStyle>; tone?: string }) {
  const { colors } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      accessibilityLabel="Carregando"
      style={[{ backgroundColor: tone ?? colors.outlineVariant, borderRadius: radii.lg, opacity }, style]}
    />
  );
}

/** Estado vazio com ícone, título, descrição e ação opcional. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceVariant }]}>
        <Icon name={icon} size={36} />
      </View>
      <Text variant="title" weight="medium" align="center" style={styles.emptyTitle}>
        {title}
      </Text>
      <Text color="onSurfaceVariant" align="center" style={styles.emptyText}>
        {description}
      </Text>
      {action}
    </View>
  );
}

export type BannerTone = "info" | "tertiary" | "error" | "primary";

/** Aviso em linha (manutenção, sessão expirada, revisão da voz...). */
export function Banner({
  icon,
  tone = "info",
  children,
  style,
  testID,
}: {
  icon: IconName;
  tone?: BannerTone;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useTheme();
  const palette = {
    info: { bg: withAlpha(colors.surfaceVariant, 0.6), fg: colors.onSurfaceVariant },
    tertiary: { bg: colors.tertiaryContainer, fg: colors.onTertiaryContainer },
    error: { bg: colors.errorContainer, fg: colors.onErrorContainer },
    primary: { bg: colors.primaryContainer, fg: colors.onPrimaryContainer },
  }[tone];
  return (
    <View
      testID={testID}
      accessibilityRole={tone === "error" ? "alert" : undefined}
      style={[styles.banner, { backgroundColor: palette.bg }, style]}
    >
      <Icon name={icon} size={18} color={palette.fg} />
      <View style={styles.bannerBody}>
        {typeof children === "string" ? (
          <Text variant="bodySmall" color={palette.fg}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

export function Spinner({ color, size = "small" }: { color?: string; size?: "small" | "large" }) {
  const { colors } = useTheme();
  return <ActivityIndicator accessibilityLabel="Carregando" color={color ?? colors.primary} size={size} />;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      style={[{ height: StyleSheet.hairlineWidth * 2, backgroundColor: withAlpha(colors.outlineVariant, 0.6) }, style]}
    />
  );
}

/** Barra horizontal proporcional — usada nos gráficos de categorias e meses. */
export function ProgressBar({
  value,
  color,
  track,
  height = 8,
}: {
  /** Fração de 0 a 1. */
  value: number;
  color?: string;
  track?: string;
  height?: number;
}) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height, backgroundColor: track ?? colors.surfaceVariant }]}
    >
      <View style={[styles.bar, { width: `${clamped * 100}%`, backgroundColor: color ?? colors.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 64, paddingHorizontal: 32 },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { marginBottom: 4 },
  emptyText: { maxWidth: 260, marginBottom: 16 },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: radii.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bannerBody: { flex: 1 },
  track: { width: "100%", borderRadius: radii.full, overflow: "hidden" },
  bar: { height: "100%", borderRadius: radii.full },
});
