"use client";

import Link from "next/link";
import Image from "next/image";
import ThemeToggle from "./ThemeToggle";
import { usePathname } from "next/navigation";
import HeroSearch from "./HeroSearch";

export default function Navbar() {
  const pathname = usePathname();
  const isHome = pathname === "/";

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
          <span className="absolute inset-x-0 -bottom-[13px] h-[2px] rounded-full bg-red-500" />
        )}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur-md dark:border-white/8 dark:bg-zinc-950/95">
      <div className="flex w-full items-center gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex min-w-0 shrink-0 items-center gap-3 rounded-xl px-1 py-1 transition hover:opacity-85"
        >
          <Image
            src="/sparky-icon.png"
alt="UIC Sparky"
            width={34}
            height={34}
            className="h-9 w-9 shrink-0 sm:h-10 sm:w-10"
          />
          <span className="max-w-[110px] text-[15px] font-semibold tracking-[-0.025em] text-zinc-950 sm:max-w-none sm:text-[17px] dark:text-zinc-50">
  UIC Sparky
</span>
        </Link>

        <div className="flex-1 max-w-lg ml-auto mr-4">
  <HeroSearch compact />
</div>

        <nav className="ml-auto flex shrink-0 items-center gap-4 sm:gap-6 md:gap-8">
          {navLink("/courses", "Courses")}
          {navLink("/professors", "Professors")}

          <Link
  href="/chat"
  className={`group flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-bold tracking-wide transition-all sm:text-sm ${
  pathname.startsWith("/chat")
    ? "border-red-500 bg-red-600 text-white"
    : "border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white"
}`}
>
  <span className="relative flex h-2 w-2">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
  </span>
  <span>Sparky</span>
  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black tracking-widest ${
    pathname.startsWith("/chat")
      ? "bg-white/20 text-white"
      : "bg-red-500/20 text-red-600 dark:text-red-400"
  }`}>
    AI
  </span>
</Link>
        </nav>
        <div className="ml-1 shrink-0 sm:ml-2">
            <ThemeToggle />
          </div>
      </div>
    </header>
  );
}