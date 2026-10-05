import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { elevation, radii } from "../theme/metrics";
import { useTheme } from "../theme/theme-provider";
import { IconButton } from "./icon-button";
import { emphasizedEasing } from "./sheet";
import { Text } from "./text";

export interface SnackbarProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
}

/** Snackbar Material 3 (superfície inversa) com ação opcional — usado no "Desfazer" (R49). */
export function Snackbar({ message, actionLabel, onAction, onClose }: SnackbarProps) {
  const { colors } = useTheme();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      easing: emphasizedEasing,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.bar, { backgroundColor: colors.inverseSurface, opacity: progress, transform: [{ translateY }] }]}
    >
      <Text color={colors.inverseOnSurface} style={styles.message}>
        {message}
      </Text>
      {actionLabel ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} hitSlop={8}>
          <Text weight="medium" color={colors.inversePrimary} style={styles.action}>
            {actionLabel.toUpperCase()}
          </Text>
        </Pressable>
      ) : null}
      {onClose ? (
        <View>
          <IconButton
            name="close"
            size={32}
            color={colors.inverseOnSurface}
            onPress={onClose}
            accessibilityLabel="Fechar aviso"
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radii.xxl,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
    minHeight: 48,
    elevation: elevation.level3,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  message: { flex: 1 },
  action: { letterSpacing: 0.5, paddingHorizontal: 4 },
});
