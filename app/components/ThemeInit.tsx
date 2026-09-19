"use client";

import { useEffect } from "react";
import { DEFAULT_THEME_MODE, SETTINGS_STORAGE_KEY, THEME_STORAGE_KEY, resolveEffectiveTheme } from "@/lib/site-settings";
import type { SiteSettingsPayload } from "@/lib/study/profile";

function readStoredThemeSettings(): SiteSettingsPayload {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) {
      return {
        themeMode: DEFAULT_THEME_MODE,
      };
    }

    const parsed = JSON.parse(raw) as SiteSettingsPayload;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function applyDocumentTheme(settings?: SiteSettingsPayload) {
  const root = document.documentElement;
  const effective = resolveEffectiveTheme(settings);

  root.dataset.themeMode = effective;
  root.dataset.themeEffective = effective;

  if (effective === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export default function ThemeInit() {
  useEffect(() => {
    const syncTheme = () => {
      applyDocumentTheme(readStoredThemeSettings());
    };

    syncTheme();

    window.addEventListener("storage", syncTheme);
    window.addEventListener("uichicago-theme-change", syncTheme as EventListener);

    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("uichicago-theme-change", syncTheme as EventListener);
    };
  }, []);

  return null;
}
