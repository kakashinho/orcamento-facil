import { useMutation, useQuery } from "@tanstack/react-query";
import { api, session } from "@/data/client";
import type { LoginRequest, RegisterRequest } from "@/data/api/types";
import { getStoredCredential, signInWithBiometric } from "./biometric-auth";

/** Login com e-mail ou nome de usuário e senha (R03). Erros 401/423 tratados na tela (R87). */
export function useSignIn() {
  return useMutation({
    mutationFn: (body: LoginRequest) => api.auth.login(body),
    onSuccess: (result) => session.begin(result),
  });
}

/** Cadastro (R02). A sessão só começa quando o usuário toca em "Começar". */
export function useRegister() {
  return useMutation({ mutationFn: (body: RegisterRequest) => api.auth.register(body) });
}

export function useBiometricSignIn() {
  return useMutation({
    mutationFn: () => signInWithBiometric({ api }),
    onSuccess: (result) => session.begin(result),
  });
}

/** Credencial biométrica salva neste aparelho (para mostrar o botão da digital). */
export function useStoredBiometric() {
  return useQuery({ queryKey: ["biometric", "stored"], queryFn: () => getStoredCredential(), staleTime: 0 });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: (email: string) => api.auth.forgotPassword(email) });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) => api.auth.resetPassword(token, password),
  });
}
