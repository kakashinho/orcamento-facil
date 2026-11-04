import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { env } from "@/core/config/env";
import { useApiUrl } from "@/core/config/server-address";
import { errorMessage } from "@/core/http/api-error";
import { api, session } from "@/data/client";
import { useSetMaintenance, useUpdateProfile } from "@/data/queries/account";
import { useCurrentUser } from "@/data/session/session-store";
import { useMaintenance } from "@/data/system/maintenance-store";
import { Button, ContentContainer, Dialog, Icon, SegmentedControl, Switch, Text, useTheme } from "@/ui";
import { disableBiometric, enableBiometric } from "../auth/biometric-auth";
import { useStoredBiometric } from "../auth/use-auth";
import { useFeedback } from "../feedback/feedback-provider";
import { unregisterPushDevice } from "../notifications/push-registration";
import { CurrencyPicker } from "../wallets/components/currency-picker";
import { ChangePasswordSheet } from "./change-password-sheet";
import { NotificationsSection } from "./notifications-section";
import { Row, Section } from "./preference-rows";
import { useThemeControls } from "./use-theme-toggle";

/**
 * Preferências: tema (R42), moeda principal (R28), notificações (R18), conta e biometria (R40), dados (R52)
 * e manutenção (R72).
 */
export function PreferencesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useCurrentUser();
  const apiUrl = useApiUrl();
  const queryClient = useQueryClient();
  const { showSnackbar } = useFeedback();
  const { preference, setPreference } = useThemeControls();
  const updateProfile = useUpdateProfile();
  const maintenance = useMaintenance();
  const setMaintenance = useSetMaintenance();
  const stored = useStoredBiometric();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordKey, setPasswordKey] = useState(0);
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);

  const biometricEnabled = !!stored.data && stored.data.account === user?.email;
  const biometric = useMutation({
    mutationFn: async (enable: boolean) => {
      if (enable) {
        // enableBiometric distingue "sem módulo nativo (Expo Go)" de "sem digital cadastrada".
        await enableBiometric(user?.email ?? "", { api });
      } else {
        await disableBiometric({ api });
      }
    },
    onSuccess: (_, enable) => {
      void queryClient.invalidateQueries({ queryKey: ["biometric"] });
      showSnackbar(enable ? "Biometria ativada neste aparelho" : "Biometria desativada");
    },
    onError: (error) => showSnackbar(error instanceof Error ? error.message : errorMessage(error)),
  });

  const logoutAll = useMutation({
    // O aparelho sai do push antes: depois do logout geral a sessão já não vale para o descadastro.
    mutationFn: async () => {
      await unregisterPushDevice();
      await api.auth.logoutAll();
    },
    onSettled: () => void session.signOut("logout"),
  });

  const changeCurrency = (code: string) => {
    if (code === user?.primaryCurrency) return;
    updateProfile.mutate(
      { primaryCurrency: code },
      {
        onSuccess: () => showSnackbar(`Moeda principal: ${code}`),
        onError: (error) => showSnackbar(errorMessage(error)),
      },
    );
  };

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.scroll}>
      <ContentContainer style={styles.content}>
        <Text variant="headline" accessibilityRole="header">
          Preferências
        </Text>

        <Section title="Aparência">
          <Row
            icon={preference === "dark" ? "dark_mode" : "light_mode"}
            title="Tema"
            subtitle="Escuro facilita a leitura em pouca luz"
          >
            {null}
          </Row>
          <SegmentedControl
            accessibilityLabel="Tema"
            value={preference}
            onChange={setPreference}
            options={[
              { value: "system", label: "Sistema" },
              { value: "light", label: "Claro" },
              { value: "dark", label: "Escuro" },
            ]}
          />
        </Section>

        <Section title="Moeda principal dos registros">
          <Text variant="label" color="onSurfaceVariant">
            Usada para consolidar saldos e relatórios entre carteiras de moedas diferentes.
          </Text>
          <CurrencyPicker
            label="Moeda"
            value={user?.primaryCurrency ?? "BRL"}
            onChange={changeCurrency}
            disabled={updateProfile.isPending}
          />
        </Section>

        <NotificationsSection />

        <Section title="Conta">
          <Row icon="person" title={user?.username ?? ""} subtitle={user?.email ?? ""}>
            {null}
          </Row>
          <Row
            icon="fingerprint"
            title="Entrar com biometria"
            subtitle={biometricEnabled ? "Ativada neste aparelho" : "Use a digital no lugar da senha"}
          >
            <Switch
              value={biometricEnabled}
              disabled={biometric.isPending}
              onValueChange={(value) => biometric.mutate(value)}
              accessibilityLabel="Entrar com biometria"
            />
          </Row>
          <Row
            icon="lock"
            title="Alterar senha"
            subtitle="Encerra as outras sessões"
            onPress={() => {
              setPasswordKey((k) => k + 1);
              setPasswordOpen(true);
            }}
          >
            <Icon name="chevron_right" size={20} />
          </Row>
          <Row
            icon="devices"
            title="Sair de todos os aparelhos"
            subtitle="Encerra todas as sessões abertas"
            onPress={() => setLogoutAllOpen(true)}
          >
            <Icon name="chevron_right" size={20} />
          </Row>
        </Section>

        <Section title="Dados">
          <Row
            icon="inventory_2"
            title="Arquivo de transações"
            subtitle="Arquivar antigas, ver o que está arquivado e restaurar"
            onPress={() => router.push("/archive")}
          >
            <Icon name="chevron_right" size={20} />
          </Row>
        </Section>

        {user?.role === "admin" ? (
          <Section title="Administração">
            <Row
              icon="engineering"
              title="Modo manutenção"
              subtitle="Bloqueia registros e transferências de todos os usuários"
            >
              <Switch
                value={maintenance.active}
                disabled={setMaintenance.isPending}
                onValueChange={(value) =>
                  setMaintenance.mutate(value, { onError: (error) => showSnackbar(errorMessage(error)) })
                }
                accessibilityLabel="Modo manutenção"
              />
            </Row>
          </Section>
        ) : null}

        <Text variant="caption" color="onSurfaceVariant" align="center" style={styles.about}>
          Orçamento Fácil · v{env.appVersion} · Sprint 2{"\n"}API: {apiUrl}
        </Text>
      </ContentContainer>

      <ChangePasswordSheet key={passwordKey} open={passwordOpen} onClose={() => setPasswordOpen(false)} />

      <Dialog
        open={logoutAllOpen}
        onClose={() => setLogoutAllOpen(false)}
        title="Sair de todos os aparelhos?"
        icon="devices"
        actions={
          <>
            <Button variant="text" label="Cancelar" onPress={() => setLogoutAllOpen(false)} />
            <Button label="Sair de todos" loading={logoutAll.isPending} onPress={() => logoutAll.mutate()} />
          </>
        }
      >
        Todas as sessões, inclusive esta, serão encerradas.
      </Dialog>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  content: { gap: 16, paddingTop: 12 },
  about: { marginTop: 8 },
  dialogBody: { gap: 12 },
});
