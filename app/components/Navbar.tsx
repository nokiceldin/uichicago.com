"use client";

import Link from "next/link";
import Image from "next/image";
import ThemeToggle from "./ThemeToggle";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const navLink = (href: string, label: string) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`relative px-1 py-1 text-xs font-semibold transition-colors sm:px-2 sm:text-sm ${
          active
            ? "text-zinc-900 dark:text-white"
            : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
        }`}
      >
        {label}
        {active && (
          <span className="absolute inset-x-0 -bottom-[13px] h-[2px] rounded-full bg-emerald-500" />
        )}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur-md dark:border-white/8 dark:bg-zinc-950/95">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 rounded-xl px-1 py-1 transition hover:opacity-80"
        >
          <Image
            src="/logo.png"
            alt="UIC Ratings"
            width={34}
            height={34}
            className="h-8 w-8 shrink-0 sm:h-9 sm:w-9"
          />
          <span className="max-w-[88px] text-[11px] font-bold leading-tight text-zinc-900 sm:max-w-none sm:text-sm dark:text-zinc-100">
            UIC Ratings
          </span>
        </Link>

        <nav className="ml-2 flex items-center gap-4 sm:ml-4 sm:gap-6 md:gap-8">
          {navLink("/courses", "Courses")}
          {navLink("/professors", "Professors")}
          <div className="ml-1 shrink-0 sm:ml-2">
            <ThemeToggle />
          </div>
        </nav>
      </div>
    </header>
  );
}