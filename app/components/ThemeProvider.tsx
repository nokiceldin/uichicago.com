"use client";

import { DEFAULT_THEME_MODE, DEFAULT_THEME_SCHEDULE, THEME_STORAGE_KEY, resolveEffectiveTheme } from "@/lib/site-settings";
import type { SiteSettingsPayload } from "@/lib/study/profile";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function getSavedTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SiteSettingsPayload;
    return resolveEffectiveTheme(parsed);
  } catch {
    return null;
  }
}

export function saveTheme(theme: Theme) {
  window.localStorage.setItem(
    THEME_STORAGE_KEY,
    JSON.stringify({
      themeMode: theme,
      themeSchedule: DEFAULT_THEME_SCHEDULE,
    }),
  );
  applyTheme(theme);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme: Theme = getSavedTheme() ?? (DEFAULT_THEME_MODE === "dark" ? "dark" : "light");
  applyTheme(theme);
  return <>{children}</>;
}
