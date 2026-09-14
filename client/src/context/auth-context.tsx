import { useAuth } from "@clerk/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { IUser } from "@shared/types";
import { apiFetch, setApiTokenGetter } from "../lib/api";
import { AuthContext } from "./auth-store";

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, sessionId, getToken } = useAuth();
  const [user, setUser] = useState<IUser | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setApiTokenGetter((skipCache = false) => getToken({ skipCache }));
  }, [getToken]);

  const refreshUser = useCallback(async () => {
    if (!isSignedIn || !sessionId) return;
    setIsSyncing(true);
    setError(null);
    try {
      // Fetch a fresh token explicitly for the initial database sync. This
      // removes any dependency on effect ordering while Clerk restores a tab.
      const token = await getToken({ skipCache: true });
      if (!token) throw new Error("Your Clerk session is not ready. Refresh the page or sign in again");
      setUser(await apiFetch<IUser>("/auth/sync", { method: "POST", headers: { Authorization: `Bearer ${token}` } }));
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load your account"); }
    finally { setIsSyncing(false); }
  }, [getToken, isSignedIn, sessionId]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) return;
    // Syncing the external Clerk session into our database is the effect's purpose.
    // oxlint-disable-next-line react/set-state-in-effect
    void refreshUser();
    const refreshOnFocus = () => { void refreshUser(); };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [isLoaded, isSignedIn, refreshUser]);

  const value = useMemo(() => ({ user: isSignedIn ? user : null, isReady: Boolean(isLoaded && (!isSignedIn || (!isSyncing && (user || error)))), error: isSignedIn ? error : null, refreshUser }), [user, isLoaded, isSignedIn, isSyncing, error, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
