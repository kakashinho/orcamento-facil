import type { StyleProp, ViewStyle } from "react-native";
import { useMaintenance } from "@/data/system/maintenance-store";
import { Banner, Text } from "@/ui";

/**
 * Aviso de manutenção (R72): o usuário continua consultando, mas operações críticas
 * (registros, edições e transferências) ficam bloqueadas até o fim da atualização.
 */
export function MaintenanceBanner({ style, compact }: { style?: StyleProp<ViewStyle>; compact?: boolean }) {
  const { active, message } = useMaintenance();
  if (!active) return null;
  return (
    <Banner icon="engineering" tone="error" style={style} testID="maintenance-banner">
      {compact ? (
        <Text variant="bodySmall" color="onErrorContainer">
          Operações de registro estão suspensas durante a manutenção.
        </Text>
      ) : (
        <Text variant="bodySmall" color="onErrorContainer">
          <Text variant="bodySmall" weight="bold" color="onErrorContainer">
            Manutenção em andamento.{" "}
          </Text>
          {message}
        </Text>
      )}
    </Banner>
  );
}
