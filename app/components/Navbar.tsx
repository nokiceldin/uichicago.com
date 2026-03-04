// app/components/Navbar.tsx
"use client"
import Link from "next/link"
import Image from "next/image"
import ThemeToggle from "./ThemeToggle"
import { usePathname } from "next/navigation"

export default function Navbar() {
  const pathname = usePathname()

  const baseBtn =
    "rounded-xl border px-4 py-2 text-sm font-semibold transition"

  const active =
    "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white/10 dark:text-zinc-100"

  const inactive =
    "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10"

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-950 backdrop-blur">
      <div className="flex w-full items-center justify-between px-6 py-3">
        <Link
          href="/professors"
          className="flex items-center gap-3 rounded-xl px-2 py-1 hover:bg-zinc-100/60 dark:hover:bg-white/10"
        >
          <Image src="/logo.png" alt="UICProf" width={28} height={28} />
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            UICProf
          </span>
        </Link>

        <nav className="flex items-center gap-6">
  <Link
    href="/professors"
    className={`relative px-2 py-1 text-sm font-semibold transition ${
      pathname.startsWith("/professors")
        ? "text-zinc-900 dark:text-white"
        : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
    }`}
  >
    Professors
    {pathname.startsWith("/professors") && (
      <span className="absolute left-0 right-0 -bottom-2 h-[2px] rounded-full bg-emerald-400" />
    )}
  </Link>

  <Link
    href="/courses"
    className={`relative px-2 py-1 text-sm font-semibold transition ${
      pathname.startsWith("/courses")
        ? "text-zinc-900 dark:text-white"
        : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
    }`}
  >
    Courses
    {pathname.startsWith("/courses") && (
      <span className="absolute left-0 right-0 -bottom-2 h-[2px] rounded-full bg-emerald-400" />
    )}
  </Link>

  <div className="ml-4">
    <ThemeToggle />
  </div>
</nav>
      </div>
    </header>
  )
}