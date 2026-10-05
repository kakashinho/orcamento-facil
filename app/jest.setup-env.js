/* Executado antes de cada arquivo de teste (antes dos imports): ambiente e módulos nativos simulados. */
process.env.EXPO_PUBLIC_API_URL = "http://api.test";

// Armazenamento cifrado (Keystore) → memória.
jest.mock("expo-secure-store", () => {
  const store = new Map();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
  };
});

// Biometria (Android Keystore + BiometricPrompt).
jest.mock("@sbaiahmed1/react-native-biometrics", () => ({
  isSensorAvailable: jest.fn(async () => ({ available: true, biometryType: "Biometrics", isDeviceSecure: true })),
  createKeys: jest.fn(async () => ({ publicKey: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtest" })),
  signWithOptions: jest.fn(async () => ({ success: true, signature: "c2lnbmF0dXJl" })),
  deleteKeys: jest.fn(async () => ({ success: true })),
}));

// Reconhecimento de fala: os testes disparam eventos com `__emit`.
jest.mock("expo-speech-recognition", () => {
  const listeners = new Map();
  const { useEffect, useRef } = require("react");
  return {
    __emit: (name, event) => (listeners.get(name) ?? new Set()).forEach((fn) => fn(event ?? {})),
    __reset: () => listeners.clear(),
    ExpoSpeechRecognitionModule: {
      addListener: (name, fn) => {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
        return { remove: () => listeners.get(name).delete(fn) };
      },
      requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: "granted" })),
      isRecognitionAvailable: jest.fn(() => true),
      start: jest.fn(),
      stop: jest.fn(),
      abort: jest.fn(),
    },
    useSpeechRecognitionEvent: (name, handler) => {
      const ref = useRef(handler);
      ref.current = handler;
      useEffect(() => {
        const fn = (event) => ref.current(event);
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
        return () => listeners.get(name).delete(fn);
      }, [name]);
    },
  };
});

// Adaptadores que conferem os módulos nativos: nos testes, usam os pacotes simulados acima.
jest.mock("./src/features/transactions/voice/speech-recognition", () => ({
  getSpeechRecognition: () => require("expo-speech-recognition").ExpoSpeechRecognitionModule,
}));
jest.mock("./src/features/auth/native-biometrics", () => ({
  loadNativeBiometrics: () => require("@sbaiahmed1/react-native-biometrics"),
}));

jest.mock("expo-speech", () => ({ speak: jest.fn(), stop: jest.fn() }));

jest.mock("expo-file-system", () => {
  class File {
    constructor(dir, name) {
      this.uri = `file:///cache/${name}`;
    }
  }
  File.downloadFileAsync = jest.fn(async (_url, destination) => destination);
  return { File, Paths: { cache: "cache" } };
});

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock("@react-native-community/datetimepicker", () => ({
  DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
}));

jest.mock("expo-crypto", () => {
  let counter = 0;
  return { randomUUID: jest.fn(() => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`) };
});

jest.mock("expo-device", () => ({ modelName: "Pixel de Teste" }));

jest.mock("expo-navigation-bar", () => ({ NavigationBar: () => null, setStyle: jest.fn() }));

jest.mock("expo-system-ui", () => ({ setBackgroundColorAsync: jest.fn(async () => undefined) }));

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
}));
