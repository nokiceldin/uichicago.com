// app/components/ThemeInit.tsx
"use client"

import { useEffect } from "react"

export default function ThemeInit() {
  useEffect(() => {
    const saved = localStorage.getItem("theme")

    if (saved === "dark") {
      document.documentElement.classList.add("dark")
      return
    }

    if (saved === "light") {
      document.documentElement.classList.remove("dark")
      return
    }

    // No saved preference — default to dark mode
    document.documentElement.classList.add("dark")
  }, [])

  return null
}