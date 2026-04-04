"use client";

import Link from "next/link";
import { ChevronDown, LayoutDashboard, LogOut, Settings, UserRound } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getPresetAvatarUrl, readLocalSiteSettings, resolveAvatarUrl } from "@/lib/site-settings";

export default function NavbarAuthControls() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    const localSettings = typeof window !== "undefined" ? readLocalSiteSettings() : {};
    return resolveAvatarUrl(localSettings.avatar, session?.user?.image ?? null);
  });

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    const sessionUser = session?.user;
    if (!sessionUser) return;

    let cancelled = false;

    const loadAvatar = async () => {
      try {
        const response = await fetch("/api/study/me", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload || cancelled) {
          const localSettings = readLocalSiteSettings();
          setAvatarUrl(resolveAvatarUrl(localSettings.avatar, sessionUser.image ?? null));
          return;
        }

        setAvatarUrl(payload.user?.avatarUrl ?? sessionUser.image ?? null);
      } catch {
        if (!cancelled) {
          const localSettings = readLocalSiteSettings();
          setAvatarUrl(resolveAvatarUrl(localSettings.avatar, sessionUser.image ?? null));
        }
      }
    };

    void loadAvatar();

    const refreshAvatar = () => void loadAvatar();
    const applySavedAvatar = (event: Event) => {
      const nextAvatarUrl = (event as CustomEvent<{ avatarUrl?: string | null }>).detail?.avatarUrl;
      if (typeof nextAvatarUrl !== "undefined") {
        setAvatarUrl(nextAvatarUrl ?? resolveAvatarUrl(readLocalSiteSettings().avatar, sessionUser.image ?? null));
        return;
      }
      void loadAvatar();
    };

    window.addEventListener("uichicago-settings-change", refreshAvatar);
    window.addEventListener("uichicago-avatar-change", applySavedAvatar as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener("uichicago-settings-change", refreshAvatar);
      window.removeEventListener("uichicago-avatar-change", applySavedAvatar as EventListener);
    };
  }, [session?.user]);

  useEffect(() => {
    if (!session?.user) return;

    let cancelled = false;

    const loadAdminState = async () => {
      try {
        const response = await fetch("/api/admin/me", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!cancelled) {
          setIsAdmin(Boolean(payload?.isAdmin));
        }
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    };

    void loadAdminState();
    return () => {
      cancelled = true;
    };
  }, [session?.user]);

  if (status === "loading") {
    return <div className="h-10 w-28 rounded-full border border-zinc-200 bg-zinc-100/80 dark:border-white/10 dark:bg-white/5" />;
  }

  if (!session?.user) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: pathname || "/" })}
          className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/12 dark:bg-white dark:text-zinc-950"
        >
          Sign in
        </button>
        <Link
          href="/settings"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/8 dark:hover:text-white"
          aria-label="Open settings"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const initials =
    session.user.name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";
  const fallbackAvatar = getPresetAvatarUrl("night-owl");

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50/90 px-2 py-1.5 text-sm shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5"
        aria-label="Open account menu"
        aria-expanded={open}
      >
        {avatarUrl || fallbackAvatar ? (
          <div className="relative h-8 w-8 overflow-hidden rounded-full border border-zinc-200 bg-zinc-900 dark:border-white/10">
            <img src={avatarUrl || fallbackAvatar || ""} alt="Profile picture" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
            {initials}
          </div>
        )}
        <ChevronDown className={`hidden h-4 w-4 text-zinc-500 transition md:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-[240px] rounded-[1.25rem] border border-zinc-200 bg-white p-2 shadow-[0_22px_50px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-[#13151c]">
          <div className="rounded-2xl bg-zinc-50 px-3 py-3 dark:bg-white/4">
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">
              {session.user.name || "Signed in"}
            </div>
            <div className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {session.user.email}
            </div>
          </div>

          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="mt-2 inline-flex w-full items-center gap-2 rounded-[0.9rem] px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/6"
          >
            <UserRound className="h-4 w-4" />
            Profile
          </Link>

          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="mt-1 inline-flex w-full items-center gap-2 rounded-[0.9rem] px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/6"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>

          {isAdmin ? (
            <Link
              href="/admin/sparky"
              onClick={() => setOpen(false)}
              className="mt-1 inline-flex w-full items-center gap-2 rounded-[0.9rem] px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/6"
            >
              <LayoutDashboard className="h-4 w-4" />
              Sparky Admin
            </Link>
          ) : null}

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="mt-1 inline-flex w-full items-center gap-2 rounded-[0.9rem] px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/6"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
