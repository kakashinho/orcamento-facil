import * as SplashScreen from "expo-splash-screen";
import { installGlobalErrorHandler } from "@/core/logging/global-error-handler";
import { logger } from "@/core/logging/logger";
import { AppProviders, RootNavigator } from "@/features/shell/app-root";
import { ErrorScreen } from "@/features/shell/error-screen";

// A splash continua visível até a sessão e o tema serem restaurados.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
installGlobalErrorHandler(logger);

/** Erros de renderização em qualquer tela caem aqui (R85). */
export const ErrorBoundary = ErrorScreen;

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
