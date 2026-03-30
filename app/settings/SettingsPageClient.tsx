"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { LoaderCircle, Settings2, Trash2 } from "lucide-react";
import {
  DEFAULT_THEME_MODE,
  SETTINGS_STORAGE_KEY,
  THEME_STORAGE_KEY,
  readLocalSiteSettings,
  writeLocalSiteSettings,
} from "@/lib/site-settings";
import type { SiteSettingsPayload, ThemeMode } from "@/lib/study/profile";

function persistThemeLocally(themeMode: ThemeMode) {
  const existing = readLocalSiteSettings();
  const merged: SiteSettingsPayload = {
    ...existing,
    themeMode,
    themeSchedule: {
      darkStartHour: 19,
      lightStartHour: 7,
    },
  };
  window.localStorage.setItem(
    THEME_STORAGE_KEY,
    JSON.stringify({ themeMode: merged.themeMode, themeSchedule: merged.themeSchedule }),
  );
  writeLocalSiteSettings(merged);
  window.dispatchEvent(new Event("uichicago-theme-change"));
  window.dispatchEvent(new Event("uichicago-settings-change"));
}

export default function SettingsPageClient() {
  const { data: session, status } = useSession();
  const [loadedFromDb, setLoadedFromDb] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME_MODE;
    return readLocalSiteSettings().themeMode ?? DEFAULT_THEME_MODE;
  });
  const [savedTheme, setSavedTheme] = useState<ThemeMode>(themeMode);

  // Load theme from DB when authenticated
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/study/me", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload || cancelled) return;
        const dbTheme: ThemeMode = payload.profile?.settings?.themeMode ?? DEFAULT_THEME_MODE;
        setThemeMode(dbTheme);
        setSavedTheme(dbTheme);
        persistThemeLocally(dbTheme);
      } finally {
        if (!cancelled) setLoadedFromDb(true);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [status]);

  // Auto-apply theme to page immediately whenever it changes
  useEffect(() => {
    persistThemeLocally(themeMode);
  }, [themeMode]);

  // Clear message after a moment
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(""), 3200);
    return () => window.clearTimeout(t);
  }, [message]);

  const saveThemeToDb = async (mode: ThemeMode) => {
    if (status !== "authenticated") return;
    try {
      setIsSaving(true);
      const response = await fetch("/api/study/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { themeMode: mode } }),
      });
      if (!response.ok) throw new Error("Could not save theme.");
      setSavedTheme(mode);
      setMessage("Theme saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    persistThemeLocally(mode);
    if (status === "authenticated") {
      void saveThemeToDb(mode);
    } else {
      setSavedTheme(mode);
    }
  };

  const deleteAccount = async () => {
    if (isDeleting) return;
    const confirmed = window.confirm("Delete your account and study data? This cannot be undone.");
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      const response = await fetch("/api/account", { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not delete account.");
      }

      window.localStorage.removeItem(THEME_STORAGE_KEY);
      window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
      window.dispatchEvent(new Event("uichicago-theme-change"));
      window.dispatchEvent(new Event("uichicago-settings-change"));
      await signOut({ callbackUrl: "/" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete account.");
      setIsDeleting(false);
    }
  };

  // Show skeleton while loading from DB
  if (status === "loading" || (status === "authenticated" && !loadedFromDb)) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950 dark:bg-zinc-950 dark:text-white sm:px-6">
        <div className="mx-auto h-[340px] max-w-3xl animate-pulse rounded-[2rem] border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.04]" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.06),transparent_24%),#fafafa] px-4 py-8 text-zinc-950 dark:bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.16),transparent_32%),#09090b] dark:text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-100 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
              <Settings2 className="h-4 w-4" />
              Settings
            </div>
          </div>
          {status === "authenticated" && (
            <div className="text-sm text-zinc-500 dark:text-zinc-400">{session?.user?.email}</div>
          )}
        </div>

        {/* Appearance — always visible */}
        <section className="overflow-hidden rounded-[1.8rem] border border-zinc-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]">
          <div className="border-b border-zinc-200 px-6 py-5 dark:border-white/10">
            <div className="text-sm font-semibold text-zinc-950 dark:text-white">Appearance</div>
          </div>
          <div className="px-6 py-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-950 dark:text-white">Theme</div>
                <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Dark, light, or automatic. Auto uses light 7 AM – 7 PM. My School always stays dark.
                </div>
              </div>
              <select
                value={themeMode}
                onChange={(event) => handleThemeChange(event.target.value as ThemeMode)}
                disabled={isSaving}
                className="h-11 min-w-[130px] rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 outline-none disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="auto">Auto</option>
              </select>
            </div>
            {status !== "authenticated" && (
              <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                Theme is saved on this device.{" "}
                <button
                  type="button"
                  onClick={() => signIn("google", { callbackUrl: "/settings" })}
                  className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                >
                  Sign in
                </button>{" "}
                to sync it across devices.
              </p>
            )}
          </div>
        </section>

        {/* Profile picture — authenticated only, link to profile page */}
        {status === "authenticated" && (
          <section className="overflow-hidden rounded-[1.8rem] border border-zinc-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]">
            <div className="border-b border-zinc-200 px-6 py-5 dark:border-white/10">
              <div className="text-sm font-semibold text-zinc-950 dark:text-white">Profile picture</div>
            </div>
            <div className="flex items-center justify-between gap-4 px-6 py-5">
              <div className="text-sm text-zinc-500 dark:text-zinc-400">
                Upload a photo or choose an avatar from your Profile page.
              </div>
              <a
                href="/profile"
                className="inline-flex items-center rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
              >
                Go to Profile
              </a>
            </div>
          </section>
        )}

        {/* Personal information — authenticated only */}
        {status === "authenticated" && (
          <section className="overflow-hidden rounded-[1.8rem] border border-zinc-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]">
            <div className="border-b border-zinc-200 px-6 py-5 dark:border-white/10">
              <div className="text-sm font-semibold text-zinc-950 dark:text-white">Personal information</div>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-white/10">
              <div className="flex items-center justify-between gap-4 px-6 py-5">
                <div>
                  <div className="text-sm font-semibold text-zinc-950 dark:text-white">Google account</div>
                  <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{session?.user?.email}</div>
                </div>
                <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
                  Connected
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 px-6 py-5">
                <div>
                  <div className="text-sm font-semibold text-zinc-950 dark:text-white">School</div>
                  <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">University of Illinois Chicago</div>
                </div>
                <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
                  UIC
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Sign in prompt — not authenticated */}
        {status !== "authenticated" && (
          <section className="overflow-hidden rounded-[1.8rem] border border-zinc-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]">
            <div className="flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-950 dark:text-white">Profile & account settings</div>
                <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Sign in to set your profile picture, major, courses, and manage your account.
                </div>
              </div>
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: "/profile" })}
                className="inline-flex shrink-0 items-center rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
              >
                Sign in with Google
              </button>
            </div>
          </section>
        )}

        {/* Delete account — authenticated only */}
        {status === "authenticated" && (
          <section className="overflow-hidden rounded-[1.8rem] border border-red-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-red-500/20 dark:bg-[rgba(18,18,23,0.94)]">
            <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-950 dark:text-white">Delete your account</div>
                <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  This removes your account and saved study data permanently.
                </div>
              </div>
              <button
                type="button"
                onClick={deleteAccount}
                disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isDeleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete account
              </button>
            </div>
          </section>
        )}
      </div>

      {message ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-[0_18px_45px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)] dark:text-white">
          {message}
        </div>
      ) : null}
    </main>
  );
}
