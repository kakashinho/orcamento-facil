import { requireOptionalNativeModule } from "expo";

type SpeechRecognitionPackage = typeof import("expo-speech-recognition");
export type SpeechRecognitionModule = SpeechRecognitionPackage["ExpoSpeechRecognitionModule"];

let cached: SpeechRecognitionModule | null | undefined;

/**
 * Módulo nativo de reconhecimento de fala (R65), carregado só quando existe.
 *
 * Ele vem no app instalado (build de desenvolvimento ou APK), mas não no Expo Go. A presença é
 * conferida antes de carregar o pacote: carregar um pacote cujo módulo nativo falta gera erro
 * fatal no Metro, mesmo dentro de try/catch. Sem o módulo, a tela avisa que o recurso precisa do
 * app instalado.
 */
export function getSpeechRecognition(): SpeechRecognitionModule | null {
  if (cached === undefined) {
    cached = requireOptionalNativeModule("ExpoSpeechRecognition")
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require("expo-speech-recognition") as SpeechRecognitionPackage).ExpoSpeechRecognitionModule
      : null;
  }
  return cached;
}
