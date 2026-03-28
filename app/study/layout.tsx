"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  BookOpen,
  ChevronDown,
  FileText,
  Folder,
  Home,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  Users,
  X,
  LogOut,
} from "lucide-react";
import { DEFAULT_STUDY_LIBRARY } from "@/lib/study/sample-data";
import type { StudyLibraryState } from "@/lib/study/types";
import { getPresetAvatarUrl, readLocalSiteSettings, resolveAvatarUrl } from "@/lib/site-settings";

const STORAGE_KEY = "uic-atlas-study-library-v1";
const CUSTOM_FOLDERS_KEY = "uic-atlas-study-custom-folders-v1";
const SIDEBAR_EXPANDED_KEY = "uic-atlas-study-sidebar-expanded-v1";

function normalizeFolderPath(value: string) {
  return value
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}

function folderLabelFromPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

function parentFolderPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "";
}

function resolveSetFolder(set: StudyLibraryState["sets"][number]) {
  return normalizeFolderPath(set.folder || set.course || set.subject || "");
}

function resolveNoteFolder(note: StudyLibraryState["notes"][number]) {
  return normalizeFolderPath(note.folder || note.course || note.subject || "");
}

function isFolderOrDescendant(path: string, candidate: string) {
  return candidate === path || candidate.startsWith(`${path}/`);
}

export default function StudyLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const [folderParent, setFolderParent] = useState("");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [library, setLibrary] = useState<StudyLibraryState>(DEFAULT_STUDY_LIBRARY);
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [searchDraft, setSearchDraft] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState<string | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(() => {
    const localSettings = typeof window !== "undefined" ? readLocalSiteSettings() : {};
    return resolveAvatarUrl(localSettings.avatar, session?.user?.image ?? null);
  });
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

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
      setCustomFolders(
        Array.isArray(parsedFolders)
          ? parsedFolders.map((entry) => normalizeFolderPath(String(entry))).filter(Boolean)
          : [],
      );
    } catch {
      setCustomFolders([]);
    }

    try {
      const rawExpanded = window.localStorage.getItem(SIDEBAR_EXPANDED_KEY);
      if (rawExpanded != null) {
        setSidebarExpanded(rawExpanded === "true");
      }
    } catch {
      setSidebarExpanded(false);
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

  useEffect(() => {
    if (!profileMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [profileMenuOpen]);

  useEffect(() => {
    const sessionUser = session?.user;
    if (!sessionUser) return;

    const applyAvatar = (nextAvatarUrl?: string | null) => {
      if (typeof nextAvatarUrl !== "undefined") {
        setProfileAvatarUrl(nextAvatarUrl ?? resolveAvatarUrl(readLocalSiteSettings().avatar, sessionUser.image ?? null));
        return;
      }

      const localSettings = readLocalSiteSettings();
      setProfileAvatarUrl(resolveAvatarUrl(localSettings.avatar, sessionUser.image ?? null));
    };

    applyAvatar();

    const handleAvatarChange = (event: Event) => {
      applyAvatar((event as CustomEvent<{ avatarUrl?: string | null }>).detail?.avatarUrl);
    };

    window.addEventListener("uichicago-avatar-change", handleAvatarChange as EventListener);
    window.addEventListener("uichicago-settings-change", handleAvatarChange as EventListener);

    return () => {
      window.removeEventListener("uichicago-avatar-change", handleAvatarChange as EventListener);
      window.removeEventListener("uichicago-settings-change", handleAvatarChange as EventListener);
    };
  }, [session?.user]);

  useEffect(() => {
    if (!folderMenuOpen) return;

    const handlePointerDown = () => {
      setFolderMenuOpen(null);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [folderMenuOpen]);

  const selectedFolder = searchParams.get("folder") || "";
  const currentView = searchParams.get("view") || "home";
  const currentMode = searchParams.get("mode");
  const currentScreen = searchParams.get("screen");
  const createType = searchParams.get("type") === "guide" ? "guide" : "flashcards";
  const onStudyHome = pathname === "/study" && currentView !== "library" && !currentMode && !currentScreen && !selectedFolder;
  const onLibrary = pathname === "/study" && (currentView === "library" || Boolean(selectedFolder));
  const onNotes = pathname === "/study" && currentMode === "notes";
  const onGroups = pathname === "/study" && currentScreen === "groups";
  const onFlashcards =
    (pathname === "/study" && currentMode === "flashcards" && currentScreen !== "groups") ||
    (pathname === "/study/create" && createType === "flashcards");
  const onStudyGuides = pathname === "/study/create" && createType === "guide";
  const onPlanner = pathname === "/study/planner";

  const folders = useMemo(() => {
    const values = [
      ...customFolders,
      ...library.sets.map((set) => resolveSetFolder(set)),
      ...library.notes.map((note) => resolveNoteFolder(note)),
    ];
    return Array.from(new Set(values.map((value) => normalizeFolderPath(value)).filter(Boolean))).sort((a, b) =>
      folderLabelFromPath(a).localeCompare(folderLabelFromPath(b), undefined, { sensitivity: "base" }),
    );
  }, [customFolders, library.notes, library.sets]);
  const sidebarFolders = useMemo(
    () =>
      folders
        .filter((folder) => !parentFolderPath(folder))
        .sort((a, b) => folderLabelFromPath(a).localeCompare(folderLabelFromPath(b), undefined, { sensitivity: "base" })),
    [folders],
  );
  const customFolderSet = useMemo(() => new Set(customFolders), [customFolders]);

  const closeMenu = () => setMenuOpen(false);
  const openFromPlus = (href: string) => {
    setPlusOpen(false);
    router.push(href);
  };

  const openCreateFolder = (parent = "") => {
    setFolderMenuOpen(null);
    setFolderParent(parent);
    setFolderDraft("");
    setCreateFolderOpen(true);
  };

  const createFolder = () => {
    const leaf = folderDraft.trim();
    const next = normalizeFolderPath(folderParent ? `${folderParent}/${leaf}` : leaf);
    if (!next) return;
    setCustomFolders((current) => (current.includes(next) ? current : [...current, next]));
    setCreateFolderOpen(false);
    setFolderDraft("");
    setFolderParent("");
    setPlusOpen(false);
    router.push(`/study?folder=${encodeURIComponent(next)}`);
  };

  const renameFolder = (path: string) => {
    if (!customFolderSet.has(path)) return;
    const nextLabel = window.prompt("Rename folder", folderLabelFromPath(path));
    if (!nextLabel) return;
    const parent = parentFolderPath(path);
    const nextPath = normalizeFolderPath(parent ? `${parent}/${nextLabel}` : nextLabel);
    if (!nextPath || nextPath === path) return;

    setCustomFolders((current) => {
      const updated = current.map((entry) =>
        isFolderOrDescendant(path, entry) ? `${nextPath}${entry.slice(path.length)}` : entry,
      );
      return Array.from(new Set(updated.map((entry) => normalizeFolderPath(entry)).filter(Boolean)));
    });

    if (selectedFolder && isFolderOrDescendant(path, selectedFolder)) {
      const nextSelected = `${nextPath}${selectedFolder.slice(path.length)}`;
      router.push(`/study?folder=${encodeURIComponent(nextSelected)}`);
    }
    setFolderMenuOpen(null);
  };

  const deleteFolder = (path: string) => {
    if (!customFolderSet.has(path)) return;
    if (!window.confirm(`Delete "${folderLabelFromPath(path)}" and its subfolders?`)) return;
    setCustomFolders((current) => current.filter((entry) => !isFolderOrDescendant(path, entry)));
    if (selectedFolder && isFolderOrDescendant(path, selectedFolder)) {
      router.push("/study?view=library");
    }
    setFolderMenuOpen(null);
  };

  const navItems = [
    { href: "/study", label: "Home", icon: <Home className="h-4 w-4" />, active: onStudyHome },
    { href: "/study?view=library", label: "My library", icon: <BookOpen className="h-4 w-4" />, active: onLibrary },
    { href: "/study?screen=groups", label: "Study groups", icon: <Users className="h-4 w-4" />, active: onGroups },
  ];

  const studyItems = [
    { href: "/study/planner", label: "Degree planner", icon: <Target className="h-4 w-4" />, active: onPlanner },
    { href: "/study/create?type=flashcards", label: "Flashcards", icon: <BookOpen className="h-4 w-4" />, active: onFlashcards },
    { href: "/study?mode=notes", label: "Notes", icon: <FileText className="h-4 w-4" />, active: onNotes },
    { href: "/study/create?type=guide", label: "Study guides", icon: <Sparkles className="h-4 w-4" />, active: onStudyGuides },
  ];
  const profileName = session?.user?.name?.trim() || "Profile";
  const profileInitials = profileName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "P";
  const fallbackAvatar = getPresetAvatarUrl("night-owl");

  const plusMenu = (
    <div
      onClick={(event) => event.stopPropagation()}
      className="absolute right-0 top-16 z-50 w-[280px] max-w-[calc(100vw-2rem)] rounded-[1.4rem] border border-white/10 bg-[#1b1f45] p-3 shadow-[0_24px_50px_rgba(0,0,0,0.36)]"
    >
      <button onClick={() => openFromPlus("/study/create?type=flashcards")} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/[0.06]">
        <BookOpen className="h-5 w-5" />
        Flashcard set
      </button>
      <button onClick={() => openFromPlus("/study/planner")} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/[0.06]">
        <Target className="h-5 w-5" />
        Degree planner
      </button>
      <button onClick={() => openFromPlus("/study/create?type=guide")} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/[0.06]">
        <Sparkles className="h-5 w-5" />
        Study guide
      </button>
      <button
        onClick={() => {
          setPlusOpen(false);
          openCreateFolder();
        }}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/[0.06]"
      >
        <Folder className="h-5 w-5" />
        Folder
      </button>
      <button onClick={() => openFromPlus("/study?screen=groups")} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-white transition hover:bg-white/[0.06]">
        <Users className="h-5 w-5" />
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
        {!compact ? (
          <Link
            href="/"
            onClick={closeMenu}
            className="inline-flex items-center gap-3 rounded-xl px-2 py-1 text-white transition hover:bg-white/[0.05]"
            aria-label="Go to main website homepage"
          >
            <Image
              src="/atlas-navbar-mark.png"
              alt="UIChicago"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
            <div className="hidden min-w-0 sm:block">
              <div className="truncate text-sm font-semibold text-white">UIChicago</div>
              <div className="text-[11px] text-zinc-400">Back to website homepage</div>
            </div>
          </Link>
        ) : (
          <Link
            href="/"
            onClick={closeMenu}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white transition hover:bg-white/[0.05]"
            aria-label="Go to main website homepage"
          >
            <Image
              src="/atlas-navbar-mark.png"
              alt="UIChicago"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
          </Link>
        )}
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
          {sidebarFolders.length ? (
            sidebarFolders.map((folder) => {
              const isCustomFolder = customFolderSet.has(folder);
              return (
                <div key={folder} className="group">
                  <div
                    className={`flex items-center rounded-lg text-sm transition ${
                      compact ? "justify-center px-2 py-3" : "gap-3 px-3 py-2"
                    } ${
                      selectedFolder === folder
                        ? "bg-white/[0.12] text-white"
                        : "text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                    }`}
                  >
                    <Link
                      key={folder}
                      href={`/study?folder=${encodeURIComponent(folder)}`}
                      onClick={mobile ? closeMenu : undefined}
                      title={compact ? folderLabelFromPath(folder) : undefined}
                      className={`flex min-w-0 flex-1 items-center ${compact ? "justify-center" : "gap-3"}`}
                    >
                      <Folder className="h-4 w-4 shrink-0 text-zinc-500" />
                      {!compact ? <span className="truncate">{folderLabelFromPath(folder)}</span> : null}
                    </Link>
                    {!compact ? (
                      <div
                        className="relative ml-auto opacity-0 transition group-hover:opacity-100"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setFolderMenuOpen((current) => (current === folder ? null : folder))}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                          aria-label={`Open folder actions for ${folderLabelFromPath(folder)}`}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                        {folderMenuOpen === folder ? (
                          <div className="absolute right-0 top-9 z-20 w-[190px] rounded-[1rem] border border-white/10 bg-[#171b42] p-2 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
                            <button
                              type="button"
                              onClick={() => openCreateFolder(folder)}
                              className="flex w-full items-center gap-2 rounded-[0.8rem] px-3 py-2.5 text-left text-sm font-medium text-zinc-200 transition hover:bg-white/[0.06]"
                            >
                              <Folder className="h-4 w-4" />
                              Add subfolder
                            </button>
                            {isCustomFolder ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => renameFolder(folder)}
                                  className="mt-1 flex w-full items-center gap-2 rounded-[0.8rem] px-3 py-2.5 text-left text-sm font-medium text-zinc-200 transition hover:bg-white/[0.06]"
                                >
                                  <Pencil className="h-4 w-4" />
                                  Rename
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteFolder(folder)}
                                  className="mt-1 flex w-full items-center gap-2 rounded-[0.8rem] px-3 py-2.5 text-left text-sm font-medium text-red-200 transition hover:bg-red-500/[0.12]"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </button>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            !compact ? <div className="px-3 py-2 text-sm text-zinc-500">No folders yet.</div> : null
          )}
          <button
            type="button"
            onClick={() => {
              openCreateFolder();
              if (mobile) closeMenu();
            }}
            title={compact ? "New folder" : undefined}
            className={`flex w-full items-center rounded-lg text-sm text-zinc-200 transition hover:bg-white/[0.05] hover:text-white ${
              compact ? "justify-center px-2 py-3" : "gap-3 px-3 py-2"
            }`}
          >
            <Folder className="h-4 w-4 text-zinc-300" />
            {!compact ? <span>New folder</span> : null}
          </button>
        </div>
      </div>

      <div className="mx-3 mt-6 border-t border-white/10 pt-5">
        {!compact ? (
          <div className="px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
            Study tools
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
    <div className="min-h-screen overflow-x-clip bg-[#111136] text-white">
      {createFolderOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 px-4"
          onClick={() => {
            setCreateFolderOpen(false);
            setFolderDraft("");
            setFolderParent("");
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[420px] rounded-[2rem] border border-white/12 bg-[#171b42] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.42)]"
          >
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05]">
                <Folder className="h-7 w-7 text-white" />
              </div>
            </div>
            <div className="mt-5 text-center text-2xl font-semibold text-white">
              {folderParent ? `New subfolder in ${folderLabelFromPath(folderParent)}` : "Name your folder"}
            </div>
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
              placeholder={folderParent ? "Subfolder name" : "Folder name"}
              className="mt-5 h-12 w-full rounded-xl border border-white/12 bg-white/[0.06] px-4 text-white outline-none placeholder:text-zinc-500"
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCreateFolderOpen(false);
                  setFolderDraft("");
                  setFolderParent("");
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

      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden border-r border-white/10 bg-[#111136] transition-[width] duration-300 ease-out lg:block ${
          sidebarExpanded ? "w-[270px]" : "w-[72px]"
        }`}
      >
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
          className={`absolute left-0 top-0 h-full w-[270px] border-r border-white/10 bg-[#111136] transition-transform duration-300 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex h-full flex-col pb-6 pt-5">
            {sidebarContent(false, true)}
          </div>
        </aside>
      </div>

      <div className={`transition-[padding-left] duration-300 ease-out ${sidebarExpanded ? "lg:pl-[270px]" : "lg:pl-[72px]"}`}>
        <header className="sticky top-0 z-30 border-b border-white/8 bg-[#111136]/95 backdrop-blur">
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
              aria-label={sidebarExpanded ? "Collapse study menu" : "Expand study menu"}
            >
              <span className="relative flex h-4 w-5 flex-col justify-between">
                <span className="block h-0.5 w-5 rounded-full bg-current" />
                <span className="block h-0.5 w-4 rounded-full bg-current" />
                <span className="block h-0.5 w-5 rounded-full bg-current" />
              </span>
            </button>

            <div className="relative min-w-0 flex-1 lg:mx-auto lg:max-w-[420px]">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                data-tour="study-nav-search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Find it faster with a search"
                className="h-11 w-full rounded-xl border border-white/10 bg-[#23234f] pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-500"
              />
            </div>

            <div className="relative ml-auto flex items-center gap-3">
              <button
                data-tour="study-nav-create"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setPlusOpen((current) => !current);
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#5561ff] text-white shadow-[0_10px_24px_rgba(85,97,255,0.28)]"
                aria-label="Create"
              >
                <Plus className="h-5 w-5" />
              </button>
              <div ref={profileMenuRef} className="relative hidden lg:block">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setProfileMenuOpen((current) => !current);
                  }}
                  className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] pl-2 pr-3 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
                  aria-label="Open profile menu"
                  aria-expanded={profileMenuOpen}
                >
                  {profileAvatarUrl || fallbackAvatar ? (
                    <span className="relative inline-flex h-8 w-8 overflow-hidden rounded-full border border-white/10 bg-[#6e4cff]">
                      <img src={profileAvatarUrl || fallbackAvatar || ""} alt="Profile picture" className="h-full w-full object-cover" />
                    </span>
                  ) : (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#6e4cff] text-xs font-bold text-white">
                      {profileInitials}
                    </span>
                  )}
                  <span className="max-w-[120px] truncate">{profileName}</span>
                  <ChevronDown className={`h-4 w-4 text-zinc-400 transition ${profileMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {profileMenuOpen ? (
                  <div
                    onClick={(event) => event.stopPropagation()}
                    className="absolute right-0 top-[calc(100%+0.7rem)] z-50 w-[240px] rounded-[1.25rem] border border-white/10 bg-[#171b42] p-2 shadow-[0_24px_50px_rgba(0,0,0,0.36)]"
                  >
                    <div className="rounded-[1rem] bg-white/[0.04] px-3 py-3">
                      <div className="text-sm font-semibold text-white">{profileName}</div>
                      <div className="mt-1 truncate text-xs text-zinc-400">{session?.user?.email || ""}</div>
                    </div>

                    <Link
                      href="/profile"
                      onClick={() => setProfileMenuOpen(false)}
                      className="mt-2 inline-flex w-full items-center gap-2 rounded-[0.9rem] px-3 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.06]"
                    >
                      <UserRound className="h-4 w-4" />
                      Profile
                    </Link>

                    <Link
                      href="/settings"
                      onClick={() => setProfileMenuOpen(false)}
                      className="mt-1 inline-flex w-full items-center gap-2 rounded-[0.9rem] px-3 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.06]"
                    >
                      <Settings className="h-4 w-4" />
                      Settings
                    </Link>

                    <button
                      type="button"
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="mt-1 inline-flex w-full items-center gap-2 rounded-[0.9rem] px-3 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.06]"
                    >
                      <LogOut className="h-4 w-4" />
                      Log out
                    </button>
                  </div>
                ) : null}
              </div>
              {plusOpen ? plusMenu : null}
            </div>
          </div>
        </header>

        <div className="px-4 py-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
