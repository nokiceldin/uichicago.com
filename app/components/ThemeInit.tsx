"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { DEFAULT_THEME_MODE, DEFAULT_THEME_SCHEDULE, SETTINGS_STORAGE_KEY, THEME_STORAGE_KEY, resolveEffectiveTheme, shouldForceDarkTheme } from "@/lib/site-settings";
import type { SiteSettingsPayload } from "@/lib/study/profile";

function readStoredThemeSettings(): SiteSettingsPayload {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) {
      return {
        themeMode: DEFAULT_THEME_MODE,
        themeSchedule: DEFAULT_THEME_SCHEDULE,
      };
    }

    const parsed = JSON.parse(raw) as SiteSettingsPayload;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function applyDocumentTheme(pathname: string | null, settings?: SiteSettingsPayload) {
  const root = document.documentElement;
  const forcedDark = shouldForceDarkTheme(pathname);
  const effective = forcedDark ? "dark" : resolveEffectiveTheme(settings);

  root.dataset.themeMode = settings?.themeMode ?? DEFAULT_THEME_MODE;
  root.dataset.themeEffective = effective;

  if (effective === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export default function ThemeInit() {
  const pathname = usePathname();

  useEffect(() => {
    const syncTheme = () => {
      applyDocumentTheme(pathname, readStoredThemeSettings());
    };

    syncTheme();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const intervalId = window.setInterval(syncTheme, 60_000);
    media.addEventListener("change", syncTheme);
    window.addEventListener("storage", syncTheme);
    window.addEventListener("uichicago-theme-change", syncTheme as EventListener);

    return () => {
      window.clearInterval(intervalId);
      media.removeEventListener("change", syncTheme);
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("uichicago-theme-change", syncTheme as EventListener);
    };
  }, [pathname]);

  return null;
}
