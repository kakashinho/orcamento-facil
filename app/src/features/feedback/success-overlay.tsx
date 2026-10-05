import { useEffect, useState } from "react";
import { Animated, Easing, Modal, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { emphasizedEasing, radii, Text, useTheme } from "@/ui";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK_LENGTH = 48;

/**
 * Confirmação animada após registrar uma transação ou transferência (R77):
 * o cartão "salta" (escala 0,4 → 1,08 → 1) e o check é desenhado, como no protótipo.
 */
export function SuccessOverlay({
  message,
  subtitle = "Saldos atualizados",
  onDone,
  durationMs = 1500,
}: {
  message: string;
  subtitle?: string;
  onDone: () => void;
  durationMs?: number;
}) {
  const { colors } = useTheme();
  const [pop] = useState(() => new Animated.Value(0));
  const [draw] = useState(() => new Animated.Value(CHECK_LENGTH));
  const [scrim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(scrim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(pop, { toValue: 1, duration: 400, easing: emphasizedEasing, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(150),
        Animated.timing(draw, { toValue: 0, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      ]),
    ]);
    animation.start();
    const timer = setTimeout(onDone, durationMs);
    return () => {
      animation.stop();
      clearTimeout(timer);
    };
  }, [draw, durationMs, onDone, pop, scrim]);

  const scale = pop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.4, 1.08, 1] });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onDone}
    >
      <Animated.View style={[styles.scrim, { opacity: scrim }]}>
        <Animated.View
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          accessibilityLabel={`${message}. ${subtitle}`}
          style={[styles.card, { backgroundColor: colors.surface, opacity: pop, transform: [{ scale }] }]}
        >
          <View style={[styles.circle, { backgroundColor: colors.primary }]}>
            <Svg width={44} height={44} viewBox="0 0 24 24" fill="none">
              <AnimatedPath
                d="M4 12.5l5 5L20 6.5"
                stroke={colors.onPrimary}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={CHECK_LENGTH}
                strokeDashoffset={draw}
              />
            </Svg>
          </View>
          <Text variant="title" weight="medium" style={styles.message}>
            {message}!
          </Text>
          <Text variant="label" color="onSurfaceVariant">
            {subtitle}
          </Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.3)" },
  card: { borderRadius: radii.xxl, paddingHorizontal: 40, paddingVertical: 32, alignItems: "center" },
  circle: { width: 80, height: 80, borderRadius: radii.full, alignItems: "center", justifyContent: "center" },
  message: { marginTop: 16 },
});
