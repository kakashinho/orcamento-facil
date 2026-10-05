import type { BottomTabBarProps } from "expo-router/tabs";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, radii, Text, useTheme, withAlpha, type IconName } from "@/ui";

/** Destinos principais, na ordem do protótipo. */
export const DESTINATIONS: { name: string; label: string; icon: IconName }[] = [
  { name: "index", label: "Início", icon: "home" },
  { name: "transactions", label: "Transações", icon: "receipt_long" },
  { name: "wallets", label: "Carteiras", icon: "account_balance_wallet" },
  { name: "preferences", label: "Preferências", icon: "settings" },
];

export const NAVIGATION_BAR_HEIGHT = 80;
/** Folga mínima sob a barra: o Android nem sempre informa a altura dos botões do sistema. */
export const MIN_BOTTOM_INSET = 16;

/**
 * Navegação principal Material 3 (R80/R82): barra inferior em celulares e trilho lateral
 * (navigation rail) em tablets e telas largas.
 */
export function AppNavigation({ state, navigation, wide }: BottomTabBarProps & { wide: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, MIN_BOTTOM_INSET);

  const items = DESTINATIONS.map((destination) => {
    const index = state.routes.findIndex((r) => r.name === destination.name);
    const route = state.routes[index];
    const active = state.index === index;
    const onPress = () => {
      if (!route) return;
      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!active && !event.defaultPrevented) navigation.navigate(route.name);
    };
    return (
      <Pressable
        key={destination.name}
        accessibilityRole="tab"
        accessibilityLabel={destination.label}
        accessibilityState={{ selected: active }}
        onPress={onPress}
        style={wide ? styles.railItem : styles.barItem}
      >
        <View style={[styles.indicator, wide ? styles.indicatorRail : styles.indicatorBar]}>
          {/* Camada de fundo fixa, só a opacidade alterna: trocar a cor de fundo de uma view
              arredondada fazia o Android perder o raio ao mudar de aba. */}
          <View
            pointerEvents="none"
            style={[styles.indicatorFill, { backgroundColor: colors.secondaryContainer, opacity: active ? 1 : 0 }]}
          />
          <Icon
            name={destination.icon}
            size={22}
            fill={active}
            color={active ? "onSecondaryContainer" : "onSurfaceVariant"}
          />
        </View>
        <Text
          variant="caption"
          weight={active ? "medium" : "regular"}
          color={active ? "onSurface" : "onSurfaceVariant"}
        >
          {destination.label}
        </Text>
      </Pressable>
    );
  });

  if (wide) {
    return (
      <View
        accessibilityRole="tablist"
        testID="navigation-rail"
        style={[
          styles.rail,
          {
            paddingTop: insets.top + 16,
            paddingLeft: insets.left,
            backgroundColor: withAlpha(colors.surfaceVariant, 0.6),
            borderRightColor: withAlpha(colors.outlineVariant, 0.4),
          },
        ]}
      >
        <View style={[styles.railLogo, { backgroundColor: colors.primary }]}>
          <Icon name="savings" size={22} color="onPrimary" fill />
        </View>
        {items}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="tablist"
      testID="navigation-bar"
      style={[
        styles.bar,
        {
          height: NAVIGATION_BAR_HEIGHT + bottomInset,
          paddingBottom: bottomInset,
          backgroundColor: withAlpha(colors.surfaceVariant, 0.6),
          borderTopColor: withAlpha(colors.outlineVariant, 0.4),
        },
      ]}
    >
      {items}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "stretch", borderTopWidth: 1, paddingHorizontal: 8 },
  barItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingTop: 8 },
  rail: { width: 88, alignItems: "center", gap: 12, borderRightWidth: 1 },
  railLogo: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  railItem: { alignItems: "center", gap: 4, paddingVertical: 4 },
  indicator: { alignItems: "center", justifyContent: "center" },
  indicatorFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: 16 },
  indicatorBar: { width: 64, height: 32 },
  indicatorRail: { width: 56, height: 32 },
});
