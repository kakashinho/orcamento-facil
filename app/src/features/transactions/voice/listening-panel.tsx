import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Button, Icon, radii, Text, useTheme, withAlpha } from "@/ui";

const BARS = [0, 1, 2, 3, 4, 5, 6];

/** Tela "Ouvindo…" do protótipo: microfone pulsando e ondas animadas (R65). */
export function ListeningPanel({
  transcript,
  onStop,
  onCancel,
}: {
  transcript: string;
  onStop: () => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [pulse] = useState(() => new Animated.Value(0));
  const [waves] = useState(() => BARS.map(() => new Animated.Value(0.4)));

  useEffect(() => {
    const ping = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    const bars = Animated.parallel(
      waves.map((value, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 90),
            Animated.timing(value, {
              toValue: 1,
              duration: 400,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(value, {
              toValue: 0.4,
              duration: 400,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: true,
            }),
          ]),
        ),
      ),
    );
    ping.start();
    bars.start();
    return () => {
      ping.stop();
      bars.stop();
    };
  }, [pulse, waves]);

  return (
    <View style={styles.root} accessibilityLiveRegion="polite">
      <View style={styles.micArea}>
        <Animated.View
          style={[
            styles.ping,
            {
              backgroundColor: withAlpha(colors.primary, 0.2),
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
            },
          ]}
        />
        <View style={[styles.mic, { backgroundColor: colors.primary }]}>
          <Icon name="mic" size={36} color="onPrimary" fill />
        </View>
      </View>
      <Text color="onSurfaceVariant" align="center">
        Ouvindo… fale o valor e a descrição
      </Text>
      <Text variant="caption" color="onSurfaceVariant" align="center">
        Ex.: “gastei 35,90 no mercado ontem”
      </Text>
      <View style={styles.waves}>
        {waves.map((value, i) => (
          <Animated.View
            key={i}
            style={[styles.bar, { backgroundColor: colors.primary, transform: [{ scaleY: value }] }]}
          />
        ))}
      </View>
      {transcript ? (
        <Text weight="medium" align="center" style={styles.transcript}>
          “{transcript}”
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button variant="text" label="Cancelar" onPress={onCancel} />
        <Button variant="tonal" label="Concluir" icon="check" onPress={onStop} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", paddingVertical: 32, gap: 8 },
  micArea: { width: 96, height: 96, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  ping: { position: "absolute", width: 96, height: 96, borderRadius: radii.full },
  mic: { width: 80, height: 80, borderRadius: radii.full, alignItems: "center", justifyContent: "center" },
  waves: { flexDirection: "row", alignItems: "center", gap: 4, height: 32, marginTop: 8 },
  bar: { width: 6, height: 32, borderRadius: radii.full },
  transcript: { marginTop: 8, paddingHorizontal: 16 },
  actions: { flexDirection: "row", gap: 8, marginTop: 16 },
});
