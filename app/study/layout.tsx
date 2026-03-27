"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  FileText,
  Folder,
  FolderPlus,
  Home,
  Menu,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { DEFAULT_STUDY_LIBRARY } from "@/lib/study/sample-data";
import type { StudyLibraryState } from "@/lib/study/types";

const STORAGE_KEY = "uic-atlas-study-library-v1";
const CUSTOM_FOLDERS_KEY = "uic-atlas-study-custom-folders-v1";
const SIDEBAR_EXPANDED_KEY = "uic-atlas-study-sidebar-expanded-v1";

function normalizeFolderLabel(value: string) {
  return value.trim() || "General";
}

export default function StudyLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [library, setLibrary] = useState<StudyLibraryState>(DEFAULT_STUDY_LIBRARY);
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [searchDraft, setSearchDraft] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StudyLibraryState;
      setLibrary({
        sets: parsed.sets ?? DEFAULT_STUDY_LIBRARY.sets,
        groups: parsed.groups ?? DEFAULT_STUDY_LIBRARY.groups,
        notes: parsed.notes ?? DEFAULT_STUDY_LIBRARY.notes,
        noteAudioSessions: parsed.noteAudioSessions ?? DEFAULT_STUDY_LIBRARY.noteAudioSessions,
        noteAiLogs: parsed.noteAiLogs ?? DEFAULT_STUDY_LIBRARY.noteAiLogs,
        progress: parsed.progress ?? DEFAULT_STUDY_LIBRARY.progress,
        sessions: parsed.sessions ?? DEFAULT_STUDY_LIBRARY.sessions,
        quizResults: parsed.quizResults ?? DEFAULT_STUDY_LIBRARY.quizResults,
      });
    } catch {
      setLibrary(DEFAULT_STUDY_LIBRARY);
    }

    try {
      const rawFolders = window.localStorage.getItem(CUSTOM_FOLDERS_KEY);
      if (!rawFolders) return;
      const parsedFolders = JSON.parse(rawFolders);
      setCustomFolders(Array.isArray(parsedFolders) ? parsedFolders : []);
    } catch {
      setCustomFolders([]);
    }

    try {
      const rawExpanded = window.localStorage.getItem(SIDEBAR_EXPANDED_KEY);
      if (rawExpanded != null) {
        setSidebarExpanded(rawExpanded === "true");
      }
    } catch {
      setSidebarExpanded(true);
    }
  }, []);

  useEffect(() => {
    setSearchDraft(searchParams.get("query") || "");
  }, [searchParams]);

  useEffect(() => {
    window.localStorage.setItem(CUSTOM_FOLDERS_KEY, JSON.stringify(customFolders));
  }, [customFolders]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(sidebarExpanded));
  }, [sidebarExpanded]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextQuery = searchDraft.trim();
      const currentQuery = (searchParams.get("query") || "").trim();
      if (nextQuery === currentQuery) return;
      const params = new URLSearchParams();
      if (nextQuery) params.set("query", nextQuery);
      const currentView = searchParams.get("view");
      if (currentView) params.set("view", currentView);
      const currentMode = searchParams.get("mode");
      if (currentMode) params.set("mode", currentMode);
      const currentScreen = searchParams.get("screen");
      if (currentScreen) params.set("screen", currentScreen);
      const selectedFolder = searchParams.get("folder");
      if (selectedFolder) params.set("folder", selectedFolder);
      router.push(`/study${params.toString() ? `?${params.toString()}` : ""}`);
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [router, searchDraft, searchParams]);

  useEffect(() => {
    const close = () => setPlusOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const selectedFolder = searchParams.get("folder") || "";
  const currentView = searchParams.get("view") || "home";
  const currentMode = searchParams.get("mode");
  const currentScreen = searchParams.get("screen");
  const onStudyHome = pathname === "/study" && currentView !== "library" && !currentMode && !currentScreen && !selectedFolder;
  const onLibrary = pathname === "/study" && (currentView === "library" || Boolean(selectedFolder));
  const onNotes = pathname === "/study" && currentMode === "notes";
  const onGroups = pathname === "/study" && currentScreen === "groups";
  const onFlashcards = pathname === "/study" && currentMode === "flashcards" && currentScreen !== "groups";
  const onStudyGuides = pathname === "/study/create";

  const folders = useMemo(() => {
    const values = [
      ...customFolders,
      ...library.sets
        .map((set) => normalizeFolderLabel(set.course || set.subject))
        .filter((value) => value !== "General"),
    ];
    return Array.from(new Set(values)).filter(Boolean).slice(0, 10);
  }, [customFolders, library.sets]);

  const closeMenu = () => setMenuOpen(false);
  const openFromPlus = (href: string) => {
    setPlusOpen(false);
    router.push(href);
  };

  const createFolder = () => {
    const next = folderDraft.trim();
    if (!next) return;
    setCustomFolders((current) => (current.includes(next) ? current : [next, ...current]));
    setCreateFolderOpen(false);
    setFolderDraft("");
    setPlusOpen(false);
    router.push(`/study?folder=${encodeURIComponent(next)}`);
  };

  const navItems = [
    { href: "/study", label: "Home", icon: <Home className="h-4 w-4" />, active: onStudyHome },
    { href: "/study?view=library", label: "Your library", icon: <BookOpen className="h-4 w-4" />, active: onLibrary },
    { href: "/study?screen=groups", label: "Study groups", icon: <Users className="h-4 w-4" />, active: onGroups },
  ];

  const studyItems = [
    { href: "/study?mode=flashcards", label: "Flashcards", icon: <BookOpen className="h-4 w-4" />, active: onFlashcards },
    { href: "/study?mode=notes", label: "Notes", icon: <FileText className="h-4 w-4" />, active: onNotes },
    { href: "/study/create", label: "Study guides", icon: <Sparkles className="h-4 w-4" />, active: onStudyGuides },
  ];

  const plusMenu = (
    <div
      onClick={(event) => event.stopPropagation()}
      className="absolute right-0 top-14 z-50 w-[280px] rounded-[1.75rem] border border-white/12 bg-[#16123f] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
    >
      <button onClick={() => openFromPlus("/study/create")} className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left text-xl font-semibold text-white transition hover:bg-white/[0.05]">
        <BookOpen className="h-6 w-6" />
        Flashcard set
      </button>
      <button onClick={() => openFromPlus("/study/create")} className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left text-xl font-semibold text-white transition hover:bg-white/[0.05]">
        <Sparkles className="h-6 w-6" />
        Study guide
      </button>
      <button
        onClick={() => {
          setPlusOpen(false);
          setCreateFolderOpen(true);
        }}
        className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left text-xl font-semibold text-white transition hover:bg-white/[0.05]"
      >
        <Folder className="h-6 w-6" />
        Folder
      </button>
      <button onClick={() => openFromPlus("/study?screen=groups")} className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left text-xl font-semibold text-white transition hover:bg-white/[0.05]">
        <Users className="h-6 w-6" />
        Study group
      </button>
    </div>
  );

  const renderSidebarItem = (
    item: { href: string; label: string; icon: React.ReactNode; active: boolean },
    compact: boolean,
    onClick?: () => void,
    badge?: React.ReactNode,
  ) => (
    <Link
      key={item.label}
      href={item.href}
      onClick={onClick}
      title={compact ? item.label : undefined}
      className={`group flex items-center rounded-xl text-sm font-medium transition ${
        compact ? "justify-center px-2 py-3" : "gap-3 px-3 py-2.5"
      } ${
        item.active
          ? "bg-white/[0.12] text-white"
          : "text-zinc-300 hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      <span className="shrink-0">{item.icon}</span>
      {!compact ? <span className="truncate">{item.label}</span> : null}
      {!compact && badge ? <span className="ml-auto shrink-0">{badge}</span> : null}
    </Link>
  );

  const sidebarContent = (compact: boolean, mobile = false) => (
    <>
      <div className={`flex items-center px-3 py-2 ${compact ? "justify-center" : "gap-3"}`}>
        <button
          type="button"
          onClick={() => setMenuOpen(false)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/[0.06] hover:text-white lg:hidden"
          aria-label="Close study menu"
        >
          <X className="h-5 w-5" />
        </button>
        <Link
          href="/"
          onClick={closeMenu}
          title={compact ? "Go to main website homepage" : undefined}
          className={`inline-flex items-center rounded-xl px-2 py-1 text-white transition hover:bg-white/[0.05] ${
            compact ? "justify-center" : "gap-3"
          }`}
          aria-label="Go to main website homepage"
        >
          <Image
            src="/atlas-navbar-mark.png"
            alt="UIChicago"
            width={36}
            height={36}
            className="h-9 w-9 object-contain"
          />
          {!compact ? (
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-sm font-semibold text-white">UIChicago</div>
            <div className="text-[11px] text-zinc-400">Back to website homepage</div>
          </div>
          ) : null}
        </Link>
      </div>

      <div className="mt-5 space-y-1 px-3">
        {navItems.map((item) => renderSidebarItem(item, compact, mobile ? closeMenu : undefined))}
      </div>

      <div className="mx-3 mt-6 border-t border-white/10 pt-5">
        {!compact ? (
          <div className="px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            Your folders
          </div>
        ) : (
          <div className="mx-auto h-px w-7 bg-white/12" />
        )}
        <div className="mt-3 space-y-1">
          {folders.length ? (
            folders.map((folder) => (
              <Link
                key={folder}
                href={`/study?folder=${encodeURIComponent(folder)}`}
                onClick={mobile ? closeMenu : undefined}
                title={compact ? folder : undefined}
                className={`flex items-center rounded-lg text-sm transition ${
                  compact ? "justify-center px-2 py-3" : "gap-3 px-3 py-2"
                } ${
                  selectedFolder === folder
                    ? "bg-white/[0.12] text-white"
                    : "text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                <Folder className="h-4 w-4 text-zinc-500" />
                {!compact ? <span className="truncate">{folder}</span> : null}
              </Link>
            ))
          ) : (
            !compact ? <div className="px-3 py-2 text-sm text-zinc-500">No folders yet.</div> : null
          )}
          <button
            type="button"
            onClick={() => {
              setCreateFolderOpen(true);
              if (mobile) closeMenu();
            }}
            title={compact ? "New folder" : undefined}
            className={`flex w-full items-center rounded-lg text-sm text-zinc-200 transition hover:bg-white/[0.05] hover:text-white ${
              compact ? "justify-center px-2 py-3" : "gap-3 px-3 py-2"
            }`}
          >
            <FolderPlus className="h-4 w-4 text-zinc-300" />
            {!compact ? <span>New folder</span> : null}
          </button>
        </div>
      </div>

      <div className="mx-3 mt-6 border-t border-white/10 pt-5">
        {!compact ? (
          <div className="px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            Start here
          </div>
        ) : (
          <div className="mx-auto h-px w-7 bg-white/12" />
        )}
        <div className="mt-3 space-y-1">
          {studyItems.map((item) => renderSidebarItem(item, compact, mobile ? closeMenu : undefined))}
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#140f36] text-white">
      {createFolderOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 px-4"
          onClick={() => {
            setCreateFolderOpen(false);
            setFolderDraft("");
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[420px] rounded-[2rem] border border-white/12 bg-[#16123f] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.42)]"
          >
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05]">
                <Folder className="h-7 w-7 text-white" />
              </div>
            </div>
            <div className="mt-5 text-center text-2xl font-semibold text-white">Name your folder</div>
            <input
              autoFocus
              value={folderDraft}
              onChange={(event) => setFolderDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  createFolder();
                }
              }}
              placeholder="Exam 2 BIOS110"
              className="mt-5 h-12 w-full rounded-xl border border-white/12 bg-white/[0.06] px-4 text-white outline-none placeholder:text-zinc-500"
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCreateFolderOpen(false);
                  setFolderDraft("");
                }}
                className="rounded-full bg-white/[0.08] px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.12] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createFolder}
                disabled={!folderDraft.trim()}
                className="rounded-full bg-[#4f46e5] px-5 py-2.5 text-sm font-semibold text-white transition enabled:hover:bg-[#5d53f3] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <aside className={`fixed inset-y-0 left-0 z-40 hidden border-r border-white/10 bg-[#120d35] transition-[width] duration-300 ease-out lg:block ${sidebarExpanded ? "w-[248px]" : "w-[72px]"}`}>
        <div className="flex h-full flex-col pb-6 pt-5">
          {sidebarContent(!sidebarExpanded)}
        </div>
      </aside>

      <div
        className={`fixed inset-0 z-[70] transition lg:hidden ${menuOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!menuOpen}
      >
        <div
          onClick={() => setMenuOpen(false)}
          className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${menuOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-[270px] border-r border-white/10 bg-[#120d35] transition-transform duration-300 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex h-full flex-col pb-6 pt-5">
            {sidebarContent(false, true)}
          </div>
        </aside>
      </div>

      <div className={`transition-[padding-left] duration-300 ease-out ${sidebarExpanded ? "lg:pl-[248px]" : "lg:pl-[72px]"}`}>
        <header className="sticky top-0 z-30 border-b border-white/8 bg-[#140f36]/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/[0.06] hover:text-white lg:hidden"
              aria-label="Open study menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => setSidebarExpanded((current) => !current)}
              className="hidden h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition hover:bg-white/[0.06] hover:text-white lg:inline-flex"
              aria-label={sidebarExpanded ? "Collapse study sidebar" : "Expand study sidebar"}
              aria-expanded={sidebarExpanded}
            >
              <span className="relative flex h-4 w-5 flex-col justify-between">
                <span className={`block h-0.5 rounded-full bg-current transition-all duration-300 ${sidebarExpanded ? "w-5" : "w-5"}`} />
                <span className={`block h-0.5 rounded-full bg-current transition-all duration-300 ${sidebarExpanded ? "w-4" : "w-5"}`} />
                <span className={`block h-0.5 rounded-full bg-current transition-all duration-300 ${sidebarExpanded ? "w-5" : "w-5"}`} />
              </span>
            </button>

            <div className="relative w-full max-w-[540px] lg:mx-auto">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Find it faster with a search"
                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-500"
              />
            </div>

            <div className="relative flex items-center gap-3">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setPlusOpen((current) => !current);
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#4f46e5] text-white"
                aria-label="Create"
              >
                <Plus className="h-5 w-5" />
              </button>
              {plusOpen ? plusMenu : null}
            </div>
          </div>
        </header>

        <div className="px-4 py-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
