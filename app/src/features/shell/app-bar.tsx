import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { session } from "@/data/client";
import { Button, Dialog, Icon, IconButton, radii, Text, useResponsiveLayout, useTheme } from "@/ui";
import { useThemeControls } from "../preferences/use-theme-toggle";

/** Barra superior: marca, alternância de tema (R42) e saída da conta. */
export function AppBar() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const { scheme, toggle } = useThemeControls();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const logout = async () => {
    setLeaving(true);
    await session.signOut("logout");
  };

  return (
    <View style={[styles.bar, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={[styles.row, { paddingHorizontal: layout.isWide ? 24 : 16 }]}>
        <View style={styles.brand}>
          {!layout.isWide ? (
            <View style={[styles.logo, { backgroundColor: colors.primary }]}>
              <Icon name="savings" size={18} color="onPrimary" fill />
            </View>
          ) : null}
          <Text weight="medium" style={styles.title} accessibilityRole="header">
            Orçamento Fácil
          </Text>
        </View>
        <View style={styles.actions}>
          <IconButton
            name={scheme === "dark" ? "light_mode" : "dark_mode"}
            onPress={toggle}
            accessibilityLabel={scheme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
          />
          <IconButton name="logout" onPress={() => setConfirmLogout(true)} accessibilityLabel="Sair da conta" />
        </View>
      </View>
      <Dialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title="Sair da conta?"
        icon="logout"
        actions={
          <>
            <Button variant="text" label="Cancelar" onPress={() => setConfirmLogout(false)} />
            <Button label="Sair" onPress={logout} loading={leaving} />
          </>
        }
      >
        Você precisará entrar novamente com sua senha ou biometria.
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {},
  row: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 32, height: 32, borderRadius: radii.full, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 15 },
  actions: { flexDirection: "row", alignItems: "center" },
});
