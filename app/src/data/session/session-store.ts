import { create } from "zustand";
import type { User } from "../api/types";

export type SessionStatus = "restoring" | "signedOut" | "signedIn";

/** Por que a sessão terminou: "expired" mostra o aviso de sessão expirada no login (R87). */
export type SignedOutReason = "expired" | "logout" | "offline" | null;

export interface SessionState {
  status: SessionStatus;
  user: User | null;
  signedOutReason: SignedOutReason;
  setSignedIn: (user: User) => void;
  setSignedOut: (reason: SignedOutReason) => void;
  setUser: (user: User) => void;
  clearReason: () => void;
}

/** Estado de autenticação observado pela navegação e pelas telas (R03). */
export const useSessionStore = create<SessionState>((set) => ({
  status: "restoring",
  user: null,
  signedOutReason: null,
  setSignedIn: (user) => set({ status: "signedIn", user, signedOutReason: null }),
  setSignedOut: (reason) => set({ status: "signedOut", user: null, signedOutReason: reason }),
  setUser: (user) => set({ user }),
  clearReason: () => set({ signedOutReason: null }),
}));

export function useCurrentUser(): User | null {
  return useSessionStore((state) => state.user);
}
