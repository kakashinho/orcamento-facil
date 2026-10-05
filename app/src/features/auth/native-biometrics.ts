import { TurboModuleRegistry } from "react-native";

type BiometricsPackage = typeof import("@sbaiahmed1/react-native-biometrics");
export type NativeBiometrics = Pick<
  BiometricsPackage,
  "isSensorAvailable" | "createKeys" | "signWithOptions" | "deleteKeys"
>;

let cached: NativeBiometrics | null | undefined;

/**
 * Módulo nativo da biometria (R40), carregado só quando existe: ele vem no app instalado, mas não
 * no Expo Go. A presença é conferida antes de carregar o pacote, que, sem o módulo, derrubaria o
 * login inteiro ao ser importado.
 */
export function loadNativeBiometrics(): NativeBiometrics | null {
  if (cached === undefined) {
    cached = TurboModuleRegistry.get("ReactNativeBiometrics")
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require("@sbaiahmed1/react-native-biometrics") as BiometricsPackage)
      : null;
  }
  return cached;
}
