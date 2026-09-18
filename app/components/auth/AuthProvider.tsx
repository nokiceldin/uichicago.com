"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "next-auth";
import { SessionProvider, useSession } from "next-auth/react";
import posthog from "posthog-js";

function PostHogIdentity() {
  const { data: session, status } = useSession();
  const user = session?.user;
  const identifiedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;

    if (!user?.id) {
      if (identifiedUserIdRef.current) {
        posthog.reset();
        identifiedUserIdRef.current = null;
      }
      return;
    }

    identifiedUserIdRef.current = user.id;
    posthog.identify(user.id, {
      email: user.email ?? undefined,
      name: user.name ?? undefined,
    });
  }, [status, user?.id, user?.email, user?.name]);

  return null;
}

type AccountIdentity = {
  avatarUrl: string | null;
  isAdmin: boolean;
  accountLoading: boolean;
  refreshAccount: () => Promise<void>;
  setAvatarUrl: (value: string | null) => void;
};

const AccountIdentityContext = createContext<AccountIdentity | null>(null);

function AccountIdentityProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const sessionImage = session?.user?.image ?? null;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(sessionImage);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accountLoading, setAccountLoading] = useState(status === "loading");
  const requestRef = useRef(0);

  const refreshAccount = useCallback(async () => {
    if (status !== "authenticated" || !userId) {
      setAvatarUrl(null);
      setIsAdmin(false);
      setAccountLoading(status === "loading");
      return;
    }

    const requestId = ++requestRef.current;
    setAccountLoading(true);
    try {
      const response = await fetch("/api/account/me", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => null);
      if (requestId !== requestRef.current) return;
      if (response.ok && payload) {
        setAvatarUrl(payload.user?.avatarUrl ?? sessionImage);
        setIsAdmin(Boolean(payload.isAdmin));
      } else {
        // A failed profile request must never make the UI look signed out.
        setAvatarUrl((current) => current ?? sessionImage);
      }
    } catch {
      if (requestId === requestRef.current) {
        setAvatarUrl((current) => current ?? sessionImage);
      }
    } finally {
      if (requestId === requestRef.current) setAccountLoading(false);
    }
  }, [sessionImage, status, userId]);

  useEffect(() => {
    setAvatarUrl(sessionImage);
    setIsAdmin(false);
    void refreshAccount();
  }, [refreshAccount, sessionImage, userId]);

  useEffect(() => {
    const applyAvatar = (event: Event) => {
      const next = (event as CustomEvent<{ avatarUrl?: string | null }>).detail?.avatarUrl;
      if (typeof next !== "undefined") setAvatarUrl(next);
      else void refreshAccount();
    };
    window.addEventListener("uichicago-avatar-change", applyAvatar as EventListener);
    return () => window.removeEventListener("uichicago-avatar-change", applyAvatar as EventListener);
  }, [refreshAccount]);

  const value = useMemo(
    () => ({ avatarUrl, isAdmin, accountLoading, refreshAccount, setAvatarUrl }),
    [accountLoading, avatarUrl, isAdmin, refreshAccount],
  );
  return <AccountIdentityContext.Provider value={value}>{children}</AccountIdentityContext.Provider>;
}

export function useAccountIdentity() {
  const context = useContext(AccountIdentityContext);
  if (!context) throw new Error("useAccountIdentity must be used inside AuthProvider");
  return context;
}

export default function AuthProvider({ children, session }: { children: React.ReactNode; session: Session | null }) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
      <PostHogIdentity />
      <AccountIdentityProvider>{children}</AccountIdentityProvider>
    </SessionProvider>
  );
}
