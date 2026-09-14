import { createContext, useContext } from "react";
import type { IUser } from "@shared/types";

export interface AuthState {
  user: IUser | null;
  isReady: boolean;
  error: string | null;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAppAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAppAuth must be used inside AuthProvider");
  return context;
}
