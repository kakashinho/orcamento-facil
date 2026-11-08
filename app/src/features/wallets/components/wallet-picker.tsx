import { Pressable, StyleSheet, View } from "react-native";
import type { Wallet } from "@/data/api/types";
import { walletTypeMeta } from "@/domain/catalog";
import { Icon, radii, Text, useTheme, withAlpha } from "@/ui";

/** Ícone colorido da carteira (cor e ícone vêm do tipo — R53). */
export function WalletAvatar({
  wallet,
  size = 24,
  shape = "rounded",
}: {
  wallet: Pick<Wallet, "type">;
  size?: number;
  shape?: "rounded" | "circle";
}) {
  const meta = walletTypeMeta(wallet.type);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: shape === "circle" ? size / 2 : Math.round(size / 3),
        backgroundColor: meta.color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name={meta.icon} size={Math.round(size * 0.6)} color="onAccent" />
    </View>
  );
}

/**
 * Seleção de carteira (formulários de transação e transferência). As opções quebram para a linha de baixo
 * em vez de rolar para o lado: a rolagem horizontal dentro da folha era difícil de acionar no Android.
 */
export function WalletPicker({
  label,
  wallets,
  value,
  onChange,
  exclude,
}: {
  label: string;
  wallets: Wallet[];
  value: string | null;
  onChange: (id: string) => void;
  exclude?: string | null;
}) {
  const { colors } = useTheme();
  return (
    <View>
      <Text variant="caption" weight="medium" color="onSurfaceVariant" style={styles.label}>
        {label}
      </Text>
      <View style={styles.list}>
        {wallets
          .filter((w) => w.id !== exclude)
          .map((wallet) => {
            const selected = wallet.id === value;
            return (
              <Pressable
                key={wallet.id}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${wallet.name} (${wallet.currency})`}
                accessibilityState={{ selected }}
                onPress={() => onChange(wallet.id)}
                android_ripple={{ color: withAlpha(colors.onSurface, 0.08) }}
                style={[
                  styles.item,
                  selected
                    ? { borderColor: colors.primary, backgroundColor: withAlpha(colors.primaryContainer, 0.4) }
                    : { borderColor: colors.outlineVariant },
                ]}
              >
                <WalletAvatar wallet={wallet} />
                <Text variant="bodySmall">{wallet.name}</Text>
                <Text variant="caption" color="onSurfaceVariant">
                  {wallet.currency}
                </Text>
              </Pressable>
            );
          })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { paddingHorizontal: 4 },
  list: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 8 },
  item: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: radii.xxl,
    paddingHorizontal: 12,
    overflow: "hidden",
  },
});
