import type { HttpClient } from "@/core/http/http-client";
import type {
  AuthResult,
  AuthTokens,
  BiometricChallenge,
  BiometricCredential,
  DataList,
  LoginRequest,
  MessageResponse,
  RegisterRequest,
  UpdateProfileRequest,
  User,
} from "./types";

/** Conta e sessão: cadastro (R02), login JWT (R03/R87), recuperação de senha (R04). */
export function authApi(http: HttpClient) {
  return {
    register: (body: RegisterRequest) => http.post<AuthResult>("/api/auth/register", body, { auth: false }),
    login: (body: LoginRequest) => http.post<AuthResult>("/api/auth/login", body, { auth: false }),
    refresh: (refreshToken: string) => http.post<AuthTokens>("/api/auth/refresh", { refreshToken }, { auth: false }),
    logout: (refreshToken: string) => http.post<void>("/api/auth/logout", { refreshToken }, { auth: false }),
    logoutAll: () => http.post<void>("/api/auth/logout-all"),
    forgotPassword: (email: string) =>
      http.post<MessageResponse>("/api/auth/password/forgot", { email }, { auth: false }),
    resetPassword: (token: string, password: string) =>
      http.post<void>("/api/auth/password/reset", { token, password }, { auth: false }),
    changePassword: (currentPassword: string, newPassword: string) =>
      http.post<void>("/api/auth/password/change", { currentPassword, newPassword }),
  };
}

/** Perfil e preferências: moeda principal (R28) e tema (R42). */
export function usersApi(http: HttpClient) {
  return {
    me: () => http.get<User>("/api/users/me"),
    updateMe: (body: UpdateProfileRequest) => http.patch<User>("/api/users/me", body),
  };
}

/** Login por biometria com chave do aparelho (R40). */
export function biometricApi(http: HttpClient) {
  return {
    enroll: (publicKey: string, deviceName: string) =>
      http.post<BiometricCredential>("/api/auth/biometric/credentials", { publicKey, deviceName }),
    list: () => http.get<DataList<BiometricCredential>>("/api/auth/biometric/credentials"),
    revoke: (id: string) => http.delete(`/api/auth/biometric/credentials/${id}`),
    challenge: (credentialId: string) =>
      http.post<BiometricChallenge>("/api/auth/biometric/challenge", { credentialId }, { auth: false }),
    login: (credentialId: string, challenge: string, signature: string) =>
      http.post<AuthResult>("/api/auth/biometric/login", { credentialId, challenge, signature }, { auth: false }),
  };
}
