// app/components/ThemeToggle.tsx
"use client"

import { useEffect, useState } from "react"
import { DEFAULT_THEME_SCHEDULE, THEME_STORAGE_KEY } from "@/lib/site-settings";

type Theme = "light" | "dark"

function applyTheme(next: Theme) {
  if (next === "dark") document.documentElement.classList.add("dark")
  else document.documentElement.classList.remove("dark")
  localStorage.setItem(
    THEME_STORAGE_KEY,
    JSON.stringify({
      themeMode: next,
      themeSchedule: DEFAULT_THEME_SCHEDULE,
    }),
  )
  window.dispatchEvent(new Event("uichicago-theme-change"))
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") {
      return "light"
    }

    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    const saved = raw ? JSON.parse(raw)?.themeMode : null
    if (saved === "dark" || saved === "light") {
      return saved
    }

    const isDark = document.documentElement.classList.contains("dark")
    return isDark ? "dark" : "light"
  })

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark"
    setTheme(next)
    applyTheme(next)
  }

  const dark = theme === "dark"

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-xs font-bold tracking-widest text-zinc-500 dark:text-zinc-400 lg:block">
  {dark ? "" : ""}
</span>

      <button
        type="button"
        role="switch"
        aria-checked={dark}
        aria-label="Toggle dark mode"
        onClick={toggle}
        className={[
          "relative inline-flex h-10 w-24 items-center rounded-full border p-1 transition",
          "bg-white/70 border-zinc-200 dark:bg-zinc-900/60 dark:border-white/10",
          "shadow-sm backdrop-blur",
          "focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-white/15",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-1 left-1 h-8 w-12 rounded-full transition-transform",
            "bg-indigo-600 shadow-md",
            dark ? "translate-x-10" : "translate-x-0",
          ].join(" ")}
        />

        <span className="relative z-10 flex h-8 w-12 items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className={["h-5 w-5 transition", dark ? "text-zinc-400" : "text-white"].join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="M4.93 4.93l1.41 1.41" />
            <path d="M17.66 17.66l1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="M4.93 19.07l1.41-1.41" />
            <path d="M17.66 6.34l1.41-1.41" />
          </svg>
        </span>

        <span className="relative z-10 flex h-8 w-12 items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className={["h-5 w-5 transition", dark ? "text-white" : "text-zinc-400"].join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
          </svg>
        </span>
      </button>
    </div>
  )
}
