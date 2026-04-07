"use client";

import { useEffect, useRef } from "react";
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

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PostHogIdentity />
      {children}
    </SessionProvider>
  );
}
