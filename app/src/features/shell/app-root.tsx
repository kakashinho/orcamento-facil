import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { NavigationBar } from "expo-navigation-bar";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, type ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useServerAddress } from "@/core/config/server-address";
import { bindAppFocus } from "@/core/query/query-client";
import { queryClient, session } from "@/data/client";
import { useSystemStatus } from "@/data/queries/account";
import { useSessionStore } from "@/data/session/session-store";
import { palettes, ThemeProvider } from "@/ui";
import { FeedbackProvider } from "../feedback/feedback-provider";
import { useResolvedScheme, useThemePreference } from "../preferences/theme-preference";

/** Provedores globais: área segura, cache de dados (React Query). */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

/**
 * Inicialização e navegação raiz: restaura a sessão (R03), aplica o tema (R42), acompanha a
 * manutenção (R72) e protege as rotas — sem sessão, só as telas de acesso ficam disponíveis.
 */
export function RootNavigator() {
  const scheme = useResolvedScheme();
  const hydrated = useThemePreference((s) => s.hydrated);
  const status = useSessionStore((s) => s.status);
  const userId = useSessionStore((s) => s.user?.id);
  // Fontes do protótipo (ícones Material Symbols e Roboto Mono). No build elas já vêm embutidas;
  // o carregamento em tempo de execução garante o mesmo visual no Expo Go.
  const [fontsLoaded, fontError] = useFonts({
    MaterialSymbolsRounded: require("../../../assets/fonts/MaterialSymbolsRounded.ttf"),
    MaterialSymbolsRoundedFilled: require("../../../assets/fonts/MaterialSymbolsRoundedFilled.ttf"),
    "RobotoMono-Regular": require("../../../assets/fonts/RobotoMono-Regular.ttf"),
    "RobotoMono-Medium": require("../../../assets/fonts/RobotoMono-Medium.ttf"),
  });
  useSystemStatus();

  useEffect(() => {
    void useThemePreference.getState().hydrate();
    // O endereço salvo vale já na restauração da sessão (que chama a API).
    void useServerAddress
      .getState()
      .hydrate()
      .then(() => session.restore());
    return bindAppFocus();
  }, []);

  // O tema salvo no perfil vale ao entrar (mesma aparência em todos os aparelhos).
  useEffect(() => {
    const theme = useSessionStore.getState().user?.theme;
    if (userId && theme && theme !== useThemePreference.getState().preference) {
      useThemePreference.getState().setPreference(theme);
    }
  }, [userId]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(palettes[scheme].background).catch(() => undefined);
  }, [scheme]);

  const ready = hydrated && status !== "restoring" && (fontsLoaded || !!fontError);
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider scheme={scheme}>
      <FeedbackProvider>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        {/* "light" = barra clara com ícones escuros; "dark" = ícones claros sobre fundo escuro. */}
        <NavigationBar style={scheme === "dark" ? "dark" : "light"} />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "fade",
            contentStyle: { backgroundColor: palettes[scheme].background },
          }}
        >
          <Stack.Protected guard={status === "signedIn"}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={status !== "signedIn"}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Screen name="reset-password" />
        </Stack>
      </FeedbackProvider>
    </ThemeProvider>
  );
}
