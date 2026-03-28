"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { ImageIcon, LoaderCircle, Settings2, Trash2, Upload } from "lucide-react";
import {
  DEFAULT_THEME_MODE,
  PRESET_AVATARS,
  SETTINGS_STORAGE_KEY,
  THEME_STORAGE_KEY,
  getPresetAvatarUrl,
  readLocalSiteSettings,
  resolveAvatarUrl,
  writeLocalSiteSettings,
} from "@/lib/site-settings";
import type { SiteSettingsPayload, ThemeMode } from "@/lib/study/profile";

type SettingsState = {
  school: string;
  themeMode: ThemeMode;
  avatar: NonNullable<SiteSettingsPayload["avatar"]>;
};

function serializeState(state: SettingsState) {
  return JSON.stringify(state);
}

async function fileToDataUrl(file: File) {
  const imageBitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare image.");

  const ratio = Math.max(size / imageBitmap.width, size / imageBitmap.height);
  const drawWidth = imageBitmap.width * ratio;
  const drawHeight = imageBitmap.height * ratio;
  const offsetX = (size - drawWidth) / 2;
  const offsetY = (size - drawHeight) / 2;

  context.fillStyle = "#101114";
  context.fillRect(0, 0, size, size);
  context.drawImage(imageBitmap, offsetX, offsetY, drawWidth, drawHeight);

  return canvas.toDataURL("image/jpeg", 0.86);
}

function persistThemeSettings(settings: SiteSettingsPayload) {
  const mergedSettings: SiteSettingsPayload = {
    ...readLocalSiteSettings(),
    ...settings,
    themeSchedule: {
      darkStartHour: 19,
      lightStartHour: 7,
    },
  };

  window.localStorage.setItem(
    THEME_STORAGE_KEY,
    JSON.stringify({
      themeMode: mergedSettings.themeMode ?? DEFAULT_THEME_MODE,
      themeSchedule: mergedSettings.themeSchedule,
    }),
  );
  writeLocalSiteSettings(mergedSettings);
  window.dispatchEvent(new Event("uichicago-theme-change"));
  window.dispatchEvent(new Event("uichicago-settings-change"));
}

function notifySavedSettings(avatarUrl: string | null) {
  window.dispatchEvent(new CustomEvent("uichicago-avatar-change", { detail: { avatarUrl } }));
  window.dispatchEvent(new Event("uichicago-settings-change"));
}

function inferAvatarSelection(
  savedAvatar: SiteSettingsPayload["avatar"] | undefined,
  localAvatar: SiteSettingsPayload["avatar"] | undefined,
  avatarUrl: string | null | undefined,
  sessionImage: string | null | undefined,
): NonNullable<SiteSettingsPayload["avatar"]> {
  if (savedAvatar?.type === "upload" && savedAvatar.value) return savedAvatar;
  if (savedAvatar?.type === "preset" && savedAvatar.value) return savedAvatar;
  if (savedAvatar?.type === "google") return savedAvatar;

  if (avatarUrl && avatarUrl !== sessionImage) {
    const matchingPreset = PRESET_AVATARS.find((preset) => getPresetAvatarUrl(preset.id) === avatarUrl);
    if (matchingPreset) {
      return { type: "preset", value: matchingPreset.id };
    }

    return { type: "upload", value: avatarUrl };
  }

  if (localAvatar?.type === "upload" && localAvatar.value) return localAvatar;
  if (localAvatar?.type === "preset" && localAvatar.value) return localAvatar;
  if (localAvatar?.type === "google") return localAvatar;

  return { type: "google" };
}

export default function SettingsPageClient() {
  const { data: session, status } = useSession();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [state, setState] = useState<SettingsState>({
    school: "University of Illinois Chicago",
    themeMode: "auto",
    avatar: { type: "google" },
  });
  const [fallbackAvatar, setFallbackAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    const localSettings = readLocalSiteSettings();

    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/study/me", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload || cancelled) return;

        const nextFallbackAvatar = payload.user?.avatarUrl ?? payload.user?.image ?? session?.user?.image ?? null;
        const nextAvatar = inferAvatarSelection(
          payload.profile?.settings?.avatar,
          localSettings.avatar,
          nextFallbackAvatar,
          session?.user?.image ?? null,
        );

        const nextState: SettingsState = {
          school: payload.profile?.school?.trim() ? payload.profile.school : "University of Illinois Chicago",
          themeMode: payload.profile?.settings?.themeMode ?? localSettings.themeMode ?? "auto",
          avatar: nextAvatar,
        };

        setFallbackAvatar(nextFallbackAvatar);
        setState(nextState);
        setSavedSnapshot(serializeState(nextState));
        writeLocalSiteSettings({
          ...localSettings,
          themeMode: nextState.themeMode,
          avatar: nextState.avatar,
        });
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.image, status]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (!loaded) return;
    persistThemeSettings({
      themeMode: state.themeMode,
    });
  }, [loaded, state.themeMode]);

  const previewAvatar = useMemo(
    () => resolveAvatarUrl(state.avatar, fallbackAvatar) ?? getPresetAvatarUrl("night-owl"),
    [fallbackAvatar, state.avatar],
  );
  const hasChanges = loaded && serializeState(state) !== savedSnapshot;

  const saveSettings = async () => {
    if (!hasChanges || isSaving) return;

    try {
      setIsSaving(true);
      const settingsPayload: SiteSettingsPayload = {
        themeMode: state.themeMode,
        avatar: state.avatar,
      };

      const response = await fetch("/api/study/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          school: state.school === "University of Illinois Chicago" ? "UIC" : state.school,
          settings: settingsPayload,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not save settings.");
      }

      persistThemeSettings(settingsPayload);
      setSavedSnapshot(serializeState(state));
      const nextAvatarUrl =
        payload?.user?.avatarUrl ??
        payload?.user?.image ??
        resolveAvatarUrl(state.avatar, fallbackAvatar) ??
        null;
      setFallbackAvatar(nextAvatarUrl);
      writeLocalSiteSettings({
        ...readLocalSiteSettings(),
        ...settingsPayload,
      });
      notifySavedSettings(nextAvatarUrl);
      setMessage("Settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setIsSaving(false);
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

  if (status === "loading" || (status === "authenticated" && !loaded)) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950 dark:bg-zinc-950 dark:text-white sm:px-6">
        <div className="mx-auto h-[640px] max-w-5xl animate-pulse rounded-[2rem] border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.04]" />
      </main>
    );
  }

  if (status !== "authenticated") {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-10 text-zinc-950 dark:bg-zinc-950 dark:text-white sm:px-6">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-[0_20px_70px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(28,28,33,0.96),rgba(16,16,21,0.98))] dark:shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-100 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
            <Settings2 className="h-4 w-4" />
            Settings
          </div>
          <h1 className="mt-6 text-[2.4rem] font-black tracking-[-0.06em] text-zinc-950 dark:text-white">Tune the site to feel like yours.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-400">
            Sign in with Google to choose a profile picture, set the site theme, and manage your account.
          </p>
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/settings" })}
            className="mt-8 inline-flex items-center rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
          >
            Continue with Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.06),transparent_24%),#fafafa] px-4 py-8 text-zinc-950 dark:bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.16),transparent_32%),#09090b] dark:text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Settings</div>
            <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{session.user?.email}</div>
          </div>
          <button
            type="button"
            onClick={saveSettings}
            disabled={!hasChanges || isSaving}
            className={`inline-flex min-w-[140px] items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition ${
              hasChanges && !isSaving
                ? "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
                : "cursor-not-allowed bg-zinc-200 text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-500"
            }`}
          >
            {isSaving ? "Saving..." : "Save settings"}
          </button>
        </div>

        <div className="space-y-6">
            <section className="rounded-[1.8rem] border border-zinc-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]">
              <div className="border-b border-zinc-200 px-6 py-5 dark:border-white/10">
                <div className="text-sm font-semibold text-zinc-950 dark:text-white">Profile picture</div>
              </div>

              <div className="p-6">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    if (!file.type.startsWith("image/")) {
                      setMessage("Please choose a normal image file.");
                      return;
                    }
                    if (file.size > 8 * 1024 * 1024) {
                      setMessage("Please keep uploads under 8 MB.");
                      return;
                    }
                    try {
                      const dataUrl = await fileToDataUrl(file);
                      setState((current) => ({
                        ...current,
                        avatar: {
                          type: "upload",
                          value: dataUrl,
                        },
                      }));
                    } catch {
                      setMessage("Could not process that image.");
                    }
                  }}
                />

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="h-24 w-24 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 shadow-[0_10px_30px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-white/[0.06]">
                    <img src={previewAvatar ?? getPresetAvatarUrl("night-owl") ?? ""} alt="Current profile picture" className="h-full w-full object-cover" />
                  </div>

                  <div className="flex flex-1 flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex h-12 items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 text-sm font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:border-white/25 dark:hover:bg-white/[0.07]"
                    >
                      <Upload className="h-4 w-4" />
                      Upload photo
                    </button>

                    <button
                      type="button"
                      onClick={() => setAvatarPickerOpen((current) => !current)}
                      className="inline-flex h-12 items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 text-sm font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:border-white/25 dark:hover:bg-white/[0.07]"
                    >
                      <ImageIcon className="h-4 w-4" />
                      Funny avatars
                    </button>

                    {session.user?.image ? (
                      <button
                        type="button"
                        onClick={() => setState((current) => ({ ...current, avatar: { type: "google" } }))}
                        className="inline-flex h-12 items-center rounded-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:border-white/25 dark:hover:text-white"
                      >
                        Use Google photo
                      </button>
                    ) : null}
                  </div>
                </div>

                {avatarPickerOpen ? (
                  <div className="mt-6 rounded-[1.4rem] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-white/10 dark:bg-black/20">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-950 dark:text-white">Funny avatars</div>
                        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          Pick from a bigger illustrated set, or upload your own photo.
                        </div>
                      </div>
                      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{PRESET_AVATARS.length} options</div>
                    </div>

                    <div className="grid grid-cols-5 gap-3 sm:grid-cols-7 md:grid-cols-8">
                      {PRESET_AVATARS.map((avatar) => {
                        const url = getPresetAvatarUrl(avatar.id);
                        const active = state.avatar.type === "preset" && state.avatar.value === avatar.id;
                        return (
                          <button
                            key={avatar.id}
                            type="button"
                            onClick={() => setState((current) => ({ ...current, avatar: { type: "preset", value: avatar.id } }))}
                            className={`relative h-14 w-14 overflow-hidden rounded-full border transition ${
                              active
                                ? "border-zinc-900 ring-2 ring-zinc-300 dark:border-white dark:ring-white/25"
                                : "border-zinc-200 hover:-translate-y-0.5 hover:border-zinc-400 dark:border-white/10 dark:hover:border-white/30"
                            }`}
                            aria-label={`Choose ${avatar.label}`}
                            title={avatar.label}
                          >
                            {url ? <img src={url} alt={avatar.label} className="h-full w-full object-cover" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="overflow-hidden rounded-[1.8rem] border border-zinc-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]">
              <div className="border-b border-zinc-200 px-6 py-5 dark:border-white/10">
                <div className="text-sm font-semibold text-zinc-950 dark:text-white">Personal information</div>
              </div>

              <div className="divide-y divide-zinc-200 dark:divide-white/10">
                <div className="flex items-center justify-between gap-4 px-6 py-5">
                  <div>
                    <div className="text-sm font-semibold text-zinc-950 dark:text-white">Google account</div>
                    <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{session.user?.email}</div>
                  </div>
                  <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
                    Connected
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 px-6 py-5">
                  <div>
                    <div className="text-sm font-semibold text-zinc-950 dark:text-white">School</div>
                    <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      {state.school === "UIC" ? "University of Illinois Chicago" : state.school}
                    </div>
                  </div>
                  <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300">
                    UIC
                  </div>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[1.8rem] border border-zinc-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)]">
              <div className="border-b border-zinc-200 px-6 py-5 dark:border-white/10">
                <div className="text-sm font-semibold text-zinc-950 dark:text-white">Appearance</div>
              </div>

              <div className="divide-y divide-zinc-200 dark:divide-white/10">
                <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-zinc-950 dark:text-white">Theme</div>
                    <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      Dark, light, or automatic. Auto uses light from 7 AM to 7 PM. My School stays dark-only.
                    </div>
                  </div>
                  <select
                    value={state.themeMode}
                    onChange={(event) => setState((current) => ({ ...current, themeMode: event.target.value as ThemeMode }))}
                    className="h-11 rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                  >
                    <option value="auto">Auto</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
              </div>
            </section>

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
        </div>

        {message ? (
          <div className="fixed bottom-5 right-5 z-50 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-[0_18px_45px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[rgba(18,18,23,0.94)] dark:text-white">
            {message}
          </div>
        ) : null}
      </div>
    </main>
  );
}
