"use client";

import Link from "next/link";
import Image from "next/image";
import { BookOpen, Menu, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const searchRoute = `${pathname}?${searchParams.toString()}`;
  const [searchDraft, setSearchDraft] = useState({ route: "", value: "" });
  const studySearch = searchDraft.route === searchRoute ? searchDraft.value : searchParams.get("query") || "";
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileHeaderRef = useRef<HTMLElement | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!mobileHeaderRef.current?.contains(event.target as Node)) setMobileMenuOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [mobileMenuOpen]);

  const searchStudyMaterials = (value: string) => {
    setSearchDraft({ route: searchRoute, value });
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      const query = value.trim();
      router.push(query ? `/study?query=${encodeURIComponent(query)}` : "/study");
    }, 220);
  };

  const mobileMenuButton = (dark = false) => (
    <button
      type="button"
      onClick={() => setMobileMenuOpen((current) => !current)}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${
        dark
          ? "border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
          : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-zinc-100 dark:hover:bg-white/10"
      }`}
      aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
      aria-expanded={mobileMenuOpen}
      aria-controls="mobile-site-navigation"
    >
      {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
    </button>
  );

  const mobileNavigation = (dark = false) => mobileMenuOpen ? (
    <nav
      id="mobile-site-navigation"
      aria-label="Primary navigation"
      className="mt-3 grid md:hidden"
    >
      <div>
        <div className={`grid grid-cols-2 gap-2 rounded-2xl border p-2 ${dark ? "border-white/10 bg-white/4" : "border-zinc-200 bg-zinc-50/90 dark:border-white/10 dark:bg-white/4"}`}>
          {[
            { href: "/courses", label: "Courses", accent: "" },
            { href: "/professors", label: "Professors", accent: "" },
            { href: "/study", label: "My School", accent: "indigo" },
            { href: "/chat", label: "SparkyAI", accent: "red" },
          ].map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                  active
                    ? item.accent === "indigo"
                      ? "bg-indigo-600 text-white"
                      : item.accent === "red"
                        ? "bg-red-600 text-white"
                        : dark
                          ? "bg-white text-zinc-950"
                          : "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950"
                    : dark
                      ? "text-zinc-200 hover:bg-white/8 hover:text-white"
                      : "text-zinc-700 hover:bg-white hover:text-zinc-950 dark:text-zinc-200 dark:hover:bg-white/8 dark:hover:text-white"
                }`}
              >
                {item.accent === "indigo" ? <BookOpen className="h-4 w-4" aria-hidden="true" /> : null}
                {item.accent === "red" ? <Image src="/sparky-icon.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" aria-hidden="true" /> : null}
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  ) : null;

  if (inStudyShell) {
    return (
      <header ref={mobileHeaderRef} className="sticky top-0 z-50 border-b border-white/10 bg-[rgba(8,13,24,0.94)] backdrop-blur-md">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3 md:hidden">
            <Link href="/" className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-1 py-1 transition hover:opacity-85">
              <Image src="/atlas-navbar-mark.png" alt="UIChicago" width={40} height={40} className="h-10 w-10 shrink-0 object-contain drop-shadow-[0_6px_18px_rgba(99,102,241,0.24)]" />
              <span className="hidden truncate text-[15px] font-bold leading-none tracking-[-0.035em] text-zinc-50 min-[360px]:block">UIChicago</span>
            </Link>
            <NavbarAuthControls />
            {mobileMenuButton(true)}
          </div>

          <div className="relative mt-3 md:hidden">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={studySearch}
              onChange={(event) => searchStudyMaterials(event.target.value)}
              placeholder="Search notes & flashcards..."
              aria-label="Search notes and flashcards"
              className="h-11 w-full rounded-xl border border-white/10 bg-white/4 pl-10 pr-4 text-sm text-white outline-none placeholder:text-zinc-500 transition focus:border-indigo-500/35 focus:bg-white/6"
            />
          </div>
          {mobileNavigation(true)}

          <div className="hidden items-center gap-3 md:flex">
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
              onChange={(event) => searchStudyMaterials(event.target.value)}
              placeholder="Search notes & flashcards..."
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
              <BookOpen className={`h-4 w-4 ${onStudy ? "text-white" : "text-violet-300"}`} aria-hidden="true" />
              <span>My School</span>
            </Link>

            <Link
              href="/chat"
              className={`group inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold tracking-wide transition-all sm:text-sm ${
                onChat
                  ? "border-red-500 bg-red-600 text-white shadow-[0_0_24px_rgba(239,68,68,0.22)]"
                  : "border-red-500/20 bg-red-500/[0.07] text-zinc-100 shadow-sm hover:border-red-400/40 hover:bg-red-500/10 hover:text-white"
              }`}
            >
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${onChat ? "bg-white/12" : "bg-red-500/10"}`}>
                <Image src="/sparky-icon.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" aria-hidden="true" />
              </span>
              <span>SparkyAI</span>
            </Link>
          </div>

          <div className="shrink-0">
            <NavbarAuthControls />
          </div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header ref={mobileHeaderRef} className="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur-md dark:border-white/8 dark:bg-[rgba(9,10,14,0.88)]">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-3 sm:px-6">
        <div className="md:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-1 py-1 transition hover:opacity-85"
            >
              <Image
                src="/atlas-navbar-mark.png"
                alt="UIChicago"
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 object-contain drop-shadow-[0_6px_18px_rgba(239,68,68,0.18)]"
              />
              <span className="hidden truncate text-[15px] font-bold leading-none tracking-[-0.035em] text-zinc-950 min-[360px]:block dark:text-zinc-50">
                UIChicago
              </span>
            </Link>

            <div className="flex shrink-0 items-center gap-2">
              <NavbarAuthControls />
              {mobileMenuButton()}
            </div>
          </div>

          <div className="mt-3">
            <HeroSearch compact />
          </div>

          {mobileNavigation()}
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
              <BookOpen className={`h-4 w-4 ${onStudy ? "text-white" : "text-violet-500 dark:text-violet-300"}`} aria-hidden="true" />
              <span>My School</span>
            </Link>

            <Link
              href="/chat"
              className={`group flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold tracking-wide transition-all sm:text-sm ${
                onChat
                  ? "border-red-500 bg-red-600 text-white shadow-[0_0_24px_rgba(239,68,68,0.22)]"
                  : "border-red-200/80 bg-red-50/70 text-zinc-900 shadow-sm hover:border-red-300 hover:bg-red-50 dark:border-red-500/20 dark:bg-red-500/[0.07] dark:text-zinc-100 dark:hover:border-red-400/40 dark:hover:bg-red-500/10"
              }`}
            >
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${onChat ? "bg-white/12" : "bg-red-500/10"}`}>
                <Image src="/sparky-icon.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" aria-hidden="true" />
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
