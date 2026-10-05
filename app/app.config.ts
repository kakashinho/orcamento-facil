import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Configuração do app (R79: React Native, empacotado só para Android).
 *
 * A URL da API vem de EXPO_PUBLIC_API_URL (ver .env.example); sem ela, em desenvolvimento, o app
 * usa o IP do computador que serve o Metro, na porta 3000. Tráfego HTTP sem TLS só fica liberado
 * enquanto a URL não for https://.
 */
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || null;
// Sem URL (desenvolvimento, IP do Metro) ou com http:// — libera HTTP sem TLS; com https://, não.
const allowCleartext = !apiUrl || !apiUrl.startsWith("https://");

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Orçamento Fácil",
  slug: "orcamento-facil",
  version: "1.0.0",
  orientation: "default",
  icon: "./assets/images/icon.png",
  scheme: "orcamentofacil",
  userInterfaceStyle: "automatic",
  platforms: ["android"],
  android: {
    package: "app.orcamentofacil",
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: "#1560D4",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    softwareKeyboardLayoutMode: "resize",
    predictiveBackGestureEnabled: false,
    permissions: ["android.permission.RECORD_AUDIO", "android.permission.USE_BIOMETRIC"],
    blockedPermissions: ["android.permission.SYSTEM_ALERT_WINDOW"],
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#1560D4",
        image: "./assets/images/splash-icon.png",
        imageWidth: 96,
        dark: { backgroundColor: "#101318", image: "./assets/images/splash-icon.png" },
      },
    ],
    [
      "expo-font",
      {
        fonts: [
          "./assets/fonts/RobotoMono-Regular.ttf",
          "./assets/fonts/RobotoMono-Medium.ttf",
          "./assets/fonts/MaterialSymbolsRounded.ttf",
          "./assets/fonts/MaterialSymbolsRoundedFilled.ttf",
        ],
      },
    ],
    // Barra de navegação do sistema transparente, com ícones claros/escuros conforme o tema (R42).
    ["expo-navigation-bar", { enforceContrast: false }],
    "expo-secure-store",
    "@sbaiahmed1/react-native-biometrics",
    [
      "expo-speech-recognition",
      {
        microphonePermission: "O Orçamento Fácil usa o microfone para registrar despesas por voz.",
        speechRecognitionPermission: "O Orçamento Fácil converte sua fala em texto para registrar despesas.",
        androidSpeechServicePackages: ["com.google.android.googlequicksearchbox", "com.google.android.as"],
      },
    ],
    "expo-sharing",
    "@react-native-community/datetimepicker",
    ["expo-build-properties", { android: { usesCleartextTraffic: allowCleartext } }],
  ],
  experiments: {
    reactCompiler: true,
  },
  extra: {
    apiUrl,
  },
});
