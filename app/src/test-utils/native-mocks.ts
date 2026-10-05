import * as SecureStore from "expo-secure-store";
import * as SpeechRecognition from "expo-speech-recognition";

/** Acesso tipado aos módulos nativos simulados em jest.setup-env.js. */
export function secureStoreData(): Map<string, string> {
  return (SecureStore as unknown as { __store: Map<string, string> }).__store;
}

export const speechEvents = SpeechRecognition as unknown as {
  __emit: (name: string, event?: unknown) => void;
  __reset: () => void;
};
