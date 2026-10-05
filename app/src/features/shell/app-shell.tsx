import { Tabs } from "expo-router/tabs";
import { useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsiveLayout, useTheme } from "@/ui";
import { useFeedback } from "../feedback/feedback-provider";
import { AppBar } from "./app-bar";
import { AppSheetsProvider } from "./app-sheets";
import { AppNavigation, DESTINATIONS, MIN_BOTTOM_INSET, NAVIGATION_BAR_HEIGHT } from "./navigation";

/** Estrutura do app logado: barra superior, destinos principais e folhas de formulário. */
export function AppShell() {
  const { colors } = useTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const { setBottomOffset } = useFeedback();

  useEffect(() => {
    const bottomInset = Math.max(insets.bottom, MIN_BOTTOM_INSET);
    setBottomOffset(layout.isWide ? insets.bottom : NAVIGATION_BAR_HEIGHT + bottomInset);
    return () => setBottomOffset(0);
  }, [layout.isWide, insets.bottom, setBottomOffset]);

  return (
    <AppSheetsProvider>
      <Tabs
        tabBar={(props) => <AppNavigation {...props} wide={layout.isWide} />}
        screenOptions={{
          tabBarPosition: layout.isWide ? "left" : "bottom",
          header: () => <AppBar />,
          // Com o trilho lateral, nada protege a borda inferior (barra de tarefas do tablet).
          sceneStyle: { backgroundColor: colors.background, paddingBottom: layout.isWide ? insets.bottom : 0 },
          animation: "fade",
        }}
      >
        {DESTINATIONS.map((destination) => (
          <Tabs.Screen key={destination.name} name={destination.name} options={{ title: destination.label }} />
        ))}
        {/* Arquivo de transações: tela aberta pelas Preferências, sem item na barra de navegação. */}
        <Tabs.Screen name="archive" options={{ title: "Arquivo", href: null }} />
      </Tabs>
    </AppSheetsProvider>
  );
}
