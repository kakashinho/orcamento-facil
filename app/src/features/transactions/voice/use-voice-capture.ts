import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/core/logging/logger";
import { getSpeechRecognition } from "./speech-recognition";

export type VoiceState = "idle" | "listening";

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Permita o uso do microfone para registrar por voz.",
  "no-speech": "Não ouvimos nada. Toque no microfone e fale o valor e a descrição.",
  "speech-timeout": "Não ouvimos nada. Toque no microfone e fale o valor e a descrição.",
  network: "O reconhecimento de voz precisa de internet neste aparelho.",
  "service-not-allowed": "O reconhecimento de voz não está disponível neste aparelho.",
  "language-not-supported": "O português não está disponível no reconhecimento de voz deste aparelho.",
  unavailable:
    "O registro por voz usa o reconhecimento de fala do Android e funciona no app instalado (não no Expo Go).",
};

/**
 * Captura de voz e conversão em texto no aparelho (R65), com o serviço de reconhecimento do
 * Android via expo-speech-recognition. Entrega a frase final para o app interpretar.
 */
export function useVoiceCapture(onFinalText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const finalText = useRef("");
  const aborted = useRef(false);
  const onFinal = useRef(onFinalText);

  useEffect(() => {
    onFinal.current = onFinalText;
  }, [onFinalText]);

  useEffect(() => {
    const speech = getSpeechRecognition();
    if (!speech) return;
    const subscriptions = [
      speech.addListener("result", (event) => {
        const text = event.results[0]?.transcript ?? "";
        setTranscript(text);
        if (event.isFinal) finalText.current = text;
      }),
      speech.addListener("error", (event) => {
        if (event.error === "aborted") return;
        logger.warn("voice.recognition_error", { error: event.error });
        setError(ERROR_MESSAGES[event.error] ?? "Não foi possível reconhecer a fala. Tente novamente.");
      }),
      speech.addListener("end", () => {
        setState("idle");
        const text = finalText.current.trim();
        finalText.current = "";
        if (text && !aborted.current) onFinal.current(text);
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setTranscript("");
    finalText.current = "";
    aborted.current = false;
    const speech = getSpeechRecognition();
    if (!speech) {
      setError(ERROR_MESSAGES.unavailable);
      return;
    }
    const permission = await speech.requestPermissionsAsync();
    if (!permission.granted) {
      setError(ERROR_MESSAGES["not-allowed"]);
      return;
    }
    if (!speech.isRecognitionAvailable()) {
      setError(ERROR_MESSAGES["service-not-allowed"]);
      return;
    }
    setState("listening");
    speech.start({ lang: "pt-BR", interimResults: true, continuous: false });
    logger.info("voice.listening_started");
  }, []);

  const cancel = useCallback(() => {
    aborted.current = true;
    getSpeechRecognition()?.abort();
    setState("idle");
  }, []);

  const stop = useCallback(() => getSpeechRecognition()?.stop(), []);

  return { state, transcript, error, start, stop, cancel, clearError: () => setError(null) };
}
