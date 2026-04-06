"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  FileText,
  Folder,
  Home,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { DEFAULT_STUDY_LIBRARY } from "@/lib/study/sample-data";
import type { StudyLibraryState } from "@/lib/study/types";

const STORAGE_KEY = "uic-atlas-study-library-v1";
const CUSTOM_FOLDERS_KEY = "uic-atlas-study-custom-folders-v1";
const SIDEBAR_EXPANDED_KEY = "uic-atlas-study-sidebar-expanded-v1";
const LIBRARY_SYNC_EVENT = "uic-atlas-study-library-sync";
const FOLDERS_SYNC_EVENT = "uic-atlas-study-folders-sync";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const [folderParent, setFolderParent] = useState("");
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [library, setLibrary] = useState<StudyLibraryState>(DEFAULT_STUDY_LIBRARY);
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [folderMenuOpen, setFolderMenuOpen] = useState<string | null>(null);
  const [storageHydrated, setStorageHydrated] = useState(false);
  const lastLibrarySerializedRef = useRef("");
  const lastFoldersSerializedRef = useRef("");

  const syncLibraryFromStorage = () => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw || raw === lastLibrarySerializedRef.current) return;
      const parsed = JSON.parse(raw) as StudyLibraryState;
      lastLibrarySerializedRef.current = raw;
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
      lastLibrarySerializedRef.current = "";
      setLibrary(DEFAULT_STUDY_LIBRARY);
    }
  };

  const syncFoldersFromStorage = () => {
    try {
      const rawFolders = window.localStorage.getItem(CUSTOM_FOLDERS_KEY);
      const serializedFolders = rawFolders ?? "[]";
      if (serializedFolders === lastFoldersSerializedRef.current) return;
      const parsedFolders = rawFolders ? JSON.parse(rawFolders) : [];
      lastFoldersSerializedRef.current = serializedFolders;
      setCustomFolders(
        Array.isArray(parsedFolders)
          ? parsedFolders.map((entry) => normalizeFolderPath(String(entry))).filter(Boolean)
          : [],
      );
    } catch {
      lastFoldersSerializedRef.current = "[]";
      setCustomFolders([]);
    }
  };

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      lastLibrarySerializedRef.current = raw;
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
      const parsedFolders = rawFolders ? JSON.parse(rawFolders) : [];
      lastFoldersSerializedRef.current = rawFolders ?? "[]";
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
      // If no preference stored yet, keep the default (true = open)
    } catch {
      setSidebarExpanded(true);
    } finally {
      setStorageHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!storageHydrated) return;
    const serialized = JSON.stringify(customFolders);
    if (serialized === lastFoldersSerializedRef.current) return;
    window.localStorage.setItem(CUSTOM_FOLDERS_KEY, serialized);
    lastFoldersSerializedRef.current = serialized;
    window.dispatchEvent(new CustomEvent(FOLDERS_SYNC_EVENT));
  }, [customFolders, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    const serialized = JSON.stringify(library);
    if (serialized === lastLibrarySerializedRef.current) return;
    window.localStorage.setItem(STORAGE_KEY, serialized);
    lastLibrarySerializedRef.current = serialized;
    window.dispatchEvent(new CustomEvent(LIBRARY_SYNC_EVENT));
  }, [library, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    window.localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(sidebarExpanded));
  }, [sidebarExpanded, storageHydrated]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) syncLibraryFromStorage();
      if (event.key === CUSTOM_FOLDERS_KEY) syncFoldersFromStorage();
    };
    const handleLibrarySync = () => syncLibraryFromStorage();
    const handleFoldersSync = () => syncFoldersFromStorage();

    window.addEventListener("storage", handleStorage);
    window.addEventListener(LIBRARY_SYNC_EVENT, handleLibrarySync);
    window.addEventListener(FOLDERS_SYNC_EVENT, handleFoldersSync);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(LIBRARY_SYNC_EVENT, handleLibrarySync);
      window.removeEventListener(FOLDERS_SYNC_EVENT, handleFoldersSync);
    };
  }, []);

  useEffect(() => {
    const close = () => setPlusOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

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

  const openFolder = (folder: string, shouldCloseMenu = false) => {
    setFolderMenuOpen(null);
    if (shouldCloseMenu) closeMenu();
    router.push(`/study?folder=${encodeURIComponent(folder)}`);
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
    setLibrary((current) => ({
      ...current,
      sets: current.sets.map((set) => {
        const folder = resolveSetFolder(set);
        return isFolderOrDescendant(path, folder) ? { ...set, folder: `${nextPath}${folder.slice(path.length)}` } : set;
      }),
      notes: current.notes.map((note) => {
        const folder = resolveNoteFolder(note);
        return isFolderOrDescendant(path, folder) ? { ...note, folder: `${nextPath}${folder.slice(path.length)}` } : note;
      }),
    }));

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
    setLibrary((current) => ({
      ...current,
      sets: current.sets.map((set) => {
        const folder = resolveSetFolder(set);
        return isFolderOrDescendant(path, folder) ? { ...set, folder: "" } : set;
      }),
      notes: current.notes.map((note) => {
        const folder = resolveNoteFolder(note);
        return isFolderOrDescendant(path, folder) ? { ...note, folder: "" } : note;
      }),
    }));
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
  const plusMenu = (
    <div
      onClick={(event) => event.stopPropagation()}
      className="absolute right-0 top-12 z-50 w-60 rounded-xl border border-white/10 bg-[#0f1520] py-1.5 shadow-[0_20px_40px_rgba(0,0,0,0.55)]"
    >
      <div className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Create</div>
      {[
        { label: "Flashcard set", icon: <BookOpen className="h-3.5 w-3.5 text-indigo-400" />, href: "/study/create?type=flashcards" },
        { label: "Study guide", icon: <Sparkles className="h-3.5 w-3.5 text-violet-400" />, href: "/study/create?type=guide" },
        { label: "Notes", icon: <FileText className="h-3.5 w-3.5 text-emerald-400" />, href: "/study?mode=notes" },
        { label: "Degree planner", icon: <Target className="h-3.5 w-3.5 text-sky-400" />, href: "/study/planner" },
      ].map((item) => (
        <button key={item.label} onClick={() => openFromPlus(item.href)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-slate-300 transition hover:bg-white/5 hover:text-white">
          {item.icon}
          {item.label}
        </button>
      ))}
      <div className="my-1 h-px bg-white/6" />
      <button
        onClick={() => { setPlusOpen(false); openCreateFolder(); }}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
      >
        <Folder className="h-3.5 w-3.5 text-slate-500" />
        New folder
      </button>
      <button onClick={() => openFromPlus("/study?screen=groups")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-slate-300 transition hover:bg-white/5 hover:text-white">
        <Users className="h-3.5 w-3.5 text-slate-500" />
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
      className={`group flex items-center rounded-lg text-[13px] font-medium transition-colors ${
        compact ? "justify-center p-2.5" : "gap-2.5 px-2.5 py-2"
      } ${
        item.active
          ? "bg-white/8 text-white shadow-[inset_3px_0_0_rgba(99,102,241,0.9)]"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
      }`}
    >
      <span className={`shrink-0 ${item.active ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"}`}>{item.icon}</span>
      {!compact ? <span className="truncate">{item.label}</span> : null}
      {!compact && badge ? <span className="ml-auto shrink-0">{badge}</span> : null}
    </Link>
  );

  const sidebarContent = (compact: boolean, mobile = false) => (
    <>
      {/* Logo */}
      <div className={`flex items-center px-3 py-2 ${compact ? "justify-center" : "gap-3"}`}>
        {!mobile && (
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/6 hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {!compact ? (
          <Link
            href="/"
            onClick={closeMenu}
            className="inline-flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1 text-white transition hover:bg-white/4"
          >
            <Image src="/atlas-navbar-mark.png" alt="UIChicago" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" />
            <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-white">UIChicago</span>
          </Link>
        ) : (
          <Link href="/" onClick={closeMenu} className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-white/5">
            <Image src="/atlas-navbar-mark.png" alt="UIChicago" width={26} height={26} className="h-6.5 w-6.5 object-contain" />
          </Link>
        )}
      </div>

      {/* Primary nav */}
      <div className="mt-4 space-y-px px-2">
        {navItems.map((item) => renderSidebarItem(item, compact, mobile ? closeMenu : undefined))}
      </div>

      {/* Folders */}
      <div className="mt-6 px-2">
        {!compact && (
          <div className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
            Folders
          </div>
        )}
        {!compact && <div className="my-1 h-px bg-white/6" />}
        {compact && <div className="my-3 mx-auto h-px w-6 bg-white/8" />}
        <div className="mt-1 space-y-px">
          {sidebarFolders.length ? (
            sidebarFolders.map((folder) => {
              const isCustomFolder = customFolderSet.has(folder);
              return (
                <div key={folder} className="group relative">
                  <div className={`flex items-center rounded-lg text-[13px] transition-colors ${
                    compact ? "justify-center p-2.5" : "gap-2.5 px-2.5 py-2"
                  } ${
                    selectedFolder === folder
                      ? "bg-white/8 text-white shadow-[inset_3px_0_0_rgba(99,102,241,0.9)]"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}>
                    <button
                      type="button"
                      onClick={() => openFolder(folder, mobile)}
                      title={compact ? folderLabelFromPath(folder) : undefined}
                      className={`flex min-w-0 flex-1 items-center text-left ${compact ? "justify-center" : "gap-2.5"}`}
                    >
                      <Folder className={`h-4 w-4 shrink-0 ${selectedFolder === folder ? "text-indigo-400" : "text-slate-600 group-hover:text-slate-400"}`} />
                      {!compact ? <span className="truncate">{folderLabelFromPath(folder)}</span> : null}
                    </button>
                    {!compact ? (
                      <div
                        className="relative ml-auto opacity-0 transition group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setFolderMenuOpen((c) => (c === folder ? null : folder))}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-white/8 hover:text-white"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                        {folderMenuOpen === folder ? (
                          <div
                            className="absolute right-0 top-8 z-20 w-44 rounded-xl border border-white/10 bg-[#0f1520] py-1 shadow-[0_16px_32px_rgba(0,0,0,0.5)]"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <button type="button" onClick={() => openCreateFolder(folder)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/6">
                              <Folder className="h-3.5 w-3.5 text-slate-500" /> Add subfolder
                            </button>
                            {isCustomFolder && <>
                              <button type="button" onClick={() => renameFolder(folder)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/6">
                                <Pencil className="h-3.5 w-3.5 text-slate-500" /> Rename
                              </button>
                              <div className="my-1 h-px bg-white/6" />
                              <button type="button" onClick={() => deleteFolder(folder)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-400 hover:bg-rose-500/10">
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </>}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            !compact ? <div className="px-2.5 py-1.5 text-[13px] text-slate-600">No folders yet</div> : null
          )}
          <button
            type="button"
            onClick={() => { openCreateFolder(); if (mobile) closeMenu(); }}
            title={compact ? "New folder" : undefined}
            className={`flex w-full items-center rounded-lg text-[13px] text-slate-500 transition hover:bg-white/5 hover:text-slate-300 ${
              compact ? "justify-center p-2.5" : "gap-2.5 px-2.5 py-2"
            }`}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            {!compact ? <span>New folder</span> : null}
          </button>
        </div>
      </div>

      {/* Study tools */}
      <div className="mt-4 px-2">
        {!compact && <div className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Tools</div>}
        {!compact && <div className="my-1 h-px bg-white/6" />}
        {compact && <div className="my-3 mx-auto h-px w-6 bg-white/8" />}
        <div className="mt-1 space-y-px">
          {studyItems.map((item) => renderSidebarItem(item, compact, mobile ? closeMenu : undefined))}
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen overflow-x-clip bg-[#080d18] text-white">
      {/* New folder modal */}
      {createFolderOpen ? (
        <div
          className="fixed inset-0 z-90 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => { setCreateFolderOpen(false); setFolderDraft(""); setFolderParent(""); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-100 rounded-2xl border border-white/10 bg-[#0f1520] p-6 shadow-[0_32px_64px_rgba(0,0,0,0.6)]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15">
              <Folder className="h-5 w-5 text-indigo-400" />
            </div>
            <div className="mt-4 text-lg font-semibold text-white">
              {folderParent ? `New subfolder in "${folderLabelFromPath(folderParent)}"` : "Create folder"}
            </div>
            <input
              autoFocus
              value={folderDraft}
              onChange={(e) => setFolderDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createFolder(); } }}
              placeholder="Folder name"
              className="mt-4 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-500/40 focus:bg-white/7"
              />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCreateFolderOpen(false); setFolderDraft(""); setFolderParent(""); }}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/8"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createFolder}
                disabled={!folderDraft.trim()}
                className="atlas-cta-btn disabled:cursor-not-allowed disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/6 bg-[#080d18] transition-[width] duration-300 ease-out lg:flex ${
        sidebarExpanded ? "w-60" : "w-15"
      }`}>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-linear-to-b from-transparent via-violet-500/80 to-transparent" />
        <div className="flex flex-1 flex-col overflow-y-auto pb-4 pt-4">
          {sidebarContent(!sidebarExpanded)}
        </div>
      </aside>

      {/* Mobile slide-in */}
      <div className={`fixed inset-0 z-70 lg:hidden ${menuOpen ? "pointer-events-auto" : "pointer-events-none"}`} aria-hidden={!menuOpen}>
        <div onClick={() => setMenuOpen(false)} className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${menuOpen ? "opacity-100" : "opacity-0"}`} />
        <aside className={`absolute left-0 top-0 h-full w-60 border-r border-white/6 bg-[#080d18] transition-transform duration-300 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-linear-to-b from-transparent via-violet-500/80 to-transparent" />
          <div className="flex h-full flex-col overflow-y-auto pb-4 pt-4">
            <div className="flex items-center justify-between px-3 pb-2">
              <Link href="/" onClick={closeMenu} className="inline-flex items-center gap-2 rounded-lg px-1.5 py-1 text-white transition hover:bg-white/5">
                <Image src="/atlas-navbar-mark.png" alt="UIChicago" width={24} height={24} className="h-6 w-6 object-contain" />
                <span className="text-[13px] font-semibold text-white">UIChicago</span>
              </Link>
              <button type="button" onClick={closeMenu} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/6 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            {sidebarContent(false, true)}
          </div>
        </aside>
      </div>

      {/* Main content */}
      <div className={`transition-[padding-left] duration-300 ease-out ${sidebarExpanded ? "lg:pl-60" : "lg:pl-15"}`}>
        <header className="sticky top-[69px] z-30 border-b border-white/8 bg-[rgba(8,13,24,0.92)] backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 lg:px-6">
            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/6 hover:text-white lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>

            {/* Desktop sidebar toggle */}
            <button
              type="button"
              onClick={() => setSidebarExpanded((c) => !c)}
              className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/6 hover:text-slate-300 lg:inline-flex"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                My School
              </div>
            </div>

            <div className="relative flex items-center gap-2">
              <button
                data-tour="study-nav-create"
                type="button"
                onClick={(e) => { e.stopPropagation(); setPlusOpen((c) => !c); }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-[0_2px_8px_rgba(79,70,229,0.35)] transition hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" />
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
