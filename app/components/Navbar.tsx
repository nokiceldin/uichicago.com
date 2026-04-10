"use client";

import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import HeroSearch from "./HeroSearch";
import NavbarAuthControls from "./auth/NavbarAuthControls";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const onStudy = pathname.startsWith("/study");
  const onChat = pathname.startsWith("/chat");
  const inStudyShell = pathname.startsWith("/study");
  const [studySearch, setStudySearch] = useState("");

  const navLink = (href: string, label: string) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`rounded-full px-3 py-2 text-xs font-semibold transition-all sm:text-sm ${
          active
            ? "bg-white text-zinc-950 shadow-sm dark:bg-white/10 dark:text-white"
            : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/6 dark:hover:text-zinc-100"
        }`}
      >
        {label}
      </Link>
    );
  };

  const studyNavLink = (href: string, label: string) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`rounded-full px-3 py-2 text-xs font-semibold transition-all sm:text-sm ${
          active
            ? "bg-white text-zinc-950 shadow-sm"
            : "text-zinc-300 hover:bg-white/8 hover:text-white"
        }`}
      >
        {label}
      </Link>
    );
  };

  useEffect(() => {
    if (!inStudyShell) return;

    const timeout = window.setTimeout(() => {
      const nextQuery = studySearch.trim();
      const currentQuery = (searchParams.get("query") || "").trim();
      if (nextQuery === currentQuery) return;

      const params = new URLSearchParams(searchParams.toString());
      if (nextQuery) {
        params.set("query", nextQuery);
      } else {
        params.delete("query");
      }

      router.push(`/study${params.toString() ? `?${params.toString()}` : ""}`);
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [inStudyShell, router, searchParams, studySearch]);

  if (inStudyShell) {
    return (
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[rgba(8,13,24,0.94)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex min-w-0 shrink-0 items-center gap-3 rounded-2xl px-1 py-1 transition hover:opacity-85"
          >
            <Image
              src="/atlas-navbar-mark.png"
              alt="UIChicago"
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 object-contain drop-shadow-[0_6px_18px_rgba(99,102,241,0.24)]"
            />
            <span className="max-w-[120px] text-[15px] font-bold leading-none tracking-[-0.035em] text-zinc-50 sm:max-w-none sm:text-[17px]">
              UIChicago
            </span>
          </Link>

          <div className="relative hidden min-w-0 flex-1 lg:block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={studySearch}
              onChange={(event) => setStudySearch(event.target.value)}
              placeholder="Search your library..."
              className="h-10 w-full rounded-xl border border-white/10 bg-white/4 pl-10 pr-4 text-sm text-white outline-none placeholder:text-zinc-500 transition focus:border-indigo-500/35 focus:bg-white/6"
            />
          </div>

          <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/4 p-1 shadow-sm md:flex">
            {studyNavLink("/courses", "Courses")}
            {studyNavLink("/professors", "Professors")}
          </nav>

          <div className="hide-scroll ml-auto flex items-center gap-2 overflow-x-auto pb-1 md:ml-0 md:overflow-visible md:pb-0">
            <Link
              href="/study"
              className={`group inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold tracking-wide transition-all sm:text-sm ${
                onStudy
                  ? "border-indigo-500 bg-indigo-600 text-white shadow-[0_0_24px_rgba(99,102,241,0.24)]"
                  : "border-white/10 bg-white/5 text-zinc-100 shadow-sm hover:border-indigo-400/40 hover:bg-white/8 hover:text-white"
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
              </span>
              <span>My School</span>
            </Link>

            <Link
              href="/chat"
              className={`group inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold tracking-wide transition-all sm:text-sm ${
                onChat
                  ? "border-red-500 bg-red-600 text-white shadow-[0_0_24px_rgba(239,68,68,0.22)]"
                  : "border-white/10 bg-white/5 text-zinc-100 shadow-sm hover:border-red-400/40 hover:bg-white/8 hover:text-white"
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              <span>SparkyAI</span>
            </Link>
          </div>

          <div className="shrink-0">
            <NavbarAuthControls />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur-md dark:border-white/8 dark:bg-[rgba(9,10,14,0.88)]">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-3 sm:px-6">
        <div className="md:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className="flex min-w-0 items-center gap-3 rounded-2xl px-1 py-1 transition hover:opacity-85"
            >
              <Image
                src="/atlas-navbar-mark.png"
                alt="UIChicago"
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 object-contain drop-shadow-[0_6px_18px_rgba(239,68,68,0.18)]"
              />
              <span className="truncate text-[15px] font-bold leading-none tracking-[-0.035em] text-zinc-950 dark:text-zinc-50">
                UIChicago
              </span>
            </Link>

            <div className="shrink-0">
              <NavbarAuthControls />
            </div>
          </div>

          <div className="mt-3">
            <HeroSearch compact />
          </div>

          <div className="hide-scroll mt-3 flex items-center gap-2 overflow-x-auto pb-1">
            <nav className="flex items-center gap-2">
              {navLink("/courses", "Courses")}
              {navLink("/professors", "Professors")}
            </nav>

            <Link
              href="/study"
              className={`group inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold tracking-wide transition-all ${
                onStudy
                  ? "border-indigo-500 bg-indigo-600 text-white shadow-[0_0_24px_rgba(99,102,241,0.22)]"
                  : "border-zinc-200 bg-zinc-50 text-zinc-900 shadow-sm hover:border-indigo-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-indigo-400/30 dark:hover:bg-white/8 dark:hover:text-white"
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
              </span>
              <span>My School</span>
            </Link>

            <Link
              href="/chat"
              className={`group inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold tracking-wide transition-all ${
                onChat
                  ? "border-red-500 bg-red-600 text-white shadow-[0_0_24px_rgba(239,68,68,0.22)]"
                  : "border-zinc-200 bg-zinc-50 text-zinc-900 shadow-sm hover:border-red-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-red-400/30 dark:hover:bg-white/8 dark:hover:text-white"
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              <span>SparkyAI</span>
            </Link>
          </div>
        </div>

        <div className="hidden items-center gap-4 md:flex">
          <Link
            href="/"
            className="flex min-w-0 shrink-0 items-center gap-3 rounded-2xl px-1 py-1 transition hover:opacity-85"
          >
            <Image
              src="/atlas-navbar-mark.png"
              alt="UIChicago"
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 object-contain drop-shadow-[0_6px_18px_rgba(239,68,68,0.18)]"
            />
            <span className="max-w-[120px] text-[15px] font-bold leading-none tracking-[-0.035em] text-zinc-950 sm:max-w-none sm:text-[17px] dark:text-zinc-50">
              UIChicago
            </span>
          </Link>

          <div className="mx-auto flex-1 max-w-2xl">
            <HeroSearch compact />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <nav className="hidden items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50/90 p-1 shadow-sm dark:border-white/10 dark:bg-white/3 md:flex">
              {navLink("/courses", "Courses")}
              {navLink("/professors", "Professors")}
            </nav>

            <Link
              href="/study"
              className={`group flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold tracking-wide transition-all sm:text-sm ${
                onStudy
                  ? "border-indigo-500 bg-indigo-600 text-white shadow-[0_0_24px_rgba(99,102,241,0.22)]"
                  : "border-zinc-200 bg-zinc-50 text-zinc-900 shadow-sm hover:border-indigo-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-indigo-400/30 dark:hover:bg-white/8 dark:hover:text-white"
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
              </span>
              <span>My School</span>
            </Link>

            <Link
              href="/chat"
              className={`group flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold tracking-wide transition-all sm:text-sm ${
                onChat
                  ? "border-red-500 bg-red-600 text-white shadow-[0_0_24px_rgba(239,68,68,0.22)]"
                  : "border-zinc-200 bg-zinc-50 text-zinc-900 shadow-sm hover:border-red-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-red-400/30 dark:hover:bg-white/8 dark:hover:text-white"
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              <span>SparkyAI</span>
            </Link>

            <NavbarAuthControls />
          </div>
        </div>
      </div>
    </header>
  );
}
