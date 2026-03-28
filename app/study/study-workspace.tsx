"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  BarChart3,
  Bookmark,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  Flame,
  Folder,
  FolderPlus,
  FolderOpen,
  Globe,
  Grid2x2,
  GripVertical,
  ImageIcon,
  Layers3,
  Maximize2,
  MoreHorizontal,
  Plus,
  Pencil,
  Play,
  Pause,
  RotateCcw,
  Rocket,
  Search,
  Share2,
  Shuffle,
  Sparkles,
  Star,
  Target,
  Trash2,
  Trophy,
  Users,
  UserPlus,
  UserRound,
  Volume2,
  WandSparkles,
  X,
  LogOut,
} from "lucide-react";
import { buildQuestionBank, buildStudySession, computeStudyDashboard, createStudyId, fuzzyMatch, getDefaultProgress, getRecommendedCards, reorderCards, updateProgressForReview } from "@/lib/study/engine";
import { DEFAULT_STUDY_LIBRARY } from "@/lib/study/sample-data";
import type { CardProgress, QuizQuestion, QuizResult, StructuredLectureNotes, StudyCard, StudyGroup, StudyLibraryState, StudyNote, StudySet, StudySurface } from "@/lib/study/types";
import NotesWorkspace from "@/app/study/NotesWorkspace";
import FeatureTour from "@/app/components/onboarding/FeatureTour";
import { estimateFlashcardCountFromText, parseExplicitFlashcardsFromText } from "@/lib/study/flashcard-parser";

const STORAGE_KEY = "uic-atlas-study-library-v1";
const MATCH_BESTS_KEY = "uic-atlas-study-match-bests-v1";
const CUSTOM_FOLDERS_KEY = "uic-atlas-study-custom-folders-v1";

type Screen = "dashboard" | "groups" | "create" | "overview" | "flashcards" | "learn" | "test" | "match";
type StudyFilter = "all" | "starred" | "difficult" | "missed" | "unseen";
type ToastTone = "default" | "error" | "reward";
type StudyToast = { message: string; tone: ToastTone } | null;
type LibrarySection = "flashcards" | "notes" | "groups" | "guides";
type StudyCourseSuggestion = {
  id: string;
  code: string;
  title: string;
  href: string;
};
type CourseSearchPayloadItem = {
  id: string;
  subject: string;
  number: string;
  title: string;
  href: string;
};
type GeneratedCardPayload = {
  front: string;
  back: string;
  hint?: string;
  difficulty?: StudyCard["difficulty"];
  tags?: string[];
};
type DraftSetErrors = {
  title?: string;
  cards?: string;
};
type DraftGuideErrors = {
  title?: string;
  course?: string;
  content?: string;
  guide?: string;
};

type StudyWorkspaceProps = {
  forcedSetId?: string;
  standaloneSetView?: boolean;
};

type SaveDestinationDialogState = {
  afterSave: "overview" | "learn";
  folder: string;
  newFolderName: string;
} | null;

type TriviaQuestion = {
  prompt: string;
  choices: string[];
  correctAnswer: string;
};

const STUDY_MODE_SCREENS: Screen[] = ["flashcards", "learn", "test", "match"];
const HOME_TRIVIA_QUESTIONS: TriviaQuestion[] = [
  { prompt: "How many hearts does an octopus have?", choices: ["5", "1", "3", "7"], correctAnswer: "3" },
  { prompt: "What is the largest planet in our solar system?", choices: ["Mars", "Saturn", "Jupiter", "Neptune"], correctAnswer: "Jupiter" },
  { prompt: "Which ocean is the largest?", choices: ["Atlantic", "Indian", "Pacific", "Arctic"], correctAnswer: "Pacific" },
  { prompt: "What gas do plants absorb from the air?", choices: ["Oxygen", "Nitrogen", "Carbon dioxide", "Helium"], correctAnswer: "Carbon dioxide" },
  { prompt: "How many bones are in the adult human body?", choices: ["206", "189", "212", "244"], correctAnswer: "206" },
  { prompt: "Which country invented paper?", choices: ["Egypt", "China", "India", "Greece"], correctAnswer: "China" },
  { prompt: "What is the fastest land animal?", choices: ["Horse", "Leopard", "Cheetah", "Greyhound"], correctAnswer: "Cheetah" },
  { prompt: "What is H2O more commonly known as?", choices: ["Salt", "Water", "Hydrogen", "Oxygen"], correctAnswer: "Water" },
  { prompt: "Which planet is known as the Red Planet?", choices: ["Venus", "Mars", "Mercury", "Jupiter"], correctAnswer: "Mars" },
  { prompt: "What is the capital of Japan?", choices: ["Osaka", "Seoul", "Tokyo", "Kyoto"], correctAnswer: "Tokyo" },
  { prompt: "How many continents are there?", choices: ["5", "6", "7", "8"], correctAnswer: "7" },
  { prompt: "Which animal is known for building dams?", choices: ["Otter", "Beaver", "Badger", "Moose"], correctAnswer: "Beaver" },
  { prompt: "What is the hardest natural substance on Earth?", choices: ["Quartz", "Iron", "Diamond", "Gold"], correctAnswer: "Diamond" },
  { prompt: "Which organ pumps blood through the body?", choices: ["Liver", "Brain", "Heart", "Lung"], correctAnswer: "Heart" },
  { prompt: "How many days are in a leap year?", choices: ["364", "365", "366", "367"], correctAnswer: "366" },
  { prompt: "Which continent is the Sahara Desert in?", choices: ["Asia", "Africa", "Australia", "South America"], correctAnswer: "Africa" },
  { prompt: "What do bees collect from flowers?", choices: ["Pollen and nectar", "Seeds", "Water only", "Leaves"], correctAnswer: "Pollen and nectar" },
  { prompt: "Which instrument has 88 keys?", choices: ["Violin", "Piano", "Guitar", "Drums"], correctAnswer: "Piano" },
  { prompt: "What is the boiling point of water at sea level?", choices: ["90°C", "95°C", "100°C", "110°C"], correctAnswer: "100°C" },
  { prompt: "Which planet has the most rings?", choices: ["Earth", "Saturn", "Mars", "Venus"], correctAnswer: "Saturn" },
];

const magneticHoverProps = {
  onMouseMove: (event: React.MouseEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 8;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 8;
    target.style.setProperty("--mx", `${x.toFixed(2)}px`);
    target.style.setProperty("--my", `${y.toFixed(2)}px`);
  },
  onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--mx", "0px");
    event.currentTarget.style.setProperty("--my", "0px");
  },
};

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

function isFolderOrDescendant(path: string, candidate: string) {
  return candidate === path || candidate.startsWith(`${path}/`);
}

function resolveSetFolder(set: StudySet) {
  return normalizeFolderPath(set.folder || set.course || set.subject || "");
}

function resolveNoteFolder(note: StudyNote) {
  return normalizeFolderPath(note.folder || note.course || note.subject || "");
}

const emptyDraftCard = (index: number): StudyCard => ({
  id: createStudyId("card"),
  front: "",
  back: "",
  hint: "",
  mnemonic: "",
  pronunciation: "",
  formula: "",
  example: "",
  imageFrontUrl: "",
  imageBackUrl: "",
  difficulty: "medium",
  tags: [],
  orderIndex: index,
});

const emptyDraftSet = (): StudySet => {
  const now = new Date().toISOString();
  return {
    id: createStudyId("set"),
    title: "",
    description: "",
    folder: "",
    course: "",
    subject: "",
    tags: [],
    difficulty: "medium",
    visibility: "private",
    createdAt: now,
    updatedAt: now,
    cards: [emptyDraftCard(0), emptyDraftCard(1)],
  };
};

const emptyDraftGuide = (): StudyNote => {
  const now = new Date().toISOString();
  return {
    id: createStudyId("note"),
    title: "",
    folder: "",
    course: "",
    noteDate: now.slice(0, 10),
    subject: "",
    tags: [],
    rawContent: "",
    structuredContent: null,
    transcriptContent: "",
    sourceType: "imported",
    visibility: "private",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    pinned: false,
    favorite: false,
  };
};

export default function StudyWorkspace({ forcedSetId, standaloneSetView = false }: StudyWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const isCreateRoute = pathname === "/study/create";
  const createType = searchParams.get("type") === "guide" ? "guide" : "flashcards";
  const isGuideCreateRoute = isCreateRoute && createType === "guide";
  const [hydrated, setHydrated] = useState(false);
  const [library, setLibrary] = useState<StudyLibraryState>(DEFAULT_STUDY_LIBRARY);
  const [surface, setSurface] = useState<StudySurface>("home");
  const [screen, setScreen] = useState<Screen>(isCreateRoute ? "create" : "dashboard");
  const [selectedSetId, setSelectedSetId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [librarySection, setLibrarySection] = useState<LibrarySection>("flashcards");
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [draftSet, setDraftSet] = useState<StudySet>(emptyDraftSet());
  const [saveDestinationDialog, setSaveDestinationDialog] = useState<SaveDestinationDialogState>(null);
  const [draftGuide, setDraftGuide] = useState<StudyNote>(emptyDraftGuide());
  const [groupName, setGroupName] = useState("");
  const [groupCourse, setGroupCourse] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [groupTab, setGroupTab] = useState<"materials" | "members">("materials");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupSetPickerGroupId, setGroupSetPickerGroupId] = useState("");
  const [folderActionsOpen, setFolderActionsOpen] = useState(false);
  const [folderLibraryPickerOpen, setFolderLibraryPickerOpen] = useState(false);
  const [moveLibraryItem, setMoveLibraryItem] = useState<{ type: "set" | "note"; id: string; title: string } | null>(null);
  const [importText, setImportText] = useState("");
  const [courseSuggestions, setCourseSuggestions] = useState<StudyCourseSuggestion[]>([]);
  const [publicSearchResults, setPublicSearchResults] = useState<StudySet[]>([]);
  const [draftSetErrors, setDraftSetErrors] = useState<DraftSetErrors>({});
  const [draftGuideErrors, setDraftGuideErrors] = useState<DraftGuideErrors>({});
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [toast, setToast] = useState<StudyToast>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedGuide, setGeneratedGuide] = useState<StructuredLectureNotes | null>(null);
  const [triviaIndex, setTriviaIndex] = useState(0);
  const [selectedTriviaChoice, setSelectedTriviaChoice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StudyLibraryState;
        setLibrary({
          sets: parsed.sets ?? DEFAULT_STUDY_LIBRARY.sets,
          groups: parsed.groups ?? DEFAULT_STUDY_LIBRARY.groups,
          notes: parsed.notes ?? DEFAULT_STUDY_LIBRARY.notes,
          noteAudioSessions: parsed.noteAudioSessions ?? DEFAULT_STUDY_LIBRARY.noteAudioSessions,
          noteAiLogs: parsed.noteAiLogs ?? DEFAULT_STUDY_LIBRARY.noteAiLogs,
          progress: parsed.progress ?? {},
          sessions: parsed.sessions ?? [],
          quizResults: parsed.quizResults ?? [],
        });
        setSelectedSetId(parsed.sets?.[0]?.id || "");
      }

      const rawFolders = window.localStorage.getItem(CUSTOM_FOLDERS_KEY);
      if (rawFolders) {
        const parsedFolders = JSON.parse(rawFolders);
        setCustomFolders(
          Array.isArray(parsedFolders)
            ? parsedFolders.map((entry) => normalizeFolderPath(String(entry))).filter(Boolean)
            : [],
        );
      }
    } catch {
      setLibrary(DEFAULT_STUDY_LIBRARY);
      setCustomFolders([]);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    setScreen(isCreateRoute ? "create" : "dashboard");
  }, [isCreateRoute]);

  useEffect(() => {
    const requestedFolder = normalizeFolderPath(searchParams.get("folder") || "");
    if (!isCreateRoute || isGuideCreateRoute) return;
    setDraftSet((current) => (current.folder === requestedFolder ? current : { ...current, folder: requestedFolder }));
  }, [isCreateRoute, isGuideCreateRoute, searchParams]);

  useEffect(() => {
    const requestedFolder = normalizeFolderPath(searchParams.get("folder") || "");
    if (!isGuideCreateRoute) return;
    setDraftGuide((current) => (current.folder === requestedFolder ? current : { ...current, folder: requestedFolder }));
  }, [isGuideCreateRoute, searchParams]);

  useEffect(() => {
    const requestedSetId = forcedSetId || searchParams.get("set");
    if (!requestedSetId) return;
    setSelectedSetId(requestedSetId);
    if (!isCreateRoute && !searchParams.get("screen")) {
      setScreen("overview");
    }
  }, [forcedSetId, isCreateRoute, searchParams]);

  useEffect(() => {
    if (isCreateRoute) return;
    const requestedScreen = searchParams.get("screen") as Screen | null;
    if (requestedScreen && ["dashboard", "groups", "overview", "flashcards", "learn", "test", "match"].includes(requestedScreen)) {
      setScreen(requestedScreen);
      return;
    }
    if (standaloneSetView) {
      setScreen("overview");
      return;
    }
    if (!forcedSetId && !searchParams.get("set")) {
      setScreen("dashboard");
    }
  }, [forcedSetId, isCreateRoute, searchParams, standaloneSetView]);

  useEffect(() => {
    const requestedSurface = searchParams.get("mode");
    if (requestedSurface === "notes") {
      setSurface("notes");
    } else if (requestedSurface === "flashcards") {
      setSurface("flashcards");
    } else {
      setSurface("home");
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("view") !== "library") return;
    const requestedSection = searchParams.get("section");
    if (requestedSection === "flashcards" || requestedSection === "notes" || requestedSection === "groups" || requestedSection === "guides") {
      setLibrarySection(requestedSection);
    }
  }, [searchParams]);

  useEffect(() => {
    const requestedMode = searchParams.get("mode");
    const requestedSet = searchParams.get("set");
    const requestedScreen = searchParams.get("screen");
    if (pathname !== "/study") return;
    if (requestedMode !== "flashcards") return;
    if (requestedSet || requestedScreen) return;
    router.replace("/study/create?type=flashcards");
  }, [pathname, router, searchParams]);

  const globalQuery = (searchParams.get("query") || "").trim();
  const folderFilter = (searchParams.get("folder") || "").trim();
  const libraryView = searchParams.get("view") === "library";

  useEffect(() => {
    setSearch(globalQuery);
  }, [globalQuery]);

  useEffect(() => {
    if (!isCreateRoute) return;
    if (isGuideCreateRoute) {
      setDraftGuide(emptyDraftGuide());
      setDraftSet(emptyDraftSet());
      setGeneratedGuide(null);
      setImportText("");
      return;
    }
    const editSetId = searchParams.get("edit");
    if (!editSetId) {
      setDraftSet(emptyDraftSet());
      setImportText("");
      return;
    }

    const existingSet = library.sets.find((set) => set.id === editSetId);
    if (existingSet) {
      setDraftSet(existingSet);
      setImportText("");
    }
  }, [isCreateRoute, isGuideCreateRoute, library.sets, searchParams]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  }, [hydrated, library]);

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    const loadStudyProfile = async () => {
      try {
        const response = await fetch("/api/study/me", {
          cache: "no-store",
        });
        if (!response.ok) return;

        const payload = await response.json();
        if (cancelled) return;

        setLibrary((current) => {
          const remoteSets = Array.isArray(payload.library?.sets) ? payload.library.sets : [];
          const remoteGroups = Array.isArray(payload.library?.groups) ? payload.library.groups : [];
          const remoteSessions = Array.isArray(payload.library?.sessions) ? payload.library.sessions : [];

          const knownSetIds = new Set(remoteSets.map((set: StudySet) => set.id));
          const knownSessionIds = new Set(remoteSessions.map((studySession: { id: string }) => studySession.id));

          return {
            ...current,
            sets: [...remoteSets, ...current.sets.filter((set) => !knownSetIds.has(set.id))],
            groups: remoteGroups,
            sessions: [...remoteSessions, ...current.sessions.filter((studySession) => !knownSessionIds.has(studySession.id))],
          };
        });
      } catch {
        // Keep the local library if the authenticated fetch fails.
      }
    };

    void loadStudyProfile();

    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    window.localStorage.setItem(CUSTOM_FOLDERS_KEY, JSON.stringify(customFolders));
  }, [customFolders]);

  const activeTriviaQuestion = HOME_TRIVIA_QUESTIONS[triviaIndex % HOME_TRIVIA_QUESTIONS.length];

  useEffect(() => {
    if (!selectedTriviaChoice) return;
    const timeout = window.setTimeout(() => {
      setSelectedTriviaChoice(null);
      setTriviaIndex((current) => (current + 1) % HOME_TRIVIA_QUESTIONS.length);
    }, 1500);
    return () => window.clearTimeout(timeout);
  }, [selectedTriviaChoice]);

  useEffect(() => {
    const query = (isGuideCreateRoute ? draftGuide.course : draftSet.course).trim();
    if (!isCreateRoute || query.length < 2) {
      setCourseSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/courses?q=${encodeURIComponent(query)}&pageSize=6`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) return;
        setCourseSuggestions(
          (Array.isArray(payload.items) ? payload.items : []).map((item: CourseSearchPayloadItem) => ({
            id: item.id,
            code: `${item.subject} ${item.number}`,
            title: item.title,
            href: item.href,
          })),
        );
      } catch {
        setCourseSuggestions([]);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [draftGuide.course, draftSet.course, isCreateRoute, isGuideCreateRoute]);

  useEffect(() => {
    if (!Object.keys(draftSetErrors).length) return;

    const cleanedCards = draftSet.cards.filter((card) => card.front.trim() && card.back.trim());
    setDraftSetErrors((current) => {
      const next = { ...current };
      if (next.title && draftSet.title.trim()) delete next.title;
      if (next.cards && cleanedCards.length > 0) delete next.cards;
      return next;
    });
  }, [draftSet.cards, draftSet.course, draftSet.title, draftSetErrors]);

  useEffect(() => {
    if (!Object.keys(draftGuideErrors).length) return;
    setDraftGuideErrors((current) => {
      const next = { ...current };
      if (next.title && draftGuide.title.trim()) delete next.title;
      if (next.course && draftGuide.course.trim()) delete next.course;
      if (next.content && importText.trim()) delete next.content;
      if (next.guide && generatedGuide) delete next.guide;
      return next;
    });
  }, [draftGuide.course, draftGuide.title, draftGuideErrors, generatedGuide, importText]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setPublicSearchResults([]);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/study/public-sets?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) return;
        setPublicSearchResults(Array.isArray(payload.items) ? payload.items : []);
      } catch {
        setPublicSearchResults([]);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [search]);

  const showToast = (message: string, tone: ToastTone = "default") => {
    setToast({ message, tone });
  };

  const isSignedIn = status === "authenticated";

  const promptGoogleSignIn = () => {
    void signIn("google", {
      callbackUrl: typeof window !== "undefined" ? window.location.href : "/study",
    });
  };

  const selectedSet = useMemo(
    () => library.sets.find((set) => set.id === (forcedSetId || selectedSetId)) ?? library.sets[0],
    [forcedSetId, library.sets, selectedSetId],
  );

  const openSurface = (nextSurface: StudySurface) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextSurface === "home") {
      params.delete("mode");
      params.delete("screen");
    } else {
      params.set("mode", nextSurface);
      if (nextSurface === "flashcards" && !params.get("screen")) {
        params.set("screen", "dashboard");
      }
    }
    router.push(`/study${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const goToStudyHome = () => {
    router.push("/study");
  };

  const openStudyScreen = (nextScreen: Screen, setId?: string) => {
    const targetSetId = setId ?? forcedSetId ?? selectedSetId ?? selectedSet?.id;
    if (standaloneSetView && targetSetId) {
      const params = new URLSearchParams();
      if (nextScreen !== "overview") params.set("screen", nextScreen);
      router.push(`/study/set/${encodeURIComponent(targetSetId)}${params.toString() ? `?${params.toString()}` : ""}`);
      return;
    }
    const params = new URLSearchParams();
    if (targetSetId) params.set("set", targetSetId);
    if (nextScreen !== "groups") {
      if (surface !== "home") {
        params.set("mode", surface);
      } else if (targetSetId && nextScreen !== "dashboard") {
        params.set("mode", "flashcards");
      }
    }
    if (nextScreen !== "dashboard") params.set("screen", nextScreen);
    router.push(`/study${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const selectedProgress = library.progress[selectedSet?.id] ?? {};
  const dashboard = useMemo(() => computeStudyDashboard(library), [library]);
  const isFocusedStudyMode = STUDY_MODE_SCREENS.includes(screen);

  useEffect(() => {
    if (isFocusedStudyMode) {
      window.scrollTo(0, 0);
    }
  }, [isFocusedStudyMode, screen, selectedSetId]);

  const setList = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();
    return library.sets.filter((set) => {
      const folderLabel = resolveSetFolder(set);
      const matchesSearch =
        !normalizedSearch ||
        [set.title, set.course, set.subject, set.folder, set.description, ...set.tags].join(" ").toLowerCase().includes(normalizedSearch);
      const matchesFolder = !folderFilter || folderLabel === folderFilter;
      const matchesSubject = subjectFilter === "all" || set.subject === subjectFilter;
      const matchesDifficulty = difficultyFilter === "all" || set.difficulty === difficultyFilter;
      return matchesSearch && matchesSubject && matchesDifficulty && matchesFolder;
    });
  }, [difficultyFilter, folderFilter, library.sets, search, subjectFilter]);

  const matchingNotes = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();
    return library.notes.filter((note) => {
      const folderLabel = resolveNoteFolder(note);
      const matchesSearch =
        !normalizedSearch ||
        [note.title, note.course, note.subject, note.folder, note.rawContent, note.transcriptContent, ...note.tags]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
      const matchesFolder = !folderFilter || folderLabel === folderFilter;
      return matchesSearch && matchesFolder;
    });
  }, [folderFilter, library.notes, search]);

  const matchingGuides = useMemo(() => matchingNotes.filter((note) => Boolean(note.structuredContent)), [matchingNotes]);

  const matchingGroups = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();
    return library.groups.filter((group) => {
      if (!normalizedSearch) return true;
      return [group.name, group.course, group.description, ...group.memberNames].join(" ").toLowerCase().includes(normalizedSearch);
    });
  }, [library.groups, search]);

  const availableFolders = useMemo(() => {
    const setFolders = library.sets.map((set) => resolveSetFolder(set));
    const noteFolders = library.notes.map((note) => resolveNoteFolder(note));
    return Array.from(new Set([...customFolders, ...setFolders, ...noteFolders].filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [customFolders, library.notes, library.sets]);

  const subjects = Array.from(new Set(library.sets.map((set) => set.subject).filter(Boolean)));
  const selectedGroup = library.groups.find((group) => group.id === selectedGroupId) ?? library.groups[0];
  const folderSetPreview = setList.slice(0, 12);
  const folderNotePreview = matchingNotes.slice(0, 8);
  const childFolders = useMemo(() => {
    if (!folderFilter) return [];

    const libraryFolders = [
      ...library.sets.map((set) => resolveSetFolder(set)),
      ...library.notes.map((note) => resolveNoteFolder(note)),
    ].filter(Boolean);

    const allFolders = Array.from(new Set([...customFolders, ...libraryFolders]));
    return allFolders.filter((folder) => parentFolderPath(folder) === folderFilter);
  }, [customFolders, folderFilter, library.notes, library.sets]);
  const librarySearchPlaceholder =
    librarySection === "flashcards"
      ? "Search flashcards"
      : librarySection === "notes"
        ? "Search notes"
        : librarySection === "groups"
          ? "Search study groups"
          : "Search study guides";

  useEffect(() => {
    if (!library.groups.length) {
      setSelectedGroupId("");
      return;
    }
    if (!selectedGroupId || !library.groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(library.groups[0].id);
    }
  }, [library.groups, selectedGroupId]);

  const saveDraftSet = async ({
    afterSave,
    folder,
  }: {
    afterSave: "overview" | "learn";
    folder?: string;
  }) => {
    const cleanedCards = draftSet.cards
      .map((card, index) => ({
        ...card,
        front: card.front.trim(),
        back: card.back.trim(),
        hint: card.hint?.trim() || "",
        mnemonic: card.mnemonic?.trim() || "",
        example: card.example?.trim() || "",
        pronunciation: card.pronunciation?.trim() || "",
        formula: card.formula?.trim() || "",
        tags: card.tags.filter(Boolean),
        orderIndex: index,
      }))
      .filter((card) => card.front && card.back);

    const nextErrors: DraftSetErrors = {};
    if (!draftSet.title.trim()) nextErrors.title = "Enter a set title.";
    if (cleanedCards.length === 0) nextErrors.cards = "Add at least one card with both a front and back.";

    if (Object.keys(nextErrors).length > 0) {
      setDraftSetErrors(nextErrors);
      showToast("Fill the required fields before saving.", "error");
      return;
    }

    setDraftSetErrors({});

    const now = new Date().toISOString();
    let nextSet: StudySet = {
      ...draftSet,
      title: draftSet.title.trim(),
      description: draftSet.description.trim(),
      folder: normalizeFolderPath(folder ?? draftSet.folder ?? ""),
      course: draftSet.course.trim(),
      subject: draftSet.subject.trim() || "General",
      tags: draftSet.tags.filter(Boolean),
      updatedAt: now,
      createdAt: draftSet.createdAt || now,
      cards: cleanedCards,
    };

    if (nextSet.visibility === "public") {
      try {
        const publishResponse = await fetch("/api/study/public-sets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ set: nextSet }),
        });
        const publishPayload = await publishResponse.json();
        if (!publishResponse.ok) {
          nextSet = { ...nextSet, visibility: "private" };
          showToast(publishPayload.error || "This set was kept private.", "error");
        } else {
          showToast(existsInLibrary(library, nextSet.id) ? "Study set updated and shared." : "Study set saved and shared.");
        }
      } catch {
        nextSet = { ...nextSet, visibility: "private" };
        showToast("Could not publish this set, so it was saved privately instead.", "error");
      }
    } else {
      try {
        await fetch("/api/study/public-sets", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setId: nextSet.id }),
        });
      } catch {}
    }

    setLibrary((current) => {
      const exists = current.sets.some((set) => set.id === nextSet.id);
      return {
        ...current,
        sets: exists
          ? current.sets.map((set) => (set.id === nextSet.id ? nextSet : set))
          : [nextSet, ...current.sets],
      };
    });
    setSelectedSetId(nextSet.id);
    if (nextSet.visibility !== "public") {
      showToast(existsInLibrary(library, nextSet.id) ? "Study set updated." : "Study set saved.");
    }

    if (isSignedIn) {
      try {
        const response = await fetch("/api/study/sets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ set: nextSet }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Failed to sync the study set.");
        }
        nextSet = payload.set as StudySet;
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Saved locally, but server sync failed.", "error");
      }
    }

    setDraftSet(emptyDraftSet());
    setImportText("");
    if (isCreateRoute) {
      const params = new URLSearchParams({
        mode: "flashcards",
        set: nextSet.id,
        screen: afterSave === "learn" ? "learn" : "overview",
      });
      router.push(`/study?${params.toString()}`);
    } else {
      openStudyScreen(afterSave === "learn" ? "learn" : "overview", nextSet.id);
    }
  };

  const openSaveDestinationDialog = (afterSave: "overview" | "learn") => {
    setSaveDestinationDialog({
      afterSave,
      folder: normalizeFolderPath(draftSet.folder || ""),
      newFolderName: "",
    });
  };

  const confirmSaveDestination = async () => {
    if (!saveDestinationDialog) return;

    const createdFolder = normalizeFolderPath(saveDestinationDialog.newFolderName);
    const selectedFolder = normalizeFolderPath(saveDestinationDialog.folder);
    const targetFolder = createdFolder || selectedFolder;

    if (createdFolder) {
      setCustomFolders((current) => (current.includes(createdFolder) ? current : [createdFolder, ...current]));
    }

    setDraftSet((current) => ({ ...current, folder: targetFolder }));
    setSaveDestinationDialog(null);
    await saveDraftSet({
      afterSave: saveDestinationDialog.afterSave,
      folder: targetFolder,
    });
  };

  const deleteDraftSet = () => {
    const editSetId = searchParams.get("edit");
    if (editSetId && library.sets.some((set) => set.id === editSetId)) {
      deleteSet(editSetId, { stayOnCreate: true });
      return;
    }

    const confirmed = window.confirm("Delete this draft set?");
    if (!confirmed) return;

    setDraftSet(emptyDraftSet());
    setImportText("");
    setSaveDestinationDialog(null);
    showToast("Draft deleted.");
  };

  const duplicateSet = (set: StudySet) => {
    const now = new Date().toISOString();
    const clone: StudySet = {
      ...set,
      id: createStudyId("set"),
      title: `${set.title} Copy`,
      visibility: "private",
      createdAt: now,
      updatedAt: now,
      cards: set.cards.map((card, index) => ({
        ...card,
        id: createStudyId("card"),
        orderIndex: index,
      })),
    };
    setLibrary((current) => ({ ...current, sets: [clone, ...current.sets] }));
    setSelectedSetId(clone.id);
    openStudyScreen("overview", clone.id);
    showToast("Copied into your library.");

    if (isSignedIn) {
      fetch("/api/study/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set: clone }),
      }).catch(() => undefined);
    }
  };

  const addPublicSetToLibrary = (set: StudySet) => {
    const existing = library.sets.find((entry) => entry.title === set.title && entry.course === set.course);
    if (existing) {
      setSelectedSetId(existing.id);
      openStudyScreen("overview", existing.id);
      showToast("A copy of this shared set is already in your library.");
      return;
    }

    const localCopy: StudySet = {
      ...set,
      id: createStudyId("set"),
      visibility: "private",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cards: set.cards.map((card, index) => ({
        ...card,
        id: createStudyId("card"),
        orderIndex: index,
      })),
    };

    setLibrary((current) => ({
      ...current,
      sets: [localCopy, ...current.sets],
    }));
    setSelectedSetId(localCopy.id);
    openStudyScreen("overview", localCopy.id);
    showToast("Added shared set to your library.");

    if (isSignedIn) {
      fetch("/api/study/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set: localCopy }),
      }).catch(() => undefined);
    }
  };

  const deleteSet = (setId: string, options?: { stayOnCreate?: boolean }) => {
    const target = library.sets.find((set) => set.id === setId);
    if (!target) return;

    const confirmed = window.confirm(`Delete "${target.title}"? This will remove the set and its local study progress.`);
    if (!confirmed) return;

    fetch("/api/study/public-sets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setId }),
    }).catch(() => undefined);

    if (isSignedIn) {
      fetch(`/api/study/sets/${encodeURIComponent(setId)}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }

    setLibrary((current) => ({
      ...current,
      sets: current.sets.filter((set) => set.id !== setId),
      groups: current.groups.map((group) => ({
        ...group,
        setIds: group.setIds.filter((existingSetId) => existingSetId !== setId),
      })),
      progress: Object.fromEntries(Object.entries(current.progress).filter(([key]) => key !== setId)),
      sessions: current.sessions.filter((session) => session.setId !== setId),
      quizResults: current.quizResults.filter((result) => result.setId !== setId),
    }));

    const remaining = library.sets.filter((set) => set.id !== setId);
    setSelectedSetId(remaining[0]?.id || "");
    if (options?.stayOnCreate) {
      router.push("/study/create?type=flashcards");
    } else {
      openStudyScreen(remaining.length ? "overview" : "dashboard", remaining[0]?.id);
    }
    showToast("Study set deleted.");
  };

  const moveSetToFolder = (setId: string, folder: string) => {
    const normalizedFolder = normalizeFolderPath(folder);
    let nextSet: StudySet | null = null;

    setLibrary((current) => {
      const sets = current.sets.map((set) => {
        if (set.id !== setId) return set;
        nextSet = { ...set, folder: normalizedFolder, updatedAt: new Date().toISOString() };
        return nextSet;
      });
      return { ...current, sets };
    });

    if (!nextSet) return;

    showToast(normalizedFolder ? `Moved to ${folderLabelFromPath(normalizedFolder)}.` : "Removed from folder.");

    if (isSignedIn) {
      fetch("/api/study/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set: nextSet }),
      }).catch(() => undefined);
    }
  };

  const moveNoteToFolder = (noteId: string, folder: string) => {
    const normalizedFolder = normalizeFolderPath(folder);

    setLibrary((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === noteId
          ? {
              ...note,
              folder: normalizedFolder,
              updatedAt: new Date().toISOString(),
            }
          : note,
      ),
    }));

    showToast(normalizedFolder ? `Moved to ${folderLabelFromPath(normalizedFolder)}.` : "Removed from folder.");
  };

  const createSubfolder = (parent: string) => {
    const nextLabel = window.prompt("New folder name");
    if (!nextLabel) return;
    const nextPath = normalizeFolderPath(`${parent}/${nextLabel}`);
    if (!nextPath) return;
    setCustomFolders((current) => (current.includes(nextPath) ? current : [nextPath, ...current]));
    router.push(`/study?folder=${encodeURIComponent(nextPath)}`);
    showToast(`Created ${folderLabelFromPath(nextPath)}.`);
  };

  const renameCurrentFolder = (path: string) => {
    const nextLabel = window.prompt("Rename folder", folderLabelFromPath(path));
    if (!nextLabel) return;
    const nextPath = normalizeFolderPath(parentFolderPath(path) ? `${parentFolderPath(path)}/${nextLabel}` : nextLabel);
    if (!nextPath || nextPath === path) return;

    setCustomFolders((current) => {
      const updated = current.map((entry) => (isFolderOrDescendant(path, entry) ? `${nextPath}${entry.slice(path.length)}` : entry));
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
    setFolderActionsOpen(false);
    router.push(`/study?folder=${encodeURIComponent(nextPath)}`);
    showToast(`Renamed to ${folderLabelFromPath(nextPath)}.`);
  };

  const deleteCurrentFolder = (path: string) => {
    if (!window.confirm(`Delete "${folderLabelFromPath(path)}" and remove its folder assignments?`)) return;

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
    setFolderActionsOpen(false);
    router.push("/study?view=library");
    showToast("Folder deleted.");
  };

  const importFromText = () => {
    const parsed = parseExplicitFlashcardsFromText(importText).map((card, index) => ({
      ...emptyDraftCard(index),
      front: card.front,
      back: card.back,
    }));

    if (!parsed.length) {
      showToast("Use clear flashcard text like Term :: Definition or Question on one line and Answer below it.", "error");
      return;
    }

    setDraftSet((current) => ({
      ...current,
      cards: parsed,
    }));
    showToast("Imported cards from text.");
  };

  const generateWithAi = async () => {
    if (!importText.trim()) {
      showToast("Paste notes, syllabus text, or lecture material first.", "error");
      return;
    }
    setIsGenerating(true);
    try {
      const explicitCards = parseExplicitFlashcardsFromText(importText);
      const response = await fetch("/api/study/generate-flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceMaterial: importText,
          course: draftSet.course,
          topic: draftSet.subject || draftSet.title,
          desiredCount: explicitCards.length || estimateFlashcardCountFromText(importText),
          difficultyTarget: draftSet.difficulty,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to generate flashcards.");

      setDraftSet((current) => ({
        ...current,
        title: current.title || payload.setTitle,
        cards: (Array.isArray(payload.cards) ? payload.cards : []).map((card: GeneratedCardPayload, index: number) => ({
          ...emptyDraftCard(index),
          front: card.front,
          back: card.back,
          hint: card.hint || "",
          difficulty: card.difficulty || "medium",
          tags: Array.isArray(card.tags) ? card.tags : [],
        })),
      }));
      showToast("AI study cards generated.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "AI generation failed.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateStudyGuide = async () => {
    if (!importText.trim()) {
      setDraftGuideErrors((current) => ({ ...current, content: "Paste your source text before generating a study guide." }));
      showToast("Paste your notes, reading, or lecture text first.", "error");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("/api/study/notes/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: importText,
          course: draftGuide.course,
          subject: draftGuide.subject,
          title: draftGuide.title || "Study Guide",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to generate study guide.");

      setGeneratedGuide(payload as StructuredLectureNotes);
      setDraftGuide((current) => ({
        ...current,
        title: current.title || (payload as StructuredLectureNotes).title || "Study Guide",
        rawContent: importText,
        structuredContent: payload as StructuredLectureNotes,
        status: "ready",
      }));
      showToast("Study guide generated.", "reward");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Study guide generation failed.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const importPdfFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/study/parse-pdf", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not read that file.");
      setImportText((current) => [current, payload.text].filter(Boolean).join("\n\n").trim());
      showToast(file.type === "application/pdf" ? "PDF text added." : "File text added.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not import that file.", "error");
    }
  };

  const saveStudyGuide = async () => {
    const nextErrors: DraftGuideErrors = {};
    if (!draftGuide.title.trim()) nextErrors.title = "Enter a guide title.";
    if (!draftGuide.course.trim()) nextErrors.course = "Choose what class this guide is for.";
    if (!importText.trim()) nextErrors.content = "Paste the source text for this guide.";
    if (!generatedGuide) nextErrors.guide = "Generate the guide before saving it.";

    if (Object.keys(nextErrors).length > 0) {
      setDraftGuideErrors(nextErrors);
      showToast("Fill the required fields before saving.", "error");
      return;
    }

    setDraftGuideErrors({});

    const now = new Date().toISOString();
    let nextGuide: StudyNote = {
      ...draftGuide,
      title: draftGuide.title.trim(),
      folder: normalizeFolderPath(draftGuide.folder || ""),
      course: draftGuide.course.trim(),
      subject: draftGuide.subject.trim() || "General",
      rawContent: importText.trim(),
      structuredContent: generatedGuide,
      transcriptContent: "",
      sourceType: "imported",
      visibility: draftGuide.visibility,
      status: "ready",
      updatedAt: now,
      createdAt: draftGuide.createdAt || now,
      lastOpenedAt: now,
    };

    if (nextGuide.visibility === "public") {
      try {
        const publishResponse = await fetch("/api/study/public-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: nextGuide }),
        });
        const publishPayload = await publishResponse.json();
        if (!publishResponse.ok) {
          nextGuide = { ...nextGuide, visibility: "private" };
          showToast(publishPayload.error || "This guide was kept private.", "error");
        } else {
          showToast("Study guide saved and shared.");
        }
      } catch {
        nextGuide = { ...nextGuide, visibility: "private" };
        showToast("Could not publish this guide, so it was saved privately instead.", "error");
      }
    } else {
      try {
        await fetch("/api/study/public-notes", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId: nextGuide.id }),
        });
      } catch {}
    }

    setLibrary((current) => {
      const exists = current.notes.some((note) => note.id === nextGuide.id);
      return {
        ...current,
        notes: exists
          ? current.notes.map((note) => (note.id === nextGuide.id ? nextGuide : note))
          : [nextGuide, ...current.notes],
      };
    });

    if (nextGuide.visibility !== "public") {
      showToast("Study guide saved.");
    }

    setDraftGuide(emptyDraftGuide());
    setGeneratedGuide(null);
    setImportText("");
    router.push(`/study?mode=notes&note=${encodeURIComponent(nextGuide.id)}`);
  };

  const updateCardProgress = (setId: string, cardId: string, updater: (current: CardProgress) => CardProgress) => {
    setLibrary((current) => {
      const setProgress = current.progress[setId] ?? {};
      const nextProgress = updater(setProgress[cardId] ?? getDefaultProgress(cardId));
      return {
        ...current,
        progress: {
          ...current.progress,
          [setId]: {
            ...setProgress,
            [cardId]: nextProgress,
          },
        },
      };
    });
  };

  const saveSession = (session: ReturnType<typeof buildStudySession>) => {
    setLibrary((current) => ({
      ...current,
      sessions: [session, ...current.sessions].slice(0, 120),
    }));

    if (isSignedIn) {
      fetch("/api/study/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session }),
      }).catch(() => undefined);
    }
  };

  const saveQuizResult = (result: QuizResult) => {
    setLibrary((current) => ({
      ...current,
      quizResults: [result, ...current.quizResults].slice(0, 80),
    }));
  };

  const createGroup = async () => {
    if (!isSignedIn) {
      showToast("Sign in with Google to create a verified study group.", "error");
      promptGoogleSignIn();
      return;
    }

    const name = groupName.trim();
    if (!name) {
      showToast("Add a study group name first.", "error");
      return;
    }

    try {
      const response = await fetch("/api/study/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          course: groupCourse.trim(),
          description: groupDescription.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to create study group.");
      }

      const nextGroup = payload.group as StudyGroup;
      setLibrary((current) => ({
        ...current,
        groups: [nextGroup, ...current.groups.filter((group) => group.id !== nextGroup.id)],
      }));
      setSelectedGroupId(nextGroup.id);
      setGroupTab("materials");
      setGroupName("");
      setGroupCourse("");
      setGroupDescription("");
      setCreateGroupOpen(false);
      showToast("Study group created.");
      openStudyScreen("groups");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to create study group.", "error");
    }
  };

  const joinGroup = async () => {
    if (!isSignedIn) {
      showToast("Sign in with Google to join verified study groups.", "error");
      promptGoogleSignIn();
      return;
    }

    const code = inviteCodeInput.trim().toUpperCase();
    if (!code) {
      showToast("Enter an invite code first.", "error");
      return;
    }

    try {
      const response = await fetch("/api/study/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: code }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to join study group.");
      }

      const matchingGroup = payload.group as StudyGroup;
      setLibrary((current) => ({
        ...current,
        groups: [matchingGroup, ...current.groups.filter((group) => group.id !== matchingGroup.id)],
      }));
      setInviteCodeInput("");
      setSelectedGroupId(matchingGroup.id);
      setGroupTab("materials");
      showToast("Joined study group.");
      openStudyScreen("groups");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to join study group.", "error");
    }
  };

  const deleteGroup = async (groupId: string) => {
    const target = library.groups.find((group) => group.id === groupId);
    if (!target) return;
    const confirmed = window.confirm(`Delete "${target.name}"?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/study/groups/${encodeURIComponent(groupId)}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete study group.");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to delete study group.", "error");
      return;
    }

    setLibrary((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== groupId),
    }));
    if (selectedGroupId === groupId) {
      const next = library.groups.find((group) => group.id !== groupId);
      setSelectedGroupId(next?.id || "");
    }
    showToast("Study group deleted.");
  };

  const addSetToGroup = async (groupId: string, setId: string) => {
    try {
      const response = await fetch(`/api/study/groups/${encodeURIComponent(groupId)}/sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to link study set.");
      }
      const updatedGroup = payload.group as StudyGroup;
      setLibrary((current) => ({
        ...current,
        groups: current.groups.map((group) => (group.id === groupId ? updatedGroup : group)),
      }));
      showToast("Set added to group.");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to link study set.", "error");
      return false;
    }
  };

  const createSetFromNotes = (nextSet: StudySet) => {
    setLibrary((current) => ({
      ...current,
      sets: [nextSet, ...current.sets],
    }));
    setSelectedSetId(nextSet.id);
    openStudyScreen("overview", nextSet.id);
    setSurface("flashcards");

    if (isSignedIn) {
      fetch("/api/study/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set: nextSet }),
      }).catch(() => undefined);
    }
  };

  const focusedModeContent =
    selectedSet && screen === "flashcards" ? (
      <FlashcardsMode
        set={selectedSet}
        progressMap={selectedProgress}
        onBack={() => openStudyScreen("overview", selectedSet.id)}
        onModeChange={(nextScreen) => openStudyScreen(nextScreen, selectedSet.id)}
        onProgress={(cardId, result) => updateCardProgress(selectedSet.id, cardId, (current) => updateProgressForReview(current, result))}
        onToggleFlag={(cardId, patch) =>
          updateCardProgress(selectedSet.id, cardId, (current) => ({ ...current, ...patch }))
        }
        onSessionSave={saveSession}
        onCelebrate={(message) => showToast(message, "reward")}
      />
    ) : selectedSet && screen === "learn" ? (
      <LearnMode
        set={selectedSet}
        progressMap={selectedProgress}
        onBack={() => openStudyScreen("overview", selectedSet.id)}
        onProgress={(cardId, result) => updateCardProgress(selectedSet.id, cardId, (current) => updateProgressForReview(current, result))}
        onSessionSave={saveSession}
        onCelebrate={(message) => showToast(message, "reward")}
      />
    ) : selectedSet && screen === "test" ? (
      <AssessmentMode
        title="Test"
        set={selectedSet}
        progressMap={selectedProgress}
        onBack={() => openStudyScreen("overview", selectedSet.id)}
        onProgress={(cardId, result) => updateCardProgress(selectedSet.id, cardId, (current) => updateProgressForReview(current, result))}
        onSessionSave={saveSession}
        onResultSave={saveQuizResult}
        onCelebrate={(message) => showToast(message, "reward")}
      />
    ) : selectedSet && screen === "match" ? (
      <MatchMode
        set={selectedSet}
        onBack={() => openStudyScreen("overview", selectedSet.id)}
        onSessionSave={saveSession}
        onProgress={(cardId, result) => updateCardProgress(selectedSet.id, cardId, (current) => updateProgressForReview(current, result))}
        onCelebrate={(message) => showToast(message, "reward")}
      />
    ) : null;

  if (!hydrated) {
    return <StudyWorkspaceSkeleton />;
  }

  if (isCreateRoute) {
    return (
      <main className="min-h-screen bg-transparent pb-20 text-white">
        <div className="mx-auto max-w-[1240px] px-1 pb-14 pt-3 sm:px-2">
          <div className="study-appear mb-8 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-[2rem] font-bold tracking-[-0.04em] text-white">
                {isGuideCreateRoute ? "Create a new study guide" : "Create a new flashcard set"}
              </h1>
            </div>
            <button
              onClick={() => router.push("/study")}
              {...magneticHoverProps}
              className="study-premium-button inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-zinc-200"
              aria-label="Close create view"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {isGuideCreateRoute ? (
            <GuideCreateView
              draftGuide={draftGuide}
              generatedGuide={generatedGuide}
              availableFolders={availableFolders}
              courseSuggestions={courseSuggestions}
              importText={importText}
              isGenerating={isGenerating}
              draftGuideErrors={draftGuideErrors}
              onDraftGuideChange={setDraftGuide}
              onImportTextChange={setImportText}
              onGenerate={generateStudyGuide}
              onImportPdfFile={importPdfFile}
              onSave={saveStudyGuide}
            />
          ) : (
            <CreateView
              draftSet={draftSet}
              importText={importText}
              isGenerating={isGenerating}
              draggingCardId={draggingCardId}
              isEditing={Boolean(searchParams.get("edit"))}
              onDraftSetChange={setDraftSet}
              onImportTextChange={setImportText}
              onGenerateWithAi={generateWithAi}
              onImportPdfFile={importPdfFile}
              onImportFromText={importFromText}
              onRequestSave={openSaveDestinationDialog}
              onDeleteSet={deleteDraftSet}
              draftSetErrors={draftSetErrors}
              onDragStart={setDraggingCardId}
              onDragEnd={() => setDraggingCardId(null)}
              onReorder={(draggedId, targetId) =>
                setDraftSet((current) => ({ ...current, cards: reorderCards(current.cards, draggedId, targetId) }))
              }
            />
          )}
        </div>

        {toast && (
          <div
            className={`study-toast fixed bottom-5 right-5 z-50 rounded-full px-4 py-2 text-sm font-medium shadow-[0_20px_45px_rgba(0,0,0,0.35)] ${
              toast.tone === "reward"
                ? "border border-emerald-400/25 bg-[linear-gradient(180deg,rgba(16,30,24,0.96),rgba(12,21,18,0.94))] text-emerald-100"
                : toast.tone === "error"
                ? "border border-red-400/25 bg-[linear-gradient(180deg,rgba(26,17,19,0.95),rgba(18,13,15,0.92))] text-red-100"
                : "border border-white/12 bg-[linear-gradient(180deg,rgba(23,26,34,0.95),rgba(17,20,28,0.92))] text-zinc-100"
            }`}
          >
            {toast.message}
          </div>
        )}
        {saveDestinationDialog ? (
          <SaveSetDialog
            dialog={saveDestinationDialog}
            availableFolders={availableFolders}
            onDialogChange={setSaveDestinationDialog}
            onCancel={() => setSaveDestinationDialog(null)}
            onConfirm={() => {
              void confirmSaveDestination();
            }}
          />
        ) : null}
      </main>
    );
  }

  if (standaloneSetView && selectedSet) {
    return (
      <main className="min-h-screen bg-transparent pb-20 text-white">
        <div className="mx-auto max-w-[1120px] px-4 pb-14 pt-5 sm:px-6">
          <div className="study-appear mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={() => router.push("/study?view=library")}
              {...magneticHoverProps}
              className="study-premium-button inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-zinc-100"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to all sets
            </button>
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">
              Focused set view
            </div>
          </div>

          <section className="space-y-6">
            {screen === "overview" && (
              <OverviewView
                set={selectedSet}
                progressMap={selectedProgress}
                availableFolders={availableFolders}
                onModeChange={(nextScreen) => openStudyScreen(nextScreen, selectedSet.id)}
                onMoveToFolder={(folder) => moveSetToFolder(selectedSet.id, folder)}
                onDuplicate={() => duplicateSet(selectedSet)}
                onDelete={() => deleteSet(selectedSet.id)}
                onEdit={() => {
                  router.push(`/study/create?edit=${encodeURIComponent(selectedSet.id)}`);
                }}
              />
            )}
            {screen !== "overview" && focusedModeContent}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-transparent pb-20 text-white">
      {surface === "home" && !libraryView && !folderFilter && screen !== "groups" ? (
        <FeatureTour
          storageKey="uichicago-tour-study-home-v1"
          steps={[
            {
              targetId: "study-nav-search",
              title: "Search across your study space",
              description: "Use the top search to jump between your sets, folders, and notes without manually hunting for them.",
            },
            {
              targetId: "study-nav-create",
              title: "Create something quickly",
              description: "The plus button opens fast actions for new sets, study guides, folders, and groups.",
            },
            {
              targetId: "study-home-recents",
              title: "Pick up where you left off",
              description: "Your recent and active sets live here, so you can open a deck and continue studying in one click.",
            },
            {
              targetId: "study-home-modes",
              title: "Switch between study styles",
              description: "Jump into flashcards, notes, or AI-generated study guides depending on how you want to prepare.",
            },
          ]}
        />
      ) : null}
      <div className="mx-auto max-w-[1280px] px-1 pb-16 pt-3 sm:px-2">
        {surface === "home" ? (
          <div className="space-y-6">
            {screen === "groups" ? (
              <GroupsView
                groups={library.groups}
                sets={library.sets}
                selectedSet={selectedSet}
                selectedGroup={selectedGroup}
                selectedGroupId={selectedGroupId}
                groupTab={groupTab}
                createGroupOpen={createGroupOpen}
                groupName={groupName}
                groupCourse={groupCourse}
                groupDescription={groupDescription}
                inviteCodeInput={inviteCodeInput}
                onSelectGroup={setSelectedGroupId}
                onGroupTabChange={setGroupTab}
                onCreateGroupOpenChange={setCreateGroupOpen}
                onGroupNameChange={setGroupName}
                onGroupCourseChange={setGroupCourse}
                onGroupDescriptionChange={setGroupDescription}
                onInviteCodeInputChange={setInviteCodeInput}
                onCreateGroup={createGroup}
                onJoinGroup={joinGroup}
                onDeleteGroup={deleteGroup}
                onAddSetToGroup={addSetToGroup}
                onOpenAddSetPicker={setGroupSetPickerGroupId}
              />
            ) : (
            <>
            {libraryView ? (
              <section className="study-appear">
                <div className="flex flex-col gap-5">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-200/80">
                      Your school
                    </div>
                    <h1 className="text-[2.2rem] font-bold tracking-[-0.05em] text-white md:text-[2.7rem]">
                      Your library
                    </h1>
                  </div>

                  <div className="hide-scroll flex items-center gap-6 overflow-x-auto border-b border-white/10 pb-3 text-sm">
                    <button
                      onClick={() => setLibrarySection("flashcards")}
                      className={`pb-3 font-semibold transition ${librarySection === "flashcards" ? "border-b-2 border-[#7b61ff] text-white" : "text-zinc-400 hover:text-white"}`}
                    >
                      Flashcard sets
                    </button>
                    <button
                      onClick={() => setLibrarySection("notes")}
                      className={`pb-3 font-semibold transition ${librarySection === "notes" ? "border-b-2 border-[#7b61ff] text-white" : "text-zinc-400 hover:text-white"}`}
                    >
                      Notes
                    </button>
                    <button
                      onClick={() => setLibrarySection("groups")}
                      className={`pb-3 font-semibold transition ${librarySection === "groups" ? "border-b-2 border-[#7b61ff] text-white" : "text-zinc-400 hover:text-white"}`}
                    >
                      Study groups
                    </button>
                    <button
                      onClick={() => setLibrarySection("guides")}
                      className={`pb-3 font-semibold transition ${librarySection === "guides" ? "border-b-2 border-[#7b61ff] text-white" : "text-zinc-400 hover:text-white"}`}
                    >
                      Study guides
                    </button>
                  </div>

                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    {(librarySection === "flashcards" && setList.length > 0) ||
                    (librarySection === "notes" && matchingNotes.length > 0) ||
                    (librarySection === "groups" && matchingGroups.length > 0) ||
                    (librarySection === "guides" && matchingGuides.length > 0) ? (
                      <select
                        value={difficultyFilter}
                        onChange={(event) => setDifficultyFilter(event.target.value)}
                        className="h-10 w-full rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-200 outline-none lg:min-w-[140px] lg:w-auto"
                      >
                        <option value="all">Recent</option>
                        {librarySection === "flashcards" ? (
                          <>
                            <option value="easy">Easy sets</option>
                            <option value="medium">Medium sets</option>
                            <option value="hard">Hard sets</option>
                          </>
                        ) : null}
                      </select>
                    ) : (
                      <div className="text-sm text-zinc-500">
                        {librarySection === "flashcards" && "No flashcard sets yet"}
                        {librarySection === "notes" && "No notes yet"}
                        {librarySection === "groups" && "No study groups yet"}
                        {librarySection === "guides" && "No study guides yet"}
                      </div>
                    )}
                    <div className="relative w-full max-w-[360px]">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={librarySearchPlaceholder}
                        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-500"
                      />
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
            {folderFilter ? (
              <section className="mx-auto max-w-[860px] space-y-8 pb-24">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] text-white">
                        <Folder className="h-8 w-8" />
                      </div>
                      <div>
                        <h2 className="text-[2rem] font-bold tracking-[-0.04em] text-white">
                          {folderLabelFromPath(folderFilter)}
                        </h2>
                        <div className="mt-1 text-sm text-zinc-400">Add course info</div>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      <button className="rounded-full border border-white/40 bg-transparent px-4 py-2 text-sm font-semibold text-white">
                        All
                      </button>
                      <button className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-zinc-300">
                        + Tag
                      </button>
                    </div>
                  </div>

                  <div className="relative flex w-full flex-col items-start gap-3 lg:max-w-[420px]">
                    <button
                      onClick={() => setFolderActionsOpen((current) => !current)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-zinc-200"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {folderActionsOpen ? (
                      <div className="absolute left-0 top-12 z-20 w-[220px] rounded-[1.2rem] border border-white/10 bg-[#171b42] p-2 shadow-[0_24px_50px_rgba(0,0,0,0.36)]">
                        <button
                          onClick={() => renameCurrentFolder(folderFilter)}
                          className="flex w-full items-center gap-2 rounded-[0.9rem] px-3 py-2.5 text-left text-sm font-medium text-zinc-200 transition hover:bg-white/[0.06]"
                        >
                          <Pencil className="h-4 w-4" />
                          Rename folder
                        </button>
                        <button
                          onClick={() => createSubfolder(folderFilter)}
                          className="mt-1 flex w-full items-center gap-2 rounded-[0.9rem] px-3 py-2.5 text-left text-sm font-medium text-zinc-200 transition hover:bg-white/[0.06]"
                        >
                          <FolderPlus className="h-4 w-4" />
                          New folder
                        </button>
                        <button
                          onClick={() => {
                            setFolderLibraryPickerOpen(true);
                            setFolderActionsOpen(false);
                          }}
                          className="mt-1 flex w-full items-center gap-2 rounded-[0.9rem] px-3 py-2.5 text-left text-sm font-medium text-zinc-200 transition hover:bg-white/[0.06]"
                        >
                          <BookOpen className="h-4 w-4" />
                          Add from library
                        </button>
                        <button
                          onClick={() => deleteCurrentFolder(folderFilter)}
                          className="mt-1 flex w-full items-center gap-2 rounded-[0.9rem] px-3 py-2.5 text-left text-sm font-medium text-red-200 transition hover:bg-red-500/[0.12]"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete folder
                        </button>
                      </div>
                    ) : null}
                    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
                      <select
                        value="recent"
                        onChange={() => undefined}
                        className="h-10 w-full rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-200 outline-none sm:w-[140px]"
                      >
                        <option value="recent">Recent</option>
                      </select>
                      <div className="relative w-full">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Search this folder"
                          className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-5 flex items-center gap-2 text-sm font-medium text-zinc-300">
                    <span>Recent</span>
                  </div>
                  <div className="space-y-5">
                    {folderSetPreview.length ? (
                      folderSetPreview.map((set) => (
                        <button
                          key={set.id}
                          onClick={() => {
                            setSelectedSetId(set.id);
                            openStudyScreen("overview", set.id);
                          }}
                          className="flex w-full items-start gap-4 text-left transition hover:opacity-90"
                        >
                          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#253a6a] text-sky-200">
                            <BookOpen className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="line-clamp-1 text-sm font-semibold text-white">{set.title}</div>
                            <div className="mt-1 text-xs text-zinc-300">
                              Flashcard set • {set.cards.length} terms • by you
                            </div>
                          </div>
                          <MoreHorizontal className="mt-1 h-4 w-4 text-zinc-500" />
                        </button>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] px-5 py-6 text-sm text-zinc-400">
                        No flashcard sets inside this folder yet.
                      </div>
                    )}
                  </div>
                </div>

                {childFolders.length ? (
                  <div>
                    <div className="mb-4 text-sm font-medium text-zinc-300">Subfolders</div>
                    <div className="space-y-4">
                      {childFolders.map((folder) => (
                        <button
                          key={folder}
                          onClick={() => router.push(`/study?folder=${encodeURIComponent(folder)}`)}
                          className="flex w-full items-start gap-4 text-left transition hover:opacity-90"
                        >
                          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-white">
                            <Folder className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="line-clamp-1 text-sm font-semibold text-white">{folderLabelFromPath(folder)}</div>
                            <div className="mt-1 text-xs text-zinc-300">Folder • by you</div>
                          </div>
                          <MoreHorizontal className="mt-1 h-4 w-4 text-zinc-500" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-[#1f2147] p-2 shadow-[0_20px_40px_rgba(0,0,0,0.34)]">
                  <button className="rounded-full bg-white/[0.1] px-12 py-3 text-sm font-semibold text-zinc-300">
                    Study
                  </button>
                  <button
                    onClick={() => router.push(`/study/create?type=flashcards&folder=${encodeURIComponent(folderFilter)}`)}
                    className="rounded-full bg-[#5561ff] px-8 py-3 text-sm font-semibold text-white"
                  >
                    + Add sets
                  </button>
                  <button className="inline-flex h-11 w-14 items-center justify-center rounded-full border border-[#4f68ff] bg-[#171a38] text-[#8ea5ff]">
                    <Sparkles className="h-4 w-4" />
                  </button>
                </div>
              </section>
            ) : (
            <section className={`${libraryView || folderFilter ? "space-y-8" : "mx-auto max-w-[860px] space-y-10"}`}>

              {librarySection === "flashcards" && selectedSet && !libraryView && !folderFilter ? (
                <div>
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                    Jump back in
                  </div>
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.75fr)]">
                    <div className="rounded-[1.5rem] border border-white/10 bg-[#2b2955] p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="truncate text-[1.45rem] font-semibold text-white">{selectedSet.title}</div>
                          <div className="mt-1 text-sm text-zinc-300">
                            {selectedSet.cards.length} cards sorted
                          </div>
                        </div>
                        <button
                          onClick={() => openStudyScreen("overview", selectedSet.id)}
                          className="rounded-full p-2 text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                          aria-label="Open set"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-3 rounded-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-indigo-300"
                          style={{ width: `${Math.max(10, dashboard.averageAccuracy)}%` }}
                        />
                      </div>
                      <div className="mt-2 text-xs text-zinc-400">
                        {dashboard.totalCards}/{Math.max(dashboard.totalCards, selectedSet.cards.length)} cards tracked
                      </div>
                      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                        <button
                          onClick={() => {
                            openSurface("flashcards");
                            openStudyScreen("flashcards", selectedSet.id);
                          }}
                          className="rounded-full bg-[#4f46e5] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5b54ef]"
                        >
                          Continue
                        </button>
                        <button
                          onClick={() => openStudyScreen("overview", selectedSet.id)}
                          className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.09]"
                        >
                          View set
                        </button>
                      </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-white/10 bg-[#2f355f] p-5">
                      <div className="text-sm font-semibold text-white">Keep the streak going</div>
                      <div className="mt-3 text-sm leading-6 text-zinc-300">
                        Your strongest deck right now is <span className="font-semibold text-white">{selectedSet.title}</span>. One quick round in Learn or Match keeps the momentum up.
                      </div>
                      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                        <button
                          onClick={() => {
                            openSurface("flashcards");
                            openStudyScreen("learn", selectedSet.id);
                          }}
                          className="rounded-full bg-white/[0.08] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.14]"
                        >
                          Learn
                        </button>
                        <button
                          onClick={() => {
                            openSurface("flashcards");
                            openStudyScreen("match", selectedSet.id);
                          }}
                          className="rounded-full bg-white/[0.08] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.14]"
                        >
                          Match
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {librarySection === "flashcards" ? (
                libraryView ? (
                  <div className="space-y-8">
                    {setList.length ? (
                      groupSetsByPeriod(setList).map((group) => (
                        <div key={group.label}>
                          <div className="mb-3 flex items-center gap-3">
                            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                              {group.label}
                            </div>
                            <div className="h-px flex-1 bg-white/10" />
                          </div>
                          <div className="space-y-2">
                            {group.items.map((set) => (
                              <div
                                key={set.id}
                                className="flex items-center gap-3 rounded-lg border border-white/8 bg-[#444d74] px-4 py-3 transition hover:bg-[#4c567f]"
                              >
                                <button
                                  onClick={() => {
                                    setSelectedSetId(set.id);
                                    openStudyScreen("overview", set.id);
                                  }}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <div className="text-[11px] font-semibold text-zinc-200">
                                    {set.cards.length} Terms
                                    <span className="mx-2 text-zinc-400">•</span>
                                    {set.course || set.subject || "by you"}
                                  </div>
                                  <div className="mt-1 text-[1.15rem] font-semibold text-white">{set.title}</div>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMoveLibraryItem({ type: "set", id: set.id, title: set.title })}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-zinc-200 transition hover:bg-white/[0.14]"
                                  aria-label={`Move ${set.title} to folder`}
                                >
                                  <Folder className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.03] px-5 py-6 text-sm text-zinc-400">
                        No flashcard sets yet. Create one or turn notes into a study guide.
                      </div>
                    )}
                  </div>
                ) : (
                  <div data-tour="study-home-recents">
                    <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                      {globalQuery ? "Search results" : "Recents"}
                    </div>
                    <div className="grid gap-x-12 gap-y-5 md:grid-cols-2">
                      {setList.length ? (
                        setList.slice(0, 5).map((set) => (
                          <button
                            key={set.id}
                            onClick={() => {
                              setSelectedSetId(set.id);
                              openStudyScreen("overview", set.id);
                            }}
                            className="flex items-start gap-3 text-left transition hover:opacity-90"
                          >
                            <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#253a6a] text-sky-200">
                              <BookOpen className="h-3.5 w-3.5" />
                            </div>
                            <div>
                              <div className="line-clamp-1 text-sm font-semibold text-white">{set.title}</div>
                              <div className="mt-1 text-xs text-zinc-300">
                                {set.cards.length} cards • by you
                              </div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.03] px-5 py-6 text-sm text-zinc-400">
                          No flashcard sets yet. Create one or turn notes into a study guide.
                        </div>
                      )}
                    </div>
                  </div>
                )
              ) : null}

              {librarySection === "flashcards" && (folderFilter || globalQuery) && (
                <div>
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                    Matching notes
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {matchingNotes.length ? (
                      matchingNotes.slice(0, 6).map((note) => (
                        <button
                          key={note.id}
                          onClick={() => router.push(`/study?mode=notes&note=${encodeURIComponent(note.id)}`)}
                          className="block w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-4 text-left transition hover:bg-white/[0.08]"
                        >
                          <div className="text-[11px] text-zinc-400">{note.course || note.subject || "Note"}</div>
                          <div className="mt-1 text-[1.05rem] font-semibold text-white">{note.title}</div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">
                            {note.rawContent || note.transcriptContent || "Open note"}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.03] px-5 py-6 text-sm text-zinc-400">
                        No notes matched this search yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {librarySection === "notes" ? (
                <div>
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Recently added</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {matchingNotes.length ? (
                      matchingNotes.slice(0, 8).map((note) => (
                        <div
                          key={note.id}
                          className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-4 transition hover:bg-white/[0.08]"
                        >
                          <button
                            onClick={() => router.push(`/study?mode=notes&note=${encodeURIComponent(note.id)}`)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="text-[11px] text-zinc-400">{note.course || note.subject || "Note"}</div>
                            <div className="mt-1 text-[1.05rem] font-semibold text-white">{note.title}</div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">
                              {note.rawContent || note.transcriptContent || "Open note"}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMoveLibraryItem({ type: "note", id: note.id, title: note.title })}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-zinc-200 transition hover:bg-white/[0.14]"
                            aria-label={`Move ${note.title} to folder`}
                          >
                            <Folder className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.03] px-5 py-6 text-sm text-zinc-400">
                        No notes here yet. When you create one, it will show up here without leaving the library.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {librarySection === "groups" ? (
                <div>
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Your study groups</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {matchingGroups.length ? (
                      matchingGroups.slice(0, 8).map((group) => (
                        <button
                          key={group.id}
                          onClick={() => {
                            setSelectedGroupId(group.id);
                            openStudyScreen("groups");
                          }}
                          className="block w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-4 text-left transition hover:bg-white/[0.08]"
                        >
                          <div className="text-[11px] text-zinc-400">{group.course || "Study group"}</div>
                          <div className="mt-1 text-[1.05rem] font-semibold text-white">{group.name}</div>
                          <div className="mt-1 text-xs leading-5 text-zinc-400">
                            {group.memberNames.length} member{group.memberNames.length === 1 ? "" : "s"} • {group.setIds.length} set{group.setIds.length === 1 ? "" : "s"}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.03] px-5 py-6 text-sm text-zinc-400">
                        No study groups here yet. When you create or join one, it will show up here first.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {librarySection === "guides" ? (
                <div>
                  <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Study guides</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {matchingGuides.length ? (
                      matchingGuides.slice(0, 8).map((guide) => (
                        <div
                          key={guide.id}
                          className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-4 transition hover:bg-white/[0.08]"
                        >
                          <button
                            onClick={() => router.push(`/study?mode=notes&note=${encodeURIComponent(guide.id)}`)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="text-[11px] text-zinc-400">{guide.course || guide.subject || "Study guide"}</div>
                            <div className="mt-1 text-[1.05rem] font-semibold text-white">{guide.title}</div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">
                              {guide.structuredContent?.summary || guide.rawContent || "Open guide"}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMoveLibraryItem({ type: "note", id: guide.id, title: guide.title })}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.08] text-zinc-200 transition hover:bg-white/[0.14]"
                            aria-label={`Move ${guide.title} to folder`}
                          >
                            <Folder className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.03] px-5 py-6 text-sm text-zinc-400">
                        No study guides here yet. Create one and it will show up here in the library.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {librarySection === "flashcards" && !libraryView && !folderFilter ? (
              <div>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-300">
                  Personalize your content
                </div>
                <div className="rounded-[1.35rem] border border-white/10 bg-[#26264d] p-5 shadow-[inset_0_-20px_30px_rgba(84,94,156,0.08)]">
                  <div className="flex items-start justify-between gap-4">
                    <Search className="h-10 w-10 text-white" />
                    <MoreHorizontal className="h-5 w-5 text-zinc-400" />
                  </div>
                  <div className="mt-5 text-[1.05rem] font-semibold text-white">
                    Find the latest content based on your courses or exams
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-white/[0.08] px-4 py-2 text-xs font-semibold text-zinc-200">
                      Update school and courses
                    </span>
                    <span className="rounded-full bg-white/[0.08] px-4 py-2 text-xs font-semibold text-zinc-200">
                      Update standardized exams
                    </span>
                    <button className="ml-auto inline-flex h-10 w-16 items-center justify-center rounded-full border border-[#4f68ff] bg-[#171a38] text-[#8ea5ff] shadow-[0_0_0_2px_rgba(79,104,255,0.15)]">
                      <Sparkles className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              ) : null}

              {librarySection === "flashcards" && !libraryView && !folderFilter ? (
              <div>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-300">
                  Study exactly what you need
                </div>
                <div className="space-y-8">
                  <button
                    onClick={() => router.push("/study/create?type=flashcards")}
                    className="w-full rounded-[1.45rem] border border-white/10 bg-[#26264d] p-4 text-left transition hover:bg-[#2d2f58]"
                  >
                    <div className="flex h-full items-center gap-5">
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-white">Create your own flashcards</div>
                        <div className="mt-2 text-sm leading-6 text-zinc-300">
                          Study exactly what&apos;s on your test with your own sets and notes.
                        </div>
                        <div className="mt-5">
                          <span className="inline-flex rounded-full bg-[#4f46e5] px-5 py-2.5 text-sm font-semibold text-white">
                            Create flashcards
                          </span>
                        </div>
                      </div>
                      <div className="hidden h-40 w-[270px] overflow-hidden rounded-[1.2rem] border border-white/10 bg-[#d9e5fb] md:block">
                        <div className="relative flex h-full items-center justify-center">
                          <div className="absolute left-8 top-8 h-16 w-12 rounded-[0.9rem] bg-[#ffffff] shadow-[0_8px_20px_rgba(31,41,55,0.12)]" />
                          <div className="absolute left-16 top-11 h-16 w-12 rotate-[-10deg] rounded-[0.9rem] bg-[#7c8cff] shadow-[0_10px_24px_rgba(79,70,229,0.18)]" />
                          <div className="absolute right-8 top-6 h-20 w-24 rounded-[1rem] bg-[#fff7ed] shadow-[0_8px_20px_rgba(30,41,59,0.12)]" />
                          <div className="absolute right-16 top-11 h-1.5 w-12 rounded-full bg-[#94a3b8]" />
                          <div className="absolute right-16 top-16 h-1.5 w-10 rounded-full bg-[#cbd5e1]" />
                          <div className="absolute right-14 top-8 flex h-8 w-8 items-center justify-center rounded-full bg-[#fde68a] text-[#7c3aed]">
                            <Sparkles className="h-4 w-4" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>

                  {selectedSet ? (
                    <button
                      onClick={() => {
                        openSurface("flashcards");
                        openStudyScreen("match", selectedSet.id);
                      }}
                      className="w-full rounded-[1.45rem] border border-white/10 bg-[#26264d] p-4 text-left transition hover:bg-[#2d2f58]"
                    >
                      <div className="flex h-full items-center gap-5">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-white">Switch it up with a game</div>
                          <div className="mt-4 text-xl font-semibold text-white">{selectedSet.title}</div>
                          <div className="mt-2 text-sm leading-6 text-zinc-300">
                            Race against the clock to match terms.
                          </div>
                          <div className="mt-5">
                            <span className="inline-flex rounded-full bg-white/[0.12] px-5 py-2.5 text-sm font-semibold text-white">
                              Play Match
                            </span>
                          </div>
                        </div>
                        <div className="hidden h-40 w-[270px] overflow-hidden rounded-[1.2rem] border border-white/10 bg-[#d2eef5] md:block">
                          <div className="relative flex h-full items-center justify-center">
                            <div className="absolute inset-y-5 left-7 w-16 rounded-[1rem] bg-white/80" />
                            <div className="absolute inset-y-5 left-[6.2rem] w-16 rounded-[1rem] bg-[#b8e6d2]" />
                            <div className="absolute inset-y-5 right-7 w-16 rounded-[1rem] bg-white/85" />
                            <div className="absolute left-10 top-9 flex h-10 w-10 items-center justify-center rounded-full bg-[#4f46e5] text-white shadow-[0_10px_24px_rgba(79,70,229,0.25)]">
                              <X className="h-5 w-5" />
                            </div>
                            <div className="absolute right-10 bottom-9 flex h-10 w-10 items-center justify-center rounded-full bg-[#10b981] text-white shadow-[0_10px_24px_rgba(16,185,129,0.22)]">
                              <Check className="h-5 w-5" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  ) : null}
                </div>
              </div>
              ) : null}

              {librarySection === "flashcards" && !libraryView && !folderFilter ? (
              <div data-tour="study-home-modes" className="hidden grid gap-4 xl:grid-cols-3">
                <button
                  onClick={() => router.push("/study/create?type=flashcards")}
                  className="rounded-xl border border-white/10 bg-white/[0.05] p-5 text-left transition hover:bg-white/[0.08]"
                >
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Flashcards</div>
                  <div className="mt-2 text-xl font-semibold text-white">Create right away.</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-400">Jump straight into a new set, then find saved decks in your library or folders.</div>
                </button>
                <button
                  onClick={() => openSurface("notes")}
                  className="rounded-xl border border-white/10 bg-white/[0.05] p-5 text-left transition hover:bg-white/[0.08]"
                >
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Notes</div>
                  <div className="mt-2 text-xl font-semibold text-white">Capture lectures.</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-400">Write notes, record lectures, and clean them up later.</div>
                </button>
                <button
                  onClick={() => router.push("/study/create?type=guide")}
                  className="rounded-xl border border-white/10 bg-white/[0.05] p-5 text-left transition hover:bg-white/[0.08]"
                >
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Study guides</div>
                  <div className="mt-2 text-xl font-semibold text-white">Generate from text.</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-400">Paste material and turn it into a simple study guide.</div>
                </button>
              </div>
              ) : null}

              
            </section>
            )}
            </>
            )}
          </div>
        ) : surface === "notes" ? (
          <div className="space-y-4">
            <div className="study-appear flex items-center justify-between gap-4">
              <button
                onClick={goToStudyHome}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.07] hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to study home
              </button>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                Notes workspace
              </div>
            </div>
            <NotesWorkspace
              library={library}
              onLibraryChange={setLibrary}
              onCreateFlashcardSet={createSetFromNotes}
              showToast={showToast}
              externalQuery={globalQuery}
              folderFilter={folderFilter}
            />
          </div>
        ) : isFocusedStudyMode ? (
          <div className="study-appear">
            <div className="mx-auto max-w-[1380px]">
              {focusedModeContent}
            </div>
          </div>
        ) : (
          <>
        {!isFocusedStudyMode && <div className="study-appear mb-4">
          <button
            onClick={goToStudyHome}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.07] hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to study home
          </button>
        </div>}

        <div className={`grid gap-5 ${isFocusedStudyMode ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_270px] lg:items-start"}`}>
          <section className="order-1 space-y-6">
            {screen === "dashboard" && (
              <DashboardView
                library={library}
                selectedSet={selectedSet}
                selectedProgress={selectedProgress}
                dashboard={dashboard}
                onOpenSet={() => {
                  if (selectedSet?.id) {
                    router.push(`/study/set/${encodeURIComponent(selectedSet.id)}`);
                    return;
                  }
                  openStudyScreen("overview");
                }}
                onCreateSet={() => router.push("/study/create?type=flashcards")}
              />
            )}

            {screen === "groups" && (
              <GroupsView
                groups={library.groups}
                sets={library.sets}
                selectedSet={selectedSet}
                selectedGroup={selectedGroup}
                selectedGroupId={selectedGroupId}
                groupTab={groupTab}
                createGroupOpen={createGroupOpen}
                groupName={groupName}
                groupCourse={groupCourse}
                groupDescription={groupDescription}
                inviteCodeInput={inviteCodeInput}
                onSelectGroup={setSelectedGroupId}
                onGroupTabChange={setGroupTab}
                onCreateGroupOpenChange={setCreateGroupOpen}
                onGroupNameChange={setGroupName}
                onGroupCourseChange={setGroupCourse}
                onGroupDescriptionChange={setGroupDescription}
                onInviteCodeInputChange={setInviteCodeInput}
                onCreateGroup={createGroup}
                onJoinGroup={joinGroup}
                onDeleteGroup={deleteGroup}
                onAddSetToGroup={addSetToGroup}
                onOpenAddSetPicker={setGroupSetPickerGroupId}
              />
            )}

            {screen === "create" && (
              <CreateView
                draftSet={draftSet}
                importText={importText}
                isGenerating={isGenerating}
                draggingCardId={draggingCardId}
                isEditing={Boolean(searchParams.get("edit"))}
                onDraftSetChange={setDraftSet}
                onImportTextChange={setImportText}
                onGenerateWithAi={generateWithAi}
                onImportPdfFile={importPdfFile}
                onImportFromText={importFromText}
                onRequestSave={openSaveDestinationDialog}
                onDeleteSet={deleteDraftSet}
                draftSetErrors={draftSetErrors}
                onDragStart={setDraggingCardId}
                onDragEnd={() => setDraggingCardId(null)}
                onReorder={(draggedId, targetId) =>
                  setDraftSet((current) => ({ ...current, cards: reorderCards(current.cards, draggedId, targetId) }))
                }
              />
            )}

            {screen === "overview" && selectedSet && (
              <OverviewView
                set={selectedSet}
                progressMap={selectedProgress}
                availableFolders={availableFolders}
                onModeChange={(nextScreen) => openStudyScreen(nextScreen, selectedSet.id)}
                onMoveToFolder={(folder) => moveSetToFolder(selectedSet.id, folder)}
                onDuplicate={() => duplicateSet(selectedSet)}
                onDelete={() => deleteSet(selectedSet.id)}
                onEdit={() => {
                  router.push(`/study/create?edit=${encodeURIComponent(selectedSet.id)}`);
                }}
              />
            )}

          </section>

          {!isFocusedStudyMode && <aside className="order-2 space-y-4 lg:sticky lg:top-24">
            <div className="study-premium-panel study-appear rounded-[1.6rem] p-4 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Search className="h-4 w-4 text-zinc-400" />
                Find sets
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search your course, title, tags..."
                className="study-premium-input mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
              />
              <div className="mt-3 grid gap-2">
                <select
                  value={subjectFilter}
                  onChange={(event) => setSubjectFilter(event.target.value)}
                  className="study-premium-input rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-200 outline-none"
                >
                  <option value="all">All subjects</option>
                  {subjects.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
                <select
                  value={difficultyFilter}
                  onChange={(event) => setDifficultyFilter(event.target.value)}
                  className="study-premium-input rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-200 outline-none"
                >
                  <option value="all">All difficulty</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div className="mt-4 border-t border-white/8 pt-4">
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Library</div>
              </div>
              <div className="mt-3 space-y-2">
                {setList.slice(0, 6).map((set) => (
                  <div
                    key={set.id}
                    className={`rounded-2xl border px-4 py-3 transition ${
                      selectedSetId === set.id
                        ? "border-red-400/30 bg-red-500/10"
                        : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        onClick={() => {
                          setSelectedSetId(set.id);
                          openStudyScreen("overview", set.id);
                        }}
                        {...magneticHoverProps}
                        className="study-premium-button min-w-0 flex-1 text-left"
                      >
                        <div className="truncate text-sm font-semibold text-white">{set.title}</div>
                        <div className="mt-1 text-xs text-zinc-400">
                          {set.course || set.subject} • {set.cards.length} cards
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                          {set.visibility}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteSet(set.id)}
                          {...magneticHoverProps}
                          aria-label={`Delete ${set.title}`}
                          className="study-premium-button rounded-full border border-red-400/20 bg-red-500/10 p-2 text-red-200 hover:bg-red-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {search.trim().length >= 2 && (
              <div className="study-premium-panel study-appear rounded-[1.6rem] p-4 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Shared for students</div>
                  <div className="text-[11px] text-zinc-500">{publicSearchResults.length} found</div>
                </div>
                <div className="mt-3 space-y-2">
                  {publicSearchResults.length ? (
                    publicSearchResults.slice(0, 5).map((set) => {
                      const alreadyAdded = library.sets.some((entry) => entry.title === set.title && entry.course === set.course);
                      return (
                        <div key={set.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-white">{set.title}</div>
                              <div className="mt-1 text-xs text-zinc-400">
                                {[set.course || set.subject, `${set.cards.length} cards`].filter(Boolean).join(" • ")}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => addPublicSetToLibrary(set)}
                              {...magneticHoverProps}
                              className={`study-premium-button rounded-full px-3 py-1.5 text-xs font-semibold ${
                                alreadyAdded
                                  ? "border border-white/10 bg-white/[0.04] text-zinc-300"
                                  : "border border-emerald-400/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                              }`}
                            >
                              {alreadyAdded ? "Added" : "Add"}
                            </button>
                          </div>
                          {set.description ? (
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{set.description}</p>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-[1.25rem] border border-dashed border-white/12 bg-white/[0.03] px-4 py-5 text-sm leading-6 text-zinc-400">
                      No public study sets matched that course yet.
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>}
        </div>
      </>
        )}
      </div>

      {folderLibraryPickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-24">
          <div className="w-full max-w-[680px] rounded-[1.6rem] border border-white/10 bg-[#1a1645] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[1.7rem] font-bold tracking-[-0.04em] text-white">Add from library</div>
                <div className="mt-2 text-sm leading-6 text-zinc-400">
                  Add flashcard sets or notes from your library into {folderLabelFromPath(folderFilter)}.
                </div>
              </div>
              <button
                onClick={() => setFolderLibraryPickerOpen(false)}
                className="rounded-full p-2 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 space-y-3">
              {[...library.sets, ...library.notes].length ? (
                <>
                  {library.sets.map((set) => (
                    <button
                      key={set.id}
                      type="button"
                      onClick={() => moveSetToFolder(set.id, folderFilter)}
                      className="flex w-full items-start justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left transition hover:bg-white/[0.08]"
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">{set.title}</div>
                        <div className="mt-1 text-xs text-zinc-400">
                          Flashcard set • {[set.course || set.subject, `${set.cards.length} cards`].filter(Boolean).join(" • ")}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-zinc-300">{resolveSetFolder(set) === folderFilter ? "Added" : "Add"}</span>
                    </button>
                  ))}
                  {library.notes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => moveNoteToFolder(note.id, folderFilter)}
                      className="flex w-full items-start justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left transition hover:bg-white/[0.08]"
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">{note.title}</div>
                        <div className="mt-1 text-xs text-zinc-400">
                          {note.structuredContent ? "Study guide" : "Note"} • {note.course || note.subject || "General"}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-zinc-300">{resolveNoteFolder(note) === folderFilter ? "Added" : "Add"}</span>
                    </button>
                  ))}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.03] px-5 py-6 text-sm text-zinc-400">
                  Nothing in your library yet.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {moveLibraryItem ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-24">
          <div className="w-full max-w-[560px] rounded-[1.6rem] border border-white/10 bg-[#1a1645] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[1.7rem] font-bold tracking-[-0.04em] text-white">Move to folder</div>
                <div className="mt-2 text-sm leading-6 text-zinc-400">
                  Choose which folder should contain {moveLibraryItem.title}.
                </div>
              </div>
              <button
                onClick={() => setMoveLibraryItem(null)}
                className="rounded-full p-2 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={() => {
                  if (moveLibraryItem.type === "set") {
                    moveSetToFolder(moveLibraryItem.id, "");
                  } else {
                    moveNoteToFolder(moveLibraryItem.id, "");
                  }
                  setMoveLibraryItem(null);
                }}
                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                <span>No folder</span>
                <span className="text-xs text-zinc-400">Remove folder</span>
              </button>
              {availableFolders.map((folder) => (
                <button
                  key={folder}
                  type="button"
                  onClick={() => {
                    if (moveLibraryItem.type === "set") {
                      moveSetToFolder(moveLibraryItem.id, folder);
                    } else {
                      moveNoteToFolder(moveLibraryItem.id, folder);
                    }
                    setMoveLibraryItem(null);
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left text-sm font-semibold text-white transition hover:bg-white/[0.08]"
                >
                  <span>{folderLabelFromPath(folder)}</span>
                  <span className="text-xs text-zinc-400">{folder}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {groupSetPickerGroupId ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-24">
          <div className="w-full max-w-[620px] rounded-[1.6rem] border border-white/10 bg-[#1a1645] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[1.7rem] font-bold tracking-[-0.04em] text-white">Add a set</div>
                <div className="mt-2 text-sm leading-6 text-zinc-400">
                  Choose exactly which flashcard set should be linked to this study group.
                </div>
              </div>
              <button
                onClick={() => setGroupSetPickerGroupId("")}
                className="rounded-full p-2 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 space-y-3">
              {library.sets.length ? (
                library.sets.map((set) => {
                  const alreadyLinked = library.groups.find((group) => group.id === groupSetPickerGroupId)?.setIds.includes(set.id);
                  return (
                    <button
                      key={set.id}
                      type="button"
                      disabled={alreadyLinked}
                      onClick={async () => {
                        const added = await addSetToGroup(groupSetPickerGroupId, set.id);
                        if (added) {
                          setGroupSetPickerGroupId("");
                        }
                      }}
                      className={`flex w-full items-start justify-between rounded-xl border px-4 py-4 text-left transition ${
                        alreadyLinked
                          ? "cursor-not-allowed border-white/8 bg-white/[0.03] text-zinc-500"
                          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                      }`}
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">{set.title}</div>
                        <div className="mt-1 text-xs text-zinc-400">
                          {[set.course || set.subject, `${set.cards.length} cards`].filter(Boolean).join(" • ")}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-zinc-300">
                        {alreadyLinked ? "Added" : "Add"}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.03] px-5 py-6 text-sm text-zinc-400">
                  No flashcard sets yet. Create one first, then add it to this group.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {toast && (
        <div
          className={`study-toast fixed bottom-5 right-5 z-50 rounded-full px-4 py-2 text-sm font-medium shadow-[0_20px_45px_rgba(0,0,0,0.35)] ${
            toast.tone === "reward"
              ? "border border-emerald-400/25 bg-[linear-gradient(180deg,rgba(16,30,24,0.96),rgba(12,21,18,0.94))] text-emerald-100"
              : toast.tone === "error"
              ? "border border-red-400/25 bg-[linear-gradient(180deg,rgba(26,17,19,0.95),rgba(18,13,15,0.92))] text-red-100"
              : "border border-white/12 bg-[linear-gradient(180deg,rgba(23,26,34,0.95),rgba(17,20,28,0.92))] text-zinc-100"
          }`}
        >
          {toast.message}
        </div>
      )}
    </main>
  );
}

function DashboardView({
  library,
  selectedSet,
  selectedProgress,
  dashboard,
  onOpenSet,
  onCreateSet,
}: {
  library: StudyLibraryState;
  selectedSet?: StudySet;
  selectedProgress: Record<string, CardProgress>;
  dashboard: ReturnType<typeof computeStudyDashboard>;
  onOpenSet: () => void;
  onCreateSet: () => void;
}) {
  const recommendedCards = selectedSet ? getRecommendedCards(selectedSet, selectedProgress).slice(0, 4) : [];
  const recentSessions = library.sessions.slice(0, 5);

  if (!selectedSet) {
    return (
      <div>
        <div className="study-premium-panel study-appear overflow-hidden rounded-[1.6rem] p-0 backdrop-blur-xl">
          <div className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-6 py-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Empty library</div>
            <h2 className="mt-3 text-[2rem] font-bold tracking-[-0.04em] text-white">Start your first study set.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
              Create one from scratch or paste notes and let AI help.
            </p>
          </div>

          <div className="grid gap-4 px-6 py-6 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300">
                Flashcards
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300">
                Learn mode
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300">
                Tests
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300">
                Test practice
              </span>
            </div>

            <button
              onClick={onCreateSet}
              {...magneticHoverProps}
              className="study-premium-button inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Create set
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="study-premium-panel study-appear rounded-[1.5rem] p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Recommended next</div>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em] text-white md:text-[2rem]">{selectedSet.title}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                Your next best deck.
              </p>
            </div>
            <button
              onClick={onOpenSet}
              {...magneticHoverProps}
              className="study-premium-button inline-flex items-center gap-2 rounded-2xl bg-white/8 px-4 py-3 text-sm font-semibold text-white"
            >
              Open set
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {recommendedCards.map((card) => {
              const progress = selectedProgress[card.id] ?? getDefaultProgress(card.id);
              return (
                <div key={card.id} className="study-premium-card rounded-[1.25rem] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">{card.tags[0] || selectedSet.subject}</div>
                  <div className="mt-2 text-base font-semibold text-white">{card.front}</div>
                  <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
                    <span>Mastery {progress.masteryScore}%</span>
                    <span>{progress.markedDifficult ? "Needs attention" : "Review due"}</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/6">
                    <div className="h-2 rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400" style={{ width: `${Math.max(8, progress.masteryScore)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="study-premium-panel study-appear rounded-[1.5rem] p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Weakest subjects</div>
            <button
              onClick={onCreateSet}
              {...magneticHoverProps}
              className="study-premium-button rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-zinc-200"
            >
              New set
            </button>
          </div>
          <div className="mt-4 space-y-4">
            {dashboard.weakestTopics.length ? dashboard.weakestTopics.map((topic) => (
              <div key={topic.topic}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-zinc-200">{topic.topic}</span>
                  <span className="text-zinc-500">{Math.round(topic.ratio * 100)}% miss rate</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/6">
                  <div className="h-2 rounded-full bg-red-500" style={{ width: `${Math.max(8, Math.round(topic.ratio * 100))}%` }} />
                </div>
              </div>
            )) : <p className="text-sm text-zinc-400">Start studying and we’ll map weak topics here.</p>}
          </div>
        </div>

        <div className="study-premium-panel study-appear rounded-[1.5rem] p-5 backdrop-blur-xl">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Recent study sessions</div>
          <div className="mt-4 overflow-hidden rounded-[1.1rem] border border-white/8">
            {recentSessions.length ? recentSessions.map((session) => (
              <div key={session.id} className="grid grid-cols-[1.1fr_0.7fr_0.5fr_0.6fr] gap-3 border-b border-white/8 bg-white/[0.02] px-4 py-3 text-sm last:border-b-0">
                <div className="font-medium text-white">{library.sets.find((set) => set.id === session.setId)?.title || "Study set"}</div>
                <div className="capitalize text-zinc-400">{session.mode}</div>
                <div className="text-zinc-400">{session.cardsReviewed} cards</div>
                <div className="text-right text-zinc-300">{session.accuracy}%</div>
              </div>
            )) : (
              <div className="px-4 py-5 text-sm text-zinc-400">No sessions yet. Flashcards, Learn, Test, and Match runs will show here.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupsView({
  groups,
  sets,
  selectedSet,
  selectedGroup,
  selectedGroupId,
  groupTab,
  createGroupOpen,
  groupName,
  groupCourse,
  groupDescription,
  inviteCodeInput,
  onSelectGroup,
  onGroupTabChange,
  onCreateGroupOpenChange,
  onGroupNameChange,
  onGroupCourseChange,
  onGroupDescriptionChange,
  onInviteCodeInputChange,
  onCreateGroup,
  onJoinGroup,
  onDeleteGroup,
  onAddSetToGroup,
  onOpenAddSetPicker,
}: {
  groups: StudyGroup[];
  sets: StudySet[];
  selectedSet?: StudySet;
  selectedGroup?: StudyGroup;
  selectedGroupId: string;
  groupTab: "materials" | "members";
  createGroupOpen: boolean;
  groupName: string;
  groupCourse: string;
  groupDescription: string;
  inviteCodeInput: string;
  onSelectGroup: (groupId: string) => void;
  onGroupTabChange: (tab: "materials" | "members") => void;
  onCreateGroupOpenChange: (open: boolean) => void;
  onGroupNameChange: (value: string) => void;
  onGroupCourseChange: (value: string) => void;
  onGroupDescriptionChange: (value: string) => void;
  onInviteCodeInputChange: (value: string) => void;
  onCreateGroup: () => void;
  onJoinGroup: () => void;
  onDeleteGroup: (groupId: string) => void;
  onAddSetToGroup: (groupId: string, setId: string) => void;
  onOpenAddSetPicker: (groupId: string) => void;
}) {
  const groupSets = selectedGroup ? selectedGroup.setIds.map((setId) => sets.find((set) => set.id === setId)).filter(Boolean) as StudySet[] : [];
  const copyInviteLink = async () => {
    if (!selectedGroup) return;
    await navigator.clipboard.writeText(`Study group invite: ${selectedGroup.inviteCode}`);
  };

  return (
    <>
      {groups.length === 0 ? (
        <div className="relative min-h-[72vh]">
          <div className="flex min-h-[62vh] flex-col items-center justify-center text-center">
            <div className="relative mb-8">
              <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[1.6rem] bg-white text-[#1b1448] shadow-[0_18px_40px_rgba(0,0,0,0.24)]">
                <Users className="h-12 w-12" />
              </div>
              <div className="absolute -bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
                {["A", "B", "C", "D"].map((item, index) => (
                  <div key={item} className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ${index === 0 ? "bg-[#f59e0b]" : index === 1 ? "bg-[#ec4899]" : index === 2 ? "bg-[#60a5fa]" : "bg-[#6366f1]"}`}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <h2 className="max-w-[460px] text-[2rem] font-bold leading-tight tracking-[-0.04em] text-white">
              Get your study group going and study flashcards together
            </h2>
            <button
              onClick={() => onCreateGroupOpenChange(true)}
              className="mt-8 rounded-full bg-[#4f46e5] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#5d56f0]"
            >
              Create a group
            </button>
            <button className="mt-6 text-sm font-medium text-zinc-400 transition hover:text-white">
              Learn more about study groups
            </button>
          </div>
        </div>
      ) : selectedGroup ? (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[2.1rem] font-bold tracking-[-0.05em] text-white">{selectedGroup.name}</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onOpenAddSetPicker(selectedGroup.id)}
                className="rounded-full bg-white/[0.08] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.14]"
              >
                Add a set
              </button>
              <button
                onClick={() => onDeleteGroup(selectedGroup.id)}
                className="rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/20"
              >
                Delete
              </button>
            </div>
          </div>

          <div className="flex items-center gap-6 border-b border-white/10 pb-3 text-sm">
            <button
              onClick={() => onGroupTabChange("materials")}
              className={`pb-3 font-semibold ${groupTab === "materials" ? "border-b-2 border-[#7b61ff] text-white" : "text-zinc-400"}`}
            >
              Materials
            </button>
            <button
              onClick={() => onGroupTabChange("members")}
              className={`pb-3 font-semibold ${groupTab === "members" ? "border-b-2 border-[#7b61ff] text-white" : "text-zinc-400"}`}
            >
              Members
            </button>
          </div>

          {groupTab === "materials" ? (
            <div className="rounded-[1.6rem] border border-white/10 bg-[#4b537a] p-8">
              {groupSets.length ? (
                <div className="space-y-4">
                  {groupSets.map((set) => (
                    <button key={set.id} className="block w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 text-left transition hover:bg-white/[0.1]">
                      <div className="text-[11px] text-zinc-300">{set.cards.length} cards</div>
                      <div className="mt-1 text-lg font-semibold text-white">{set.title}</div>
                      <div className="mt-1 text-sm text-zinc-300">{set.course || set.subject}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
                  <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[1.5rem] bg-white/[0.12] text-white">
                    <BookOpen className="h-10 w-10" />
                  </div>
                  <div className="text-[2rem] font-semibold tracking-[-0.04em] text-white">Add sets to your group</div>
                  <button
                    onClick={() => onOpenAddSetPicker(selectedGroup.id)}
                    className="mt-6 rounded-full bg-white/[0.14] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.2]"
                  >
                    Add sets
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white">{selectedGroup.memberNames.length} member{selectedGroup.memberNames.length === 1 ? "" : "s"}</div>
                  <div className="mt-2 text-sm text-zinc-400">Invite members by sharing the link ({selectedGroup.inviteCode})</div>
                </div>
                <button
                  onClick={copyInviteLink}
                  className="rounded-full bg-[#4f46e5] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5d56f0]"
                >
                  Copy link
                </button>
              </div>
              <div className="space-y-4">
                {selectedGroup.memberNames.map((member) => (
                  <div key={member} className="flex items-center gap-4 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#5b39c6] text-sm font-semibold text-white">
                      {member.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-sm font-medium text-white">
                      {member === "You" ? "You" : member}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => onSelectGroup(group.id)}
                className={`rounded-xl border px-4 py-3 text-left transition ${
                  selectedGroupId === group.id
                    ? "border-white/18 bg-white/[0.08]"
                    : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"
                }`}
              >
                <div className="text-sm font-semibold text-white">{group.name}</div>
                <div className="mt-1 text-xs text-zinc-400">{group.memberNames.length} members</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {createGroupOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-24">
          <div className="w-full max-w-[560px] rounded-[1.6rem] border border-white/10 bg-[#1a1645] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[2rem] font-bold tracking-[-0.04em] text-white">Create a study group</div>
                <div className="mt-2 text-sm leading-6 text-zinc-400">
                  Study your flashcards together as a group and track each other&apos;s progress
                </div>
              </div>
              <button
                onClick={() => onCreateGroupOpenChange(false)}
                className="rounded-full p-2 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <input
                value={groupName}
                onChange={(event) => onGroupNameChange(event.target.value)}
                placeholder="e.g. League of Learners"
                className="study-premium-input w-full rounded-xl border border-white/12 bg-transparent px-4 py-4 text-base text-white outline-none placeholder:text-zinc-500"
              />
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={groupCourse}
                  onChange={(event) => onGroupCourseChange(event.target.value)}
                  placeholder="Course or topic"
                  className="study-premium-input rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
                />
                <input
                  value={groupDescription}
                  onChange={(event) => onGroupDescriptionChange(event.target.value)}
                  placeholder="Short description"
                  className="study-premium-input rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={onCreateGroup}
                  disabled={!groupName.trim()}
                  className="rounded-full bg-[#4f46e5] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#5d56f0] disabled:opacity-50"
                >
                  Create group
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CreateView({
  draftSet,
  importText,
  isGenerating,
  draftSetErrors,
  draggingCardId,
  isEditing,
  onDraftSetChange,
  onImportTextChange,
  onGenerateWithAi,
  onImportPdfFile,
  onImportFromText,
  onRequestSave,
  onDeleteSet,
  onDragStart,
  onDragEnd,
  onReorder,
}: {
  draftSet: StudySet;
  importText: string;
  isGenerating: boolean;
  draftSetErrors: DraftSetErrors;
  draggingCardId: string | null;
  isEditing: boolean;
  onDraftSetChange: React.Dispatch<React.SetStateAction<StudySet>>;
  onImportTextChange: (value: string) => void;
  onGenerateWithAi: () => void;
  onImportPdfFile: (file: File) => Promise<void>;
  onImportFromText: () => void;
  onRequestSave: (afterSave: "overview" | "learn") => void;
  onDeleteSet: () => void;
  onDragStart: (cardId: string | null) => void;
  onDragEnd: () => void;
  onReorder: (draggedId: string, targetId: string) => void;
}) {
  const [cardSearchOpen, setCardSearchOpen] = useState(false);
  const [cardSearchQuery, setCardSearchQuery] = useState("");

  const visibleCards = useMemo(() => {
    const query = cardSearchQuery.trim().toLowerCase();
    if (!query) return draftSet.cards;
    return draftSet.cards.filter((card) =>
      [card.front, card.back].join(" ").toLowerCase().includes(query),
    );
  }, [cardSearchQuery, draftSet.cards]);

  const swapAllTermsAndDefinitions = () => {
    onDraftSetChange((current) => ({
      ...current,
      cards: current.cards.map((card, index) => ({
        ...card,
        front: card.back,
        back: card.front,
        orderIndex: index,
      })),
    }));
  };

  const toggleVisibility = () => {
    onDraftSetChange((current) => ({
      ...current,
      visibility: current.visibility === "public" ? "private" : "public",
    }));
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5 xl:order-1">
        <div className="study-appear rounded-[1.5rem]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={toggleVisibility}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
            >
              <Globe className="h-3.5 w-3.5" />
              {draftSet.visibility === "public" ? "Public" : "Private"}
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onRequestSave("overview")}
                {...magneticHoverProps}
                className="study-premium-button rounded-full bg-white/[0.16] px-5 py-2.5 text-sm font-semibold text-white"
              >
                Create
              </button>
              <button
                onClick={() => onRequestSave("learn")}
                {...magneticHoverProps}
                className="study-premium-button rounded-full bg-[#5561ff] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(85,97,255,0.24)]"
              >
                Create and practice
              </button>
            </div>
          </div>

          <div className="grid gap-4">
            <label className="grid gap-2">
              <input
                value={draftSet.title}
                onChange={(event) =>
                  onDraftSetChange((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Title"
                className={`study-premium-input h-11 rounded-xl border bg-[#444d74] px-4 text-base font-semibold text-white outline-none placeholder:text-zinc-300 ${
                  draftSetErrors.title ? "border-red-400/40" : "border-white/10"
                }`}
              />
              {draftSetErrors.title ? <span className="text-xs text-red-300">{draftSetErrors.title}</span> : null}
            </label>
            <label className="grid gap-2">
              <textarea
                value={draftSet.description}
                onChange={(event) => onDraftSetChange((current) => ({ ...current, description: event.target.value }))}
                placeholder="Add a description..."
                rows={2}
                className="study-premium-input rounded-xl border border-white/10 bg-[#444d74] px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-300"
              />
            </label>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={onImportFromText} {...magneticHoverProps} className="study-premium-button rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-zinc-100">
              + Import
            </button>
            <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCardSearchOpen((current) => !current)}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition ${
                cardSearchOpen ? "bg-[#5561ff] text-white" : "bg-white/[0.06]"
              }`}
              aria-label="Search terms and definitions"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={swapAllTermsAndDefinitions}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/[0.1] hover:text-white"
              aria-label="Swap all terms and definitions"
            >
              <Shuffle className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onDeleteSet}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-red-500/15 hover:text-red-100"
              aria-label={isEditing ? "Delete set" : "Delete draft"}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            </div>
          </div>
          {cardSearchOpen ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={cardSearchQuery}
                  onChange={(event) => setCardSearchQuery(event.target.value)}
                  placeholder="Search a term or definition"
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#1a163c] pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-500"
                />
              </div>
              <div className="mt-2 text-xs text-zinc-400">
                {visibleCards.length} of {draftSet.cards.length} cards shown
              </div>
            </div>
          ) : null}
          {draftSetErrors.cards ? (
            <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">
              {draftSetErrors.cards}
            </div>
          ) : null}

          <div className="mt-6 space-y-4">
            {visibleCards.map((card, index) => (
              <div
                key={card.id}
                draggable
                onDragStart={() => onDragStart(card.id)}
                onDragEnd={onDragEnd}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => draggingCardId && onReorder(draggingCardId, card.id)}
                className="rounded-[1.2rem] border border-white/10 bg-[#444d74] p-4"
              >
                <div className="flex items-center justify-between gap-3 text-zinc-300">
                  <div className="text-sm font-semibold">{index + 1}</div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-300">
                      <GripVertical className="h-4 w-4" />
                    </button>
                  <button
                    onClick={() =>
                        onDraftSetChange((current) => ({
                          ...current,
                          cards: current.cards.flatMap((existing) =>
                            existing.id === card.id
                              ? [existing, { ...existing, id: createStudyId("card"), orderIndex: existing.orderIndex + 0.5 }]
                              : [existing],
                          ).sort((a, b) => a.orderIndex - b.orderIndex).map((existing, i) => ({ ...existing, orderIndex: i })),
                        }))
                      }
                      {...magneticHoverProps}
                      className="study-premium-button rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-300"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() =>
                        onDraftSetChange((current) => ({
                          ...current,
                          cards: current.cards.filter((existing) => existing.id !== card.id).map((existing, i) => ({ ...existing, orderIndex: i })),
                        }))
                      }
                      {...magneticHoverProps}
                      className="study-premium-button rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs text-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_96px]">
                  <div className="rounded-xl bg-[#1a163c] p-3">
                    <textarea
                      value={card.front}
                      onChange={(event) => updateDraftCard(onDraftSetChange, card.id, { front: event.target.value })}
                      placeholder="Enter term"
                      rows={3}
                      className="study-premium-input w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-zinc-400"
                    />
                    <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Term</div>
                  </div>
                  <div className="rounded-xl bg-[#1a163c] p-3">
                    <textarea
                      value={card.back}
                      onChange={(event) => updateDraftCard(onDraftSetChange, card.id, { back: event.target.value })}
                      placeholder="Enter definition"
                      rows={3}
                      className="study-premium-input w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-zinc-400"
                    />
                    <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Definition</div>
                  </div>
                  <button
                    type="button"
                    className="flex min-h-[120px] flex-col items-center justify-center rounded-xl border border-dashed border-white/25 bg-transparent text-zinc-300 transition hover:bg-white/[0.05]"
                  >
                    <ImageIcon className="h-5 w-5" />
                    <span className="mt-2 text-xs font-semibold">Image</span>
                  </button>
                </div>
              </div>
            ))}
            {!visibleCards.length ? (
              <div className="rounded-[1.2rem] border border-dashed border-white/12 bg-white/[0.03] px-5 py-8 text-sm text-zinc-400">
                No cards matched that search yet.
              </div>
            ) : null}
          </div>
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => onDraftSetChange((current) => ({ ...current, cards: [...current.cards, emptyDraftCard(current.cards.length)] }))}
              {...magneticHoverProps}
              className="study-premium-button rounded-full bg-white/[0.12] px-6 py-3 text-sm font-semibold text-white"
            >
              Add a card
            </button>
          </div>
          <div className="mt-8 flex justify-end gap-3">
            <button
              onClick={() => onRequestSave("overview")}
              {...magneticHoverProps}
              className="study-premium-button rounded-full bg-white/[0.12] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Create
            </button>
            <button
              onClick={() => onRequestSave("learn")}
              {...magneticHoverProps}
              className="study-premium-button rounded-full bg-[#5561ff] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Create and practice
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-5 xl:order-2 xl:sticky xl:top-6 xl:self-start">
        <div className="study-appear rounded-[1.5rem] border border-white/10 bg-[#444d74] p-5">
          <div className="flex items-center justify-between gap-4 pb-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#96c9ff]">
                <WandSparkles className="h-4 w-4" />
                Smart Assist
                <span className="rounded-full bg-[#63b0ff]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9cd0ff]">
                  Beta
                </span>
              </div>
            </div>
            <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/[0.08]">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4">
            <textarea
              value={importText}
              onChange={(event) => onImportTextChange(event.target.value)}
              rows={15}
              placeholder="Enter a prompt (e.g. “summarize photosynthesis”), paste notes or upload a document to create flashcards."
              className="w-full rounded-xl border border-white/10 bg-[#3b446a] px-4 py-4 text-sm leading-7 text-white outline-none placeholder:text-zinc-200"
            />
            <div className="mt-2 text-right text-xs text-zinc-300">
              {importText.length.toLocaleString()}/100,000 characters
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-white/[0.12] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.16]">
              <Plus className="h-4 w-4" />
              Upload
              <input
                type="file"
                accept=".pdf,.txt,text/plain,application/pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void onImportPdfFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button
              onClick={onGenerateWithAi}
              disabled={isGenerating}
              {...magneticHoverProps}
              className="study-premium-button flex-1 rounded-full bg-[#2f355a] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isGenerating ? "Generating..." : "Start"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveSetDialog({
  dialog,
  availableFolders,
  onDialogChange,
  onCancel,
  onConfirm,
}: {
  dialog: NonNullable<SaveDestinationDialogState>;
  availableFolders: string[];
  onDialogChange: React.Dispatch<React.SetStateAction<SaveDestinationDialogState>>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070b17]/72 px-4 backdrop-blur-sm">
      <div className="w-full max-w-[480px] rounded-[1.7rem] border border-white/10 bg-[#171b42] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.42)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[1.55rem] font-bold tracking-[-0.04em] text-white">Save flashcard set</div>
            <div className="mt-2 text-sm leading-6 text-zinc-300">
              Choose a folder, or leave it without one. You can also create a new folder right now.
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-zinc-200 transition hover:bg-white/[0.12]"
            aria-label="Close save dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Save in folder</span>
            <select
              value={dialog.folder}
              onChange={(event) =>
                onDialogChange((current) =>
                  current ? { ...current, folder: event.target.value } : current,
                )
              }
              className="h-11 rounded-xl border border-white/10 bg-[#222754] px-4 text-sm text-white outline-none"
            >
              <option value="">No folder</option>
              {availableFolders.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Or create a new folder</span>
            <input
              value={dialog.newFolderName}
              onChange={(event) =>
                onDialogChange((current) =>
                  current ? { ...current, newFolderName: event.target.value } : current,
                )
              }
              placeholder="New folder name"
              className="h-11 rounded-xl border border-white/10 bg-[#222754] px-4 text-sm text-white outline-none placeholder:text-zinc-500"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/10 bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.1]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-[#5561ff] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#6570ff]"
          >
            {dialog.afterSave === "learn" ? "Create and practice" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GuideCreateView({
  draftGuide,
  generatedGuide,
  availableFolders,
  courseSuggestions,
  importText,
  isGenerating,
  draftGuideErrors,
  onDraftGuideChange,
  onImportTextChange,
  onGenerate,
  onImportPdfFile,
  onSave,
}: {
  draftGuide: StudyNote;
  generatedGuide: StructuredLectureNotes | null;
  availableFolders: string[];
  courseSuggestions: StudyCourseSuggestion[];
  importText: string;
  isGenerating: boolean;
  draftGuideErrors: DraftGuideErrors;
  onDraftGuideChange: React.Dispatch<React.SetStateAction<StudyNote>>;
  onImportTextChange: (value: string) => void;
  onGenerate: () => void;
  onImportPdfFile: (file: File) => Promise<void>;
  onSave: () => void;
}) {
  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <div className="study-premium-panel study-appear rounded-[1.5rem] p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="text-sm font-semibold text-white">Paste text or upload a PDF</div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.08]">
              <FileText className="h-4 w-4" />
              Upload PDF
              <input
                type="file"
                accept=".pdf,.txt,text/plain,application/pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void onImportPdfFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          <div className="mt-4">
            <textarea
              value={importText}
              onChange={(event) => onImportTextChange(event.target.value)}
              rows={10}
              placeholder="Paste the text you want turned into a study guide."
              className={`w-full rounded-xl border px-4 py-4 text-sm leading-7 text-white outline-none placeholder:text-zinc-300 ${
                draftGuideErrors.content ? "border-red-400/40 bg-[#4c3554]" : "border-white/10 bg-[#49527a]"
              }`}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              {draftGuideErrors.content ? <span className="text-xs text-red-300">{draftGuideErrors.content}</span> : <span />}
              <div className="text-right text-xs text-zinc-500">
                {importText.length.toLocaleString()}/100,000 characters
              </div>
            </div>
          </div>

          <div className="mt-10 flex items-center justify-between gap-4">
            <div className="max-w-md text-xs leading-6 text-zinc-500">
              Study guides stay separate from flashcards here. This flow only creates a structured guide from your text.
            </div>
            <button
              onClick={onGenerate}
              disabled={isGenerating}
              {...magneticHoverProps}
              className="study-premium-button rounded-full bg-white/[0.1] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isGenerating ? "Generating..." : "Generate guide"}
            </button>
          </div>
        </div>

        <div className="study-premium-panel study-appear rounded-[1.5rem] p-5 backdrop-blur-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Guide details</div>
              <h2 className="mt-2 max-w-lg text-[1.45rem] font-semibold tracking-[-0.03em] text-white">Review and save</h2>
            </div>
            <button onClick={onSave} {...magneticHoverProps} className="study-premium-button self-start rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white">
              Save guide
            </button>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Guide title <span className="text-red-400">*</span></span>
              <input
                value={draftGuide.title}
                onChange={(event) => onDraftGuideChange((current) => ({ ...current, title: event.target.value }))}
                placeholder="Study guide title"
                className={`study-premium-input rounded-2xl border bg-white/[0.05] px-4 py-3 text-lg font-semibold text-white outline-none placeholder:text-zinc-500 ${
                  draftGuideErrors.title ? "border-red-400/40" : "border-white/10"
                }`}
              />
              {draftGuideErrors.title ? <span className="text-xs text-red-300">{draftGuideErrors.title}</span> : null}
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Course <span className="text-red-400">*</span></span>
                <input
                  list="study-guide-course-suggestions"
                  value={draftGuide.course}
                  onChange={(event) => onDraftGuideChange((current) => ({ ...current, course: event.target.value }))}
                  placeholder="Choose a course like CS 211"
                  className={`study-premium-input rounded-2xl border bg-white/[0.05] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 ${
                    draftGuideErrors.course ? "border-red-400/40" : "border-white/10"
                  }`}
                />
                <datalist id="study-guide-course-suggestions">
                  {courseSuggestions.map((course) => (
                    <option key={course.id} value={course.code}>
                      {course.title}
                    </option>
                  ))}
                </datalist>
                {draftGuideErrors.course ? <span className="text-xs text-red-300">{draftGuideErrors.course}</span> : null}
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Subject</span>
                <input
                  value={draftGuide.subject}
                  onChange={(event) => onDraftGuideChange((current) => ({ ...current, subject: event.target.value }))}
                  placeholder="Subject"
                  className="study-premium-input rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
                />
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Folder</span>
              <select
                value={draftGuide.folder || ""}
                onChange={(event) => onDraftGuideChange((current) => ({ ...current, folder: event.target.value }))}
                className="study-premium-input rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none"
              >
                <option value="">No folder</option>
                {availableFolders.map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
              </select>
              <span className="text-xs text-zinc-500">Choose where this guide should appear in your library.</span>
            </label>
          </div>

          {draftGuideErrors.guide ? (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">
              {draftGuideErrors.guide}
            </div>
          ) : null}

          <div className="mt-6">
            {generatedGuide ? (
              <div className="space-y-4">
                <div className="rounded-[1.2rem] border border-emerald-400/10 bg-emerald-500/[0.05] p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200/80">Summary</div>
                  <div className="mt-2 text-sm leading-7 text-zinc-200">{generatedGuide.summary}</div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {generatedGuide.sections.map((section) => (
                    <div key={section.heading} className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                      <div className="text-sm font-semibold text-white">{section.heading}</div>
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                        {section.items.length ? (
                          section.items.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-red-400" /><span>{item}</span></li>)
                        ) : (
                          <li className="text-zinc-500">Nothing extracted yet.</li>
                        )}
                      </ul>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                    <div className="text-sm font-semibold text-white">Key terms</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {generatedGuide.keyTerms.length ? generatedGuide.keyTerms.map((term) => (
                        <span key={term} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200">
                          {term}
                        </span>
                      )) : <span className="text-sm text-zinc-500">No key terms yet.</span>}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                    <div className="text-sm font-semibold text-white">Questions to review</div>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                      {generatedGuide.questionsToReview.length ? generatedGuide.questionsToReview.map((item) => (
                        <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-400" /><span>{item}</span></li>
                      )) : <li className="text-zinc-500">No review questions yet.</li>}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-sm leading-6 text-zinc-400">
                Generate a study guide to preview the structured summary here before saving.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-5 2xl:sticky 2xl:top-6 2xl:self-start">
        <div className="study-premium-panel study-appear rounded-[1.5rem] p-5 backdrop-blur-xl">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Publishing</div>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Visibility</span>
              <select
                value={draftGuide.visibility}
                onChange={(event) => onDraftGuideChange((current) => ({ ...current, visibility: event.target.value as StudyNote["visibility"] }))}
                className="study-premium-input rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none"
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </label>
            <div className="text-xs leading-6 text-zinc-500">
              {draftGuide.visibility === "public"
                ? "Public guides are searchable by course for other students."
                : "Private guides stay in your own library only."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewView({
  set,
  progressMap,
  availableFolders,
  onModeChange,
  onMoveToFolder,
  onDuplicate,
  onDelete,
  onEdit,
}: {
  set: StudySet;
  progressMap: Record<string, CardProgress>;
  availableFolders: string[];
  onModeChange: (screen: Screen) => void;
  onMoveToFolder: (folder: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const mastery = set.cards.length
    ? Math.round(set.cards.reduce((sum, card) => sum + (progressMap[card.id]?.masteryScore || 0), 0) / set.cards.length)
    : 0;
  const starred = set.cards.filter((card) => progressMap[card.id]?.starred).length;
  const difficult = set.cards.filter((card) => progressMap[card.id]?.markedDifficult).length;
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewFlipped, setPreviewFlipped] = useState(false);
  const [trackPreviewProgress, setTrackPreviewProgress] = useState(false);
  const previewCard = set.cards[previewIndex] ?? set.cards[0];
  const modeTiles = [
    { label: "Flashcards", icon: <Copy className="h-4 w-4" />, active: true, onClick: () => onModeChange("flashcards") },
    { label: "Learn", icon: <Brain className="h-4 w-4" />, active: false, onClick: () => onModeChange("learn") },
    { label: "Test", icon: <Target className="h-4 w-4" />, active: false, onClick: () => onModeChange("test") },
    { label: "Blocks", icon: <Grid2x2 className="h-4 w-4" />, active: false, onClick: () => onModeChange("flashcards") },
    { label: "Blast", icon: <Rocket className="h-4 w-4" />, active: false, onClick: () => onModeChange("learn") },
    { label: "Match", icon: <Shuffle className="h-4 w-4" />, active: false, onClick: () => onModeChange("match") },
  ];

  useEffect(() => {
    setPreviewIndex(0);
    setPreviewFlipped(false);
  }, [set.id]);

  if (!previewCard) {
    return <EmptyModeState title="No cards in this set yet." onBack={() => onModeChange("flashcards")} />;
  }

  return (
    <div className="mx-auto max-w-[860px] space-y-6">
      <div className="study-appear">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Folder className="h-3.5 w-3.5" />
                {set.folder ? folderLabelFromPath(set.folder) : set.course || set.subject || "Study set"}
              </div>
              <h1 className="mt-4 text-[2.2rem] font-bold tracking-[-0.04em] text-white">
                {set.title}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="inline-flex items-center gap-2 rounded-full border border-[#6a63f6] bg-[#2a255a] px-4 py-2 text-sm font-semibold text-white">
                <Bookmark className="h-4 w-4 fill-current" />
                Saved
              </button>
              <button className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-4 py-2 text-sm font-semibold text-zinc-200">
                <Users className="h-4 w-4" />
                Groups
              </button>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-zinc-200">
                <Share2 className="h-4 w-4" />
              </button>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-zinc-200">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modeTiles.map((tile) => (
              <button
                key={tile.label}
                onClick={tile.onClick}
                className={`flex items-center gap-3 rounded-xl px-5 py-4 text-left text-sm font-semibold transition ${
                  tile.active
                    ? "bg-[#3b4568] text-white"
                    : "bg-[#3b4568] text-zinc-100 hover:bg-[#455178]"
                }`}
              >
                <span className="text-[#70a7ff]">{tile.icon}</span>
                {tile.label}
              </button>
            ))}
          </div>

          <div className="rounded-[1.7rem] border border-white/10 bg-[#444d74] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.24)]">
            <div className="flex items-center justify-between text-sm text-zinc-200">
              <div className="inline-flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" />
                Get a hint
              </div>
              <div className="flex items-center gap-4 text-zinc-100">
                <button onClick={onEdit} className="transition hover:text-white">Edit</button>
                <button className="transition hover:text-white">Audio</button>
                <button className="transition hover:text-white">Star</button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPreviewFlipped((current) => !current)}
              className="mt-5 flex h-[290px] w-full items-center justify-center rounded-[1.5rem] text-center text-[2.05rem] font-medium tracking-[-0.03em] text-white"
            >
              {previewFlipped ? previewCard.back : previewCard.front}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={() => setTrackPreviewProgress((current) => !current)}
              className="inline-flex items-center gap-3 text-sm font-medium text-zinc-300"
            >
              Track progress
              <span className={`relative h-5 w-10 rounded-full ${trackPreviewProgress ? "bg-[#5561ff]" : "bg-white/15"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${trackPreviewProgress ? "left-5" : "left-0.5"}`} />
              </span>
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setPreviewIndex((current) => Math.max(0, current - 1));
                  setPreviewFlipped(false);
                }}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.08] text-zinc-100"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="min-w-[78px] text-center text-sm font-semibold text-white">
                {previewIndex + 1} / {set.cards.length}
              </div>
              <button
                onClick={() => {
                  setPreviewIndex((current) => Math.min(set.cards.length - 1, current + 1));
                  setPreviewFlipped(false);
                }}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.08] text-zinc-100"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => onModeChange("flashcards")} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-zinc-100">
                <Play className="h-4 w-4" />
              </button>
              <button onClick={() => onModeChange("match")} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-zinc-100">
                <Shuffle className="h-4 w-4" />
              </button>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-zinc-100">
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="border-t border-white/10 pt-5">
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard label="Cards" value={`${set.cards.length}`} icon={<BookOpen className="h-4 w-4" />} />
              <StatCard label="Mastery" value={`${mastery}%`} icon={<Trophy className="h-4 w-4" />} />
              <StatCard label="Starred" value={`${starred}`} icon={<Star className="h-4 w-4" />} />
              <StatCard label="Difficult" value={`${difficult}`} icon={<Flame className="h-4 w-4" />} />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <select
              value={set.folder || ""}
              onChange={(event) => onMoveToFolder(event.target.value)}
              className="study-premium-input rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-zinc-100 outline-none"
            >
              <option value="">No folder</option>
              {availableFolders.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
            <button onClick={onDuplicate} className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-zinc-100">
              Copy set
            </button>
            <button onClick={onDelete} className="rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100">
              Delete set
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlashcardsMode({
  set,
  progressMap,
  onBack,
  onModeChange,
  onProgress,
  onToggleFlag,
  onSessionSave,
  onCelebrate,
}: {
  set: StudySet;
  progressMap: Record<string, CardProgress>;
  onBack: () => void;
  onModeChange: (screen: Screen) => void;
  onProgress: (cardId: string, result: "knew" | "missed") => void;
  onToggleFlag: (cardId: string, patch: Partial<CardProgress>) => void;
  onSessionSave: (session: ReturnType<typeof buildStudySession>) => void;
  onCelebrate: (message: string) => void;
}) {
  const [filter, setFilter] = useState<StudyFilter>("all");
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [cardMotion, setCardMotion] = useState<"idle" | "next" | "prev">("idle");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [trackProgress, setTrackProgress] = useState(false);
  const [recentFeedback, setRecentFeedback] = useState<"knew" | "missed" | null>(null);
  const [optimisticProgress, setOptimisticProgress] = useState<Record<string, CardProgress>>({});
  const [shuffledCardIds, setShuffledCardIds] = useState<string[] | null>(null);
  const [startedAt] = useState(() => new Date().toISOString());
  const panelRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const motionTimeoutRef = useRef<number | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);

  const effectiveProgressMap = useMemo(
    () => ({ ...progressMap, ...optimisticProgress }),
    [optimisticProgress, progressMap],
  );

  const cards = useMemo(() => {
    const filtered = filterCards(set, effectiveProgressMap, filter);
    if (!shuffledCardIds?.length) return filtered;
    const order = new Map(shuffledCardIds.map((id, currentIndex) => [id, currentIndex]));
    return [...filtered].sort((left, right) => {
      const leftIndex = order.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = order.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
  }, [effectiveProgressMap, filter, set, shuffledCardIds]);
  const card = cards[index] ?? cards[0];

  useEffect(() => {
    setShuffledCardIds(null);
    setIndex(0);
  }, [filter, set.id]);

  const triggerCardMotion = (direction: "next" | "prev") => {
    if (motionTimeoutRef.current) {
      window.clearTimeout(motionTimeoutRef.current);
    }
    setCardMotion(direction);
    motionTimeoutRef.current = window.setTimeout(() => {
      setCardMotion("idle");
      motionTimeoutRef.current = null;
    }, 280);
  };

  const moveCard = (direction: "next" | "prev") => {
    const nextIndex =
      direction === "next"
        ? Math.min(cards.length - 1, index + 1)
        : Math.max(0, index - 1);

    if (nextIndex === index) return nextIndex;
    setIndex(nextIndex);
    setFlipped(false);
    triggerCardMotion(direction);
    return nextIndex;
  };

  useEffect(() => {
    if (!autoplay || !card) return;
    const interval = window.setInterval(() => {
      setFlipped((current) => !current);
      setTimeout(() => {
        setIndex((current) => {
          const nextIndex = (current + 1) % cards.length;
          return nextIndex;
        });
        setFlipped(false);
        triggerCardMotion("next");
      }, 700);
    }, 3600);
    return () => window.clearInterval(interval);
  }, [autoplay, card, cards.length]);

  useEffect(() => {
    return () => {
      if (motionTimeoutRef.current) {
        window.clearTimeout(motionTimeoutRef.current);
      }
      if (feedbackTimeoutRef.current) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === panelRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") moveCard("next");
      if (event.key === "ArrowLeft") moveCard("prev");
      if (event.key === " ") {
        event.preventDefault();
        setFlipped((current) => !current);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cards.length, index]);

  if (!card) {
    return <EmptyModeState title="No cards match that filter." onBack={onBack} />;
  }

  const currentProgress = effectiveProgressMap[card.id] ?? getDefaultProgress(card.id);
  const setMastery = set.cards.length
    ? Math.round(
        set.cards.reduce((sum, currentCard) => {
          const progress = effectiveProgressMap[currentCard.id] ?? getDefaultProgress(currentCard.id);
          return sum + progress.masteryScore;
        }, 0) / set.cards.length,
      )
    : 0;
  const streak = Math.min(4, cards.slice(0, index + 1).filter((item) => {
    const progress = effectiveProgressMap[item.id] ?? getDefaultProgress(item.id);
    return progress.timesCorrect > progress.timesWrong;
  }).length);

  const toggleFullscreen = async () => {
    if (!panelRef.current) return;
    if (document.fullscreenElement === panelRef.current) {
      await document.exitFullscreen?.();
      return;
    }
    await panelRef.current.requestFullscreen?.();
  };

  const goToNextCard = () => {
    const nextIndex = moveCard("next");
    if (nextIndex === cards.length - 1) {
      onSessionSave(buildStudySession(set.id, "flashcards", startedAt, index + 1, Math.round(((index + 1) / cards.length) * 100)));
      onCelebrate("Flashcard run finished. Solid work.");
    }
  };

  const registerFeedback = (result: "knew" | "missed") => {
    const nextProgress = updateProgressForReview(currentProgress, result);
    setOptimisticProgress((current) => ({
      ...current,
      [card.id]: nextProgress,
    }));
    onProgress(card.id, result);
    setRecentFeedback(result);
    if (feedbackTimeoutRef.current) {
      window.clearTimeout(feedbackTimeoutRef.current);
    }
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setRecentFeedback(null);
      feedbackTimeoutRef.current = null;
      if (trackProgress) {
        goToNextCard();
      }
    }, 220);

    if (result === "knew" && (currentProgress.timesCorrect + 1) % 3 === 0) {
      onCelebrate("Nice. That card is starting to stick.");
    }
  };

  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <div className="study-appear">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <button
                onClick={onBack}
                className="mb-3 inline-flex items-center gap-2 text-sm text-zinc-300 transition hover:text-white"
              >
                <Folder className="h-3.5 w-3.5" />
                Back to set
              </button>
              <h1 className="text-[2.2rem] font-bold tracking-[-0.04em] text-white">{set.title}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="inline-flex items-center gap-2 rounded-full border border-[#6a63f6] bg-[#2a255a] px-4 py-2 text-sm font-semibold text-white">
                <Bookmark className="h-4 w-4 fill-current" />
                Saved
              </button>
              <button className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-4 py-2 text-sm font-semibold text-zinc-200">
                <Users className="h-4 w-4" />
                Groups
              </button>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-zinc-200">
                <Share2 className="h-4 w-4" />
              </button>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-zinc-200">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { screen: "flashcards" as Screen, label: "Flashcards", icon: <Copy className="h-4 w-4" /> },
              { screen: "learn" as Screen, label: "Learn", icon: <Brain className="h-4 w-4" /> },
              { screen: "test" as Screen, label: "Test", icon: <Target className="h-4 w-4" /> },
              { screen: "flashcards" as Screen, label: "Blocks", icon: <Grid2x2 className="h-4 w-4" /> },
              { screen: "learn" as Screen, label: "Blast", icon: <Rocket className="h-4 w-4" /> },
              { screen: "match" as Screen, label: "Match", icon: <Shuffle className="h-4 w-4" /> },
            ].map((mode) => (
              <button
                key={mode.label}
                onClick={() => onModeChange(mode.screen)}
                className="flex items-center gap-3 rounded-xl bg-[#3b4568] px-5 py-4 text-left text-sm font-semibold text-white transition hover:bg-[#455178]"
              >
                <span className="text-[#70a7ff]">{mode.icon}</span>
                <span>{mode.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div ref={panelRef} className={`study-premium-panel study-appear rounded-[1.85rem] p-5 backdrop-blur-xl ${isFullscreen ? "study-flashcards-fullscreen h-full min-h-screen overflow-auto p-8" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-zinc-200">
            <Sparkles className="h-3.5 w-3.5" />
            {card.hint || "Get a hint"}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-zinc-100 transition hover:text-white">Edit</button>
            <button className="text-zinc-100 transition hover:text-white">Audio</button>
            <button
              onClick={() => onToggleFlag(card.id, { starred: !currentProgress.starred })}
              className="text-zinc-100 transition hover:text-white"
            >
              Star
            </button>
          </div>
        </div>

        <div ref={containerRef} className={`mt-6 ${isFullscreen ? "mx-auto w-full max-w-6xl" : ""}`}>
          <button
            type="button"
            onClick={() => setFlipped((current) => !current)}
            className={`group relative w-full cursor-pointer select-none overflow-hidden rounded-[2rem] [perspective:1800px] outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${isFullscreen ? "h-[68vh] max-h-[760px] min-h-[520px]" : "h-[420px]"}`}
            onTouchStart={(event) => {
              touchStartX.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              if (touchStartX.current == null) return;
              const diff = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
              if (Math.abs(diff) > 45) {
                if (diff < 0) {
                  moveCard("next");
                } else {
                  moveCard("prev");
                }
              }
              touchStartX.current = null;
            }}
          >
            <div
              key={`${card.id}-${index}`}
              className={`relative h-full w-full rounded-[2rem] ${
                cardMotion === "next"
                  ? isFullscreen
                    ? "study-card-enter-next-full"
                    : "study-card-enter-next"
                  : cardMotion === "prev"
                    ? isFullscreen
                      ? "study-card-enter-prev-full"
                      : "study-card-enter-prev"
                    : ""
              }`}
            >
              <div
                className={`relative h-full w-full transform-gpu rounded-[2rem] will-change-transform transition-transform ${isFullscreen ? "duration-[680ms] ease-[cubic-bezier(0.16,1,0.3,1)]" : "duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"}`}
                style={{
                  transformStyle: "preserve-3d",
                  WebkitTransformStyle: "preserve-3d",
                  transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
              >
                <div
                  className="absolute inset-0 flex h-full w-full transform-gpu items-center justify-center rounded-[2rem] border border-white/10 bg-[#444d74] p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.3)]"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(0deg)",
                  }}
                >
                  <div>
                    <div className="text-4xl font-medium tracking-[-0.03em] text-white">{card.front}</div>
                  </div>
                </div>
                <div
                  className="absolute inset-0 flex h-full w-full transform-gpu items-center justify-center rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,#1a2037_0%,#232d4b_100%)] p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.3)]"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                  }}
                >
                  <div className="max-w-3xl">
                    <div className="text-3xl font-medium tracking-[-0.03em] text-white">{card.back}</div>
                    {card.example ? <div className="mt-5 text-sm leading-7 text-zinc-300">Example: {card.example}</div> : null}
                    {card.mnemonic ? <div className="mt-3 text-sm leading-7 text-zinc-400">Memory trick: {card.mnemonic}</div> : null}
                  </div>
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-zinc-300">
            <button
              onClick={() => setTrackProgress((current) => !current)}
              className="inline-flex items-center gap-3"
            >
              Track progress
              <span className={`relative h-5 w-10 rounded-full ${trackProgress ? "bg-[#5561ff]" : "bg-white/15"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${trackProgress ? "left-5" : "left-0.5"}`} />
              </span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!trackProgress ? (
              <>
                <IconControlButton onClick={() => moveCard("prev")} icon={<ChevronLeft className="h-5 w-5" />} label="Previous card" />
                <div className="min-w-[88px] text-center text-base font-semibold tracking-[-0.03em] text-white">
                  {index + 1} / {cards.length}
                </div>
                <IconControlButton onClick={() => moveCard("next")} icon={<ChevronRight className="h-5 w-5" />} label="Next card" />
                <IconControlButton onClick={() => setAutoplay((current) => !current)} icon={autoplay ? <Pause className="h-4.5 w-4.5" /> : <Play className="h-4.5 w-4.5" />} label="Autoplay" active={autoplay} />
                <IconControlButton
                  onClick={() => {
                    const next = [...cards];
                    for (let currentIndex = next.length - 1; currentIndex > 0; currentIndex -= 1) {
                      const swapIndex = Math.floor(Math.random() * (currentIndex + 1));
                      [next[currentIndex], next[swapIndex]] = [next[swapIndex], next[currentIndex]];
                    }
                    setShuffledCardIds(next.map((currentCard) => currentCard.id));
                    setIndex(0);
                    setFlipped(false);
                  }}
                  icon={<Shuffle className="h-4.5 w-4.5" />}
                  label="Shuffle cards"
                  active={Boolean(shuffledCardIds?.length)}
                />
                <IconControlButton onClick={toggleFullscreen} icon={<Maximize2 className="h-4.5 w-4.5" />} label="Full screen" active={isFullscreen} />
              </>
            ) : (
              <>
                <ProgressChoiceButton
                  onClick={() => registerFeedback("missed")}
                  icon={<X className="h-7 w-7" />}
                  label="Mark difficult"
                  tone="danger"
                  active={recentFeedback === "missed"}
                />
                <div className="min-w-[88px] text-center text-2xl font-semibold tracking-[-0.04em] text-white">
                  {index + 1} / {cards.length}
                </div>
                <ProgressChoiceButton
                  onClick={() => registerFeedback("knew")}
                  icon={<Check className="h-7 w-7" />}
                  label="Mark known"
                  tone="success"
                  active={recentFeedback === "knew"}
                />
                <IconControlButton onClick={() => setFlipped((current) => !current)} icon={<RotateCcw className="h-4.5 w-4.5" />} label="Flip card" />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LearnMode({
  set,
  progressMap,
  onBack,
  onProgress,
  onSessionSave,
  onCelebrate,
}: {
  set: StudySet;
  progressMap: Record<string, CardProgress>;
  onBack: () => void;
  onProgress: (cardId: string, result: "knew" | "missed") => void;
  onSessionSave: (session: ReturnType<typeof buildStudySession>) => void;
  onCelebrate: (message: string) => void;
}) {
  const { data: session } = useSession();
  const questions = useMemo(() => {
    const bank = buildQuestionBank(set).filter((question) => question.type === "multiple_choice" && (question.choices?.length || 0) >= 4);
    return bank.length ? bank : buildQuestionBank(set).filter((question) => question.type === "true_false");
  }, [set]);
  const [index, setIndex] = useState(0);
  const [startedAt] = useState(() => new Date().toISOString());
  const [score, setScore] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const question = questions[index];

  const profileName = session?.user?.name?.trim() || "Profile";
  const profileInitials = profileName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "P";

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!submitted) return;
      if (event.key.length === 1 || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setShowExplanation(false);
        setSelectedChoice(null);
        setSubmitted(false);
        setIndex((current) => {
          if (current >= questions.length - 1) return current;
          return current + 1;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [questions.length, submitted]);

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

  if (!question) {
    return <EmptyModeState title="No cards available to learn right now." onBack={onBack} />;
  }

  const correctAnswer = Array.isArray(question.correctAnswer) ? question.correctAnswer[0] : String(question.correctAnswer);
  const choices =
    question.type === "true_false"
      ? ["True", "False"]
      : (question.choices ?? []);
  const selectedIsCorrect =
    submitted &&
    selectedChoice != null &&
    ((question.type === "true_false" ? selectedChoice.toLowerCase() : selectedChoice) === String(question.correctAnswer));
  const currentCard =
    set.cards.find((card) => stripQuestionPrompt(question.prompt).includes(card.front) || question.prompt.includes(card.front)) ??
    set.cards[index];

  const continueLearn = () => {
    if (index === questions.length - 1) {
      onSessionSave(
        buildStudySession(
          set.id,
          "learn",
          startedAt,
          questions.length,
          Math.round(((score + (selectedIsCorrect ? 1 : 0)) / Math.max(questions.length, 1)) * 100),
        ),
      );
      if (selectedIsCorrect) onCelebrate("Learn session complete. Nice finish.");
      setIndex(0);
      setScore(0);
      setSelectedChoice(null);
      setSubmitted(false);
      setShowExplanation(false);
      return;
    }
    setIndex((current) => current + 1);
    setSelectedChoice(null);
    setSubmitted(false);
    setShowExplanation(false);
  };

  const submitChoice = (choice: string) => {
    if (submitted) return;
    setSelectedChoice(choice);
    setSubmitted(true);

    const normalizedChoice = question.type === "true_false" ? choice.toLowerCase() : choice;
    const isCorrect = normalizedChoice === String(question.correctAnswer);
    if (currentCard) {
      onProgress(currentCard.id, isCorrect ? "knew" : "missed");
    }
    if (isCorrect) {
      setScore((current) => current + 1);
      onCelebrate("Nice. Keep going.");
    }
  };

  return (
    <div className="study-appear mx-auto max-w-[1240px] space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-zinc-200"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-sm font-semibold text-white">Learn</div>
        </div>
        <div className="flex items-center gap-3">
          <div ref={profileMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setProfileMenuOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] pl-2 pr-3 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.1]"
              aria-label="Open profile menu"
              aria-expanded={profileMenuOpen}
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#6e4cff] text-[11px] font-bold text-white">
                {profileInitials}
              </span>
              <span className="max-w-[110px] truncate">{profileName}</span>
              <ChevronDown className={`h-4 w-4 text-zinc-400 transition ${profileMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {profileMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.7rem)] z-50 w-[220px] rounded-[1.15rem] border border-white/10 bg-[#171b42] p-2 shadow-[0_24px_50px_rgba(0,0,0,0.36)]">
                <div className="rounded-[0.95rem] bg-white/[0.04] px-3 py-3">
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
          <button className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-[#c76a28] px-2 text-xs font-semibold text-white">
          {score}
        </div>
        {Array.from({ length: 6 }).map((_, segmentIndex) => {
          const progress = Math.min(1, Math.max(0, (((index + (submitted ? 1 : 0)) / Math.max(questions.length, 1)) * 6) - segmentIndex));
          return (
            <div key={segmentIndex} className="h-3 flex-1 overflow-hidden rounded-full bg-white/12">
              <div className="h-full rounded-full bg-[#7583b5] transition-all" style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }} />
            </div>
          );
        })}
        <div className="flex h-8 min-w-10 items-center justify-center rounded-full bg-white/10 px-2 text-xs font-semibold text-zinc-200">
          {questions.length}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[980px] rounded-[1.6rem] border border-[#515b84] bg-[#394264] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)] sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
            <span>Term</span>
            <Volume2 className="h-3.5 w-3.5" />
          </div>
          <div className="text-xs text-zinc-400">{index + 1} of {questions.length}</div>
        </div>

        <div className="mt-8 min-h-[110px] text-[2rem] leading-[1.2] font-medium tracking-[-0.03em] text-white">
          {stripQuestionPrompt(question.prompt)}
        </div>

        {submitted ? (
          <div className={`mt-8 text-sm font-semibold ${selectedIsCorrect ? "text-emerald-300" : "text-amber-300"}`}>
            {selectedIsCorrect ? "Nice, you got it!" : "No sweat, you&apos;re still learning!"}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {choices.map((choice, choiceIndex) => {
            const normalizedChoice = question.type === "true_false" ? choice.toLowerCase() : choice;
            const isSelected = selectedChoice === choice;
            const isCorrect = normalizedChoice === String(question.correctAnswer);
            const tone = submitted
              ? isCorrect
                ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-100"
                : isSelected
                  ? "border-amber-400/70 bg-amber-500/10 text-amber-100"
                  : "border-white/10 bg-[#3f496f] text-zinc-300"
              : "border-white/10 bg-[#3f496f] text-zinc-200 hover:bg-[#465178]";
            return (
              <button
                key={choice}
                onClick={() => submitChoice(choice)}
                className={`rounded-[0.95rem] border px-4 py-4 text-left text-sm font-medium transition ${tone}`}
              >
                <span className="mr-3 inline-flex min-w-5 text-zinc-400">{choiceIndex + 1}</span>
                {choice}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <button className="text-xs font-medium text-zinc-400">
            Don&apos;t know?
          </button>
          {submitted ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowExplanation((current) => !current)}
                className="rounded-full bg-white/[0.12] px-5 py-3 text-sm font-semibold text-zinc-100"
              >
                Explain this
              </button>
              <button
                onClick={continueLearn}
                className="rounded-full bg-[#5561ff] px-5 py-3 text-sm font-semibold text-white"
              >
                Continue
              </button>
            </div>
          ) : (
            <div className="text-xs font-medium text-zinc-400">Choose the correct answer</div>
          )}
        </div>

        {showExplanation ? (
          <div className="mt-4 rounded-[1rem] border border-white/10 bg-[#313858] px-4 py-3 text-sm leading-6 text-zinc-200">
            {question.explanation}
          </div>
        ) : null}
      </div>

      <div className="mx-auto flex w-full max-w-[980px] items-center justify-between px-2 text-sm text-zinc-300">
        <div>Click the correct answer or press any key to continue</div>
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-zinc-300">
          {Math.round((score / Math.max(index + Number(submitted), 1)) * 100) || 0}% correct
        </div>
      </div>
    </div>
  );
}

function AssessmentMode({
  title,
  set,
  progressMap,
  onBack,
  onProgress,
  onSessionSave,
  onResultSave,
  onCelebrate,
}: {
  title: string;
  set: StudySet;
  progressMap: Record<string, CardProgress>;
  onBack: () => void;
  onProgress: (cardId: string, result: "correct" | "wrong") => void;
  onSessionSave: (session: ReturnType<typeof buildStudySession>) => void;
  onResultSave: (result: QuizResult) => void;
  onCelebrate: (message: string) => void;
}) {
  const [startedAt] = useState(() => new Date().toISOString());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [explanation, setExplanation] = useState<string>("");
  const [perfectBurst, setPerfectBurst] = useState(false);
  const [setupOpen, setSetupOpen] = useState(true);
  const [questionCount, setQuestionCount] = useState(12);
  const [answerWith, setAnswerWith] = useState<"term" | "definition" | "both">("both");
  const [enabledTypes, setEnabledTypes] = useState({
    trueFalse: true,
    multipleChoice: true,
    matching: false,
    written: true,
  });

  const questions = useMemo(() => {
    const bank = buildQuestionBank(set);
    const allowedTypes = new Set<string>();
    if (enabledTypes.trueFalse) allowedTypes.add("true_false");
    if (enabledTypes.multipleChoice) allowedTypes.add("multiple_choice");
    if (enabledTypes.written) {
      allowedTypes.add("short_answer");
      allowedTypes.add("fill_blank");
      allowedTypes.add("written");
    }
    const filtered = bank.filter((question) => allowedTypes.has(question.type));
    const pool = filtered.length ? filtered : bank;
    return pool.slice(0, Math.min(questionCount, pool.length));
  }, [enabledTypes, questionCount, set]);

  const question = questions[currentIndex];
  if (!question) {
    return <EmptyModeState title="Not enough material to generate this assessment yet." onBack={onBack} />;
  }

  const toggleSetupType = (key: keyof typeof enabledTypes) => {
    setEnabledTypes((current) => {
      const next = { ...current, [key]: !current[key] };
      return Object.values(next).some(Boolean) ? next : current;
    });
  };

  const gradeQuestion = (quizQuestion: QuizQuestion) => {
    const answer = answers[quizQuestion.id] ?? "";
    if (quizQuestion.type === "true_false" || quizQuestion.type === "multiple_choice") {
      return String(quizQuestion.correctAnswer) === answer;
    }
    return fuzzyMatch(answer, quizQuestion.acceptedAnswers || quizQuestion.correctAnswer);
  };

  const finishAssessment = async () => {
    const scored = questions.map((quizQuestion) => {
      const correct = gradeQuestion(quizQuestion);
      const cardId = set.cards.find((card) => card.front === stripQuestionPrompt(quizQuestion.prompt))?.id;
      if (cardId) onProgress(cardId, correct ? "correct" : "wrong");
      return { quizQuestion, correct };
    });

    const percentCorrect = Math.round((scored.filter((item) => item.correct).length / scored.length) * 100);
    const result: QuizResult = {
      id: createStudyId("result"),
      setId: set.id,
      mode: "test",
      startedAt,
      endedAt: new Date().toISOString(),
      durationMs: new Date().getTime() - new Date(startedAt).getTime(),
      percentCorrect,
      topicAccuracy: Array.from(new Set(scored.map((item) => item.quizQuestion.topic))).map((topic) => {
        const topicItems = scored.filter((item) => item.quizQuestion.topic === topic);
        return {
          topic,
          accuracy: Math.round((topicItems.filter((item) => item.correct).length / topicItems.length) * 100),
        };
      }),
      answers: scored.map((item) => ({
        questionId: item.quizQuestion.id,
        answer: answers[item.quizQuestion.id] || "",
        correct: item.correct,
        score: item.correct ? 1 : 0,
      })),
    };

    setSubmitted(true);
    setPerfectBurst(percentCorrect === 100);
    onResultSave(result);
    onSessionSave(buildStudySession(set.id, "test", startedAt, questions.length, percentCorrect));
    if (percentCorrect >= 90) {
      onCelebrate("Excellent score. You really knew that set.");
    } else if (percentCorrect >= 75) {
      onCelebrate("Strong score. You’re moving in the right direction.");
    }

    const firstMiss = scored.find((item) => !item.correct);
    if (firstMiss) {
      try {
        const response = await fetch("/api/study/explain-answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: firstMiss.quizQuestion.prompt,
            correctAnswer: Array.isArray(firstMiss.quizQuestion.correctAnswer)
              ? firstMiss.quizQuestion.correctAnswer.join(", ")
              : String(firstMiss.quizQuestion.correctAnswer),
            userAnswer: answers[firstMiss.quizQuestion.id] || "",
            topic: firstMiss.quizQuestion.topic,
          }),
        });
        const payload = await response.json();
        if (response.ok) setExplanation(payload.explanation || "");
      } catch {
        setExplanation("");
      }
    }
  };

  if (submitted) {
    const correctCount = questions.filter((quizQuestion) => gradeQuestion(quizQuestion)).length;
    const percent = Math.round((correctCount / questions.length) * 100);
    const incorrectQuestions = questions.filter((quizQuestion) => !gradeQuestion(quizQuestion));
    return (
      <div className="space-y-5">
        <ModeHeader title={`${set.title} • ${title} results`} subtitle="Review misses and run it again." onBack={onBack} />
        <div className="study-premium-panel study-appear relative overflow-hidden rounded-[1.85rem] p-6 backdrop-blur-xl">
          {perfectBurst ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-40 overflow-hidden">
              {Array.from({ length: 18 }).map((_, index) => (
                <span
                  key={index}
                  className="study-confetti-piece absolute top-2 h-3 w-2 rounded-full"
                  style={{
                    left: `${8 + index * 5}%`,
                    background:
                      index % 4 === 0
                        ? "#34d399"
                        : index % 4 === 1
                        ? "#60a5fa"
                        : index % 4 === 2
                        ? "#fbbf24"
                        : "#f87171",
                    animationDelay: `${index * 45}ms`,
                  }}
                />
              ))}
            </div>
          ) : null}
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="study-premium-card rounded-[1.5rem] p-6">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Final score</div>
              <div className="mt-3 text-6xl font-black tracking-[-0.05em] text-white">{percent}%</div>
              <div className="mt-3 text-sm text-zinc-400">
                {correctCount} / {questions.length} correct
              </div>
              <div className="mt-4 rounded-2xl border border-emerald-400/16 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-100">
                {percent >= 90
                  ? "Outstanding. You’re probably ready for the real thing."
                  : percent >= 75
                  ? "Strong work. A short review pass should tighten the weak spots."
                  : "You’ve got a solid base. Use the misses below to sharpen the next run."}
              </div>
              {explanation ? (
                <div className="mt-6 rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-4 text-sm leading-7 text-indigo-100">
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-200">AI explanation</div>
                  {explanation}
                </div>
              ) : null}
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    setCurrentIndex(0);
                    setAnswers({});
                    setSubmitted(false);
                    setExplanation("");
                    setPerfectBurst(false);
                  }}
                  {...magneticHoverProps}
                  className="study-premium-button rounded-2xl bg-white/8 px-4 py-3 text-sm font-semibold text-white"
                >
                  Retry test
                </button>
                {incorrectQuestions.length ? (
                  <button
                    onClick={() => {
                      const mistakeSet: StudySet = {
                        ...set,
                        id: createStudyId("set"),
                        title: `${set.title} Mistakes Deck`,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        cards: incorrectQuestions.map((quizQuestion, index) => ({
                          ...emptyDraftCard(index),
                          front: quizQuestion.prompt,
                          back: Array.isArray(quizQuestion.correctAnswer)
                            ? quizQuestion.correctAnswer.join(", ")
                            : String(quizQuestion.correctAnswer),
                          hint: quizQuestion.explanation,
                          difficulty: quizQuestion.difficulty,
                          tags: [quizQuestion.topic, "mistakes"],
                        })),
                      };
                      const rawLibrary = window.localStorage.getItem(STORAGE_KEY);
                      const existingLibrary = rawLibrary
                        ? (JSON.parse(rawLibrary) as StudyLibraryState)
                        : DEFAULT_STUDY_LIBRARY;
                      window.localStorage.setItem(
                        STORAGE_KEY,
                        JSON.stringify({
                          ...DEFAULT_STUDY_LIBRARY,
                          ...existingLibrary,
                          sets: [mistakeSet, ...existingLibrary.sets],
                        }),
                      );
                      window.location.reload();
                    }}
                    {...magneticHoverProps}
                    className="study-premium-button rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100"
                  >
                    Create mistakes deck
                  </button>
                ) : null}
              </div>
            </div>
            <div className="study-premium-card rounded-[1.5rem] p-6">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Topic breakdown</div>
              <div className="mt-5 space-y-4">
                {Array.from(new Set(questions.map((quizQuestion) => quizQuestion.topic))).map((topic) => {
                  const items = questions.filter((quizQuestion) => quizQuestion.topic === topic);
                  const correct = items.filter((quizQuestion) => gradeQuestion(quizQuestion)).length;
                  const accuracy = Math.round((correct / items.length) * 100);
                  return (
                    <div key={topic}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-white">{topic}</span>
                        <span className="text-zinc-400">{accuracy}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-white/6">
                        <div className="h-2 rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400" style={{ width: `${accuracy}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
      <div className="study-appear space-y-5">
      <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4 text-zinc-200">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            {...magneticHoverProps}
            className="study-premium-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]"
            aria-label="Back to set"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-sm font-semibold text-white">{title}</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-semibold text-white">{Object.values(answers).filter(Boolean).length} / {questions.length}</div>
          <div className="text-xs text-zinc-500">{set.title}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSetupOpen(true)}
            {...magneticHoverProps}
            className="study-premium-button rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-100"
          >
            Options
          </button>
          <Link href="/study" {...magneticHoverProps} className="study-premium-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
            <Layers3 className="h-4.5 w-4.5" />
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1240px] space-y-6">
        <div className="mx-auto w-full max-w-[980px] rounded-[1.6rem] border border-[#515b84] bg-[#394264] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)] sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
              <span>{question.topic || "Term"}</span>
              <Volume2 className="h-3.5 w-3.5" />
            </div>
            <div className="text-xs text-zinc-400">{currentIndex + 1} of {questions.length}</div>
          </div>

          <div className="mt-8 min-h-[96px] text-[1.95rem] leading-[1.15] font-medium tracking-[-0.04em] text-white">
            {question.prompt}
          </div>

          <div className="mt-10 text-sm font-medium text-zinc-200">Choose an answer</div>

          <div className="mt-4">
            {(question.type === "multiple_choice" || question.type === "true_false") && (
              <div className="grid gap-3 md:grid-cols-2">
                {(question.choices || (question.type === "true_false" ? ["True", "False"] : [])).map((choice, choiceIndex) => (
                  <button
                    key={choice}
                    onClick={() =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: question.type === "true_false" ? choice.toLowerCase() : choice,
                      }))
                    }
                    {...magneticHoverProps}
                    className={`study-premium-button rounded-[0.95rem] border px-4 py-4 text-left text-sm transition ${
                      answers[question.id] === (question.type === "true_false" ? choice.toLowerCase() : choice)
                        ? "border-indigo-200 bg-[#8e98bb] text-white"
                        : "border-white/10 bg-[#394264] text-zinc-200 hover:bg-[#434d74]"
                    }`}
                  >
                    <span className="mr-3 inline-flex min-w-5 text-zinc-400">{question.type === "multiple_choice" ? choiceIndex + 1 : ""}</span>
                    {choice}
                  </button>
                ))}
              </div>
            )}

            {(question.type === "short_answer" || question.type === "fill_blank" || question.type === "written") && (
              <textarea
                value={answers[question.id] || ""}
                onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                rows={question.type === "written" ? 6 : 4}
                placeholder={question.type === "written" ? "Write your answer..." : "Type your answer..."}
                className="study-premium-input w-full rounded-[0.95rem] border border-white/10 bg-[#394264] px-4 py-3 text-base leading-7 text-white outline-none placeholder:text-zinc-500"
              />
            )}
          </div>

          <div className="mt-5 flex items-center justify-between gap-4 text-xs font-medium text-indigo-200">
            <span>
              {answers[question.id]
                ? "Answer saved"
                : question.type === "written" || question.type === "short_answer" || question.type === "fill_blank"
                ? "Write your best answer"
                : "Don’t know?"}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCurrentIndex((current) => Math.max(0, current - 1))}
                {...magneticHoverProps}
                className="study-premium-button rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-100"
              >
                Prev
              </button>
              {currentIndex < questions.length - 1 ? (
                <button
                  onClick={() => setCurrentIndex((current) => Math.min(questions.length - 1, current + 1))}
                  {...magneticHoverProps}
                  className="study-premium-button rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-100"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={finishAssessment}
                  {...magneticHoverProps}
                  className="study-premium-button rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-100"
                >
                  Finish
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {setupOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(5,7,18,0.66)] px-4 backdrop-blur-sm">
          <div className="w-full max-w-[460px] rounded-[1.55rem] border border-[#2f3761] bg-[#151137] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-zinc-300">{set.title}</div>
                <h3 className="mt-2 text-[2rem] font-bold leading-none tracking-[-0.04em] text-white">Set up your test</h3>
              </div>
              <button
                onClick={() => setSetupOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-300"
                aria-label="Close test setup"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-medium text-zinc-200">Questions</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, buildQuestionBank(set).length)}
                  value={questionCount}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    setQuestionCount(Math.max(1, Math.min(Math.max(1, buildQuestionBank(set).length), Number.isFinite(nextValue) ? nextValue : 12)));
                    setCurrentIndex(0);
                    setAnswers({});
                  }}
                  className="study-premium-input w-20 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none"
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-medium text-zinc-200">Answer with</label>
                <select
                  value={answerWith}
                  onChange={(event) => setAnswerWith(event.target.value as typeof answerWith)}
                  className="study-premium-input rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="both">Both</option>
                  <option value="term">Term</option>
                  <option value="definition">Definition</option>
                </select>
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="space-y-3">
                  {[
                    { key: "trueFalse", label: "True/False" },
                    { key: "multipleChoice", label: "Multiple choice" },
                    { key: "matching", label: "Matching" },
                    { key: "written", label: "Written" },
                  ].map((item) => {
                    const enabled = enabledTypes[item.key as keyof typeof enabledTypes];
                    return (
                      <div key={item.key} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-zinc-200">{item.label}</span>
                        <button
                          type="button"
                          onClick={() => toggleSetupType(item.key as keyof typeof enabledTypes)}
                          className={`relative h-7 w-11 rounded-full transition ${enabled ? "bg-indigo-500" : "bg-white/16"}`}
                          aria-pressed={enabled}
                        >
                          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${enabled ? "left-5" : "left-1"}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setSetupOpen(false)}
                  {...magneticHoverProps}
                  className="study-premium-button rounded-full bg-indigo-500 px-5 py-3 text-sm font-semibold text-white"
                >
                  Start test
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MatchMode({
  set,
  onBack,
  onSessionSave,
  onProgress,
  onCelebrate,
}: {
  set: StudySet;
  onBack: () => void;
  onSessionSave: (session: ReturnType<typeof buildStudySession>) => void;
  onProgress: (cardId: string, result: "correct" | "wrong") => void;
  onCelebrate: (message: string) => void;
}) {
  const sourceCards = useMemo(() => set.cards.slice(0, 6), [set.cards]);
  const pairMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of sourceCards) {
      map.set(`term-${card.id}`, `def-${card.id}`);
      map.set(`def-${card.id}`, `term-${card.id}`);
    }
    return map;
  }, [sourceCards]);
  const [items, setItems] = useState(() => shuffleForMatch(sourceCards));
  const [selected, setSelected] = useState<string[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [bestMs, setBestMs] = useState<number | null>(null);
  const [completedMs, setCompletedMs] = useState<number | null>(null);
  const isComplete = matched.length === items.length && items.length > 0;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MATCH_BESTS_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      setBestMs(typeof parsed[set.id] === "number" ? parsed[set.id] : null);
    } catch {
      setBestMs(null);
    }
  }, [set.id]);

  useEffect(() => {
    if (!startedAt || (matched.length === items.length && items.length)) return;
    const interval = window.setInterval(() => {
      setElapsedMs(new Date().getTime() - new Date(startedAt).getTime());
    }, 100);
    return () => window.clearInterval(interval);
  }, [items.length, matched.length, startedAt]);

  const handlePick = (id: string) => {
    if (isComplete) return;
    if (matched.includes(id) || selected.includes(id)) return;
    if (!startedAt) {
      setStartedAt(new Date().toISOString());
    }
    const next = [...selected, id];
    setSelected(next);
    if (next.length === 2) {
      const [first, second] = next;
      if (pairMap.get(first) === second) {
        setMatched((current) => [...current, first, second]);
        const cardId = first.replace("term-", "").replace("def-", "");
        onProgress(cardId, "correct");
        const nextSolved = matched.length + 2;
        if (nextSolved === items.length) {
          onCelebrate("Match cleared. Nice speed.");
        } else if (nextSolved >= 4 && nextSolved % 4 === 0) {
          onCelebrate("Nice match streak.");
        }
      } else {
        const cardId = first.replace("term-", "").replace("def-", "");
        onProgress(cardId, "wrong");
      }
      window.setTimeout(() => setSelected([]), 260);
    }
  };

  useEffect(() => {
    if (startedAt && isComplete) {
      const finalMs = new Date().getTime() - new Date(startedAt).getTime();
      setCompletedMs(finalMs);
      onSessionSave(buildStudySession(set.id, "match", startedAt, sourceCards.length, 100));
      if (bestMs == null || finalMs < bestMs) {
        setBestMs(finalMs);
        try {
          const raw = window.localStorage.getItem(MATCH_BESTS_KEY);
          const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
          window.localStorage.setItem(MATCH_BESTS_KEY, JSON.stringify({ ...parsed, [set.id]: finalMs }));
        } catch {
          // Ignore localStorage write issues and keep the in-memory best.
        }
        onCelebrate("New best time. Nice speed.");
      }
    }
  }, [bestMs, isComplete, onCelebrate, onSessionSave, set.id, sourceCards.length, startedAt]);

  const restartMatch = () => {
    setItems(shuffleForMatch(sourceCards));
    setSelected([]);
    setMatched([]);
    setStartedAt(null);
    setElapsedMs(0);
    setCompletedMs(null);
  };

  return (
    <div className="study-appear space-y-4">
      <div className="rounded-[1.65rem] border border-white/8 bg-[linear-gradient(180deg,rgba(11,14,32,0.96),rgba(10,13,27,0.94))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              {...magneticHoverProps}
              className="study-premium-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-100"
              aria-label="Back to set"
              title="Back to set"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="text-sm font-semibold text-white">Match</div>
              <div className="text-xs text-zinc-500">{set.title}</div>
            </div>
          </div>

          <div className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-lg font-semibold tracking-[-0.03em] text-white">
            {startedAt ? formatMatchTime(completedMs ?? elapsedMs) : "0:00.0"}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={restartMatch}
              {...magneticHoverProps}
              className="study-premium-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-200"
              aria-label="Restart match"
              title="Restart"
            >
              <RotateCcw className="h-4.5 w-4.5" />
            </button>
            <Link
              href="/study"
              {...magneticHoverProps}
              className="study-premium-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-200"
              aria-label="Study home"
              title="Study home"
            >
              <Layers3 className="h-4.5 w-4.5" />
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/8 pt-4 text-sm text-zinc-400">
          <span>{matched.length / 2} / {sourceCards.length} solved</span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-zinc-200">
            Best {bestMs != null ? formatMatchTime(bestMs) : "No score yet"}
          </span>
          {isComplete ? (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
              Completed
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-[1.85rem] border border-white/8 bg-[linear-gradient(180deg,rgba(10,13,27,0.96),rgba(9,12,24,0.94))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.22)] md:p-5">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => {
            const active = selected.includes(item.id);
            const solved = matched.includes(item.id);
            return (
              <button
                key={item.id}
                onClick={() => handlePick(item.id)}
                disabled={isComplete || solved}
                {...magneticHoverProps}
                className={`study-premium-button min-h-[176px] rounded-[1.15rem] border p-6 text-center text-[1.05rem] font-medium leading-8 transition disabled:cursor-default ${
                  solved
                    ? "border-emerald-400/35 bg-emerald-500/16 text-emerald-50"
                    : active
                    ? "border-indigo-200 bg-[#8f98bc] text-white shadow-[0_16px_36px_rgba(148,163,184,0.18)]"
                    : isComplete
                    ? "border-[#5b648c] bg-[#394264] text-zinc-100"
                    : "border-[#50597e] bg-[#394264] text-zinc-100 hover:bg-[#434d74]"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ModeHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className="study-premium-panel study-appear flex flex-col gap-4 rounded-[1.6rem] p-5 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
      <div>
        <button onClick={onBack} {...magneticHoverProps} className="study-premium-button mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-zinc-300 hover:text-white">
          <ChevronLeft className="h-4 w-4" />
          Back to set
        </button>
        <h2 className="text-3xl font-black tracking-[-0.05em] text-white">{title}</h2>
        {subtitle ? <p className="mt-2 text-sm leading-7 text-zinc-400">{subtitle}</p> : null}
      </div>
      <Link href="/study" {...magneticHoverProps} className="study-premium-button inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-zinc-100">
        <Layers3 className="h-4 w-4" />
        Study home
      </Link>
    </div>
  );
}

function NavButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      {...magneticHoverProps}
      className={`study-premium-button flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-[13px] font-medium transition ${
        active ? "border border-sky-300/20 bg-sky-100 text-slate-950 shadow-[0_12px_30px_rgba(125,211,252,0.14)]" : "border border-white/8 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function ModeCard({ icon, title, body, onClick }: { icon: React.ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      {...magneticHoverProps}
      className="study-premium-card study-premium-button rounded-[1.6rem] p-5 text-left transition hover:-translate-y-1 hover:border-sky-300/24 hover:bg-white/[0.05]"
    >
      <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-indigo-200">{icon}</div>
      <div className="mt-5 text-xl font-black tracking-[-0.03em] text-white">{title}</div>
      <div className="mt-3 text-sm leading-7 text-zinc-400">{body}</div>
    </button>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="study-premium-card rounded-[1.35rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">{label}</div>
          <div className="mt-2 text-[1.85rem] font-bold tracking-[-0.045em] text-white">{value}</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.05] p-2.5 text-zinc-300 shadow-[0_10px_24px_rgba(2,6,23,0.12)]">
          {icon}
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  onClick,
  children,
  icon,
  destructive,
}: {
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      {...magneticHoverProps}
      className={`study-premium-button inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
        destructive
          ? "border border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/20"
          : "border border-white/10 bg-white/[0.05] text-zinc-100 hover:bg-white/[0.08]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function IconControlButton({
  onClick,
  icon,
  label,
  active = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      {...magneticHoverProps}
      className={`study-premium-button inline-flex h-12 w-12 items-center justify-center rounded-full border text-zinc-100 transition ${
        active
          ? "border-sky-300/30 bg-sky-400/18 text-sky-100"
          : "border border-white/10 bg-white/[0.05] hover:bg-white/[0.08]"
      }`}
    >
      {icon}
    </button>
  );
}

function ProgressChoiceButton({
  onClick,
  icon,
  label,
  tone,
  active = false,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tone: "danger" | "success";
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      {...magneticHoverProps}
      className={`study-premium-button inline-flex h-16 w-32 items-center justify-center rounded-[1.75rem] border transition ${
        tone === "danger"
          ? active
            ? "border-red-300/45 bg-red-500/22 text-red-100 shadow-[0_18px_45px_rgba(239,68,68,0.18)]"
            : "border-white/10 bg-white/[0.05] text-red-400 hover:bg-red-500/12"
          : active
          ? "border-emerald-300/45 bg-emerald-500/22 text-emerald-100 shadow-[0_18px_45px_rgba(16,185,129,0.18)]"
          : "border-white/10 bg-white/[0.05] text-emerald-400 hover:bg-emerald-500/12"
      }`}
    >
      {icon}
    </button>
  );
}

function EmptyModeState({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="study-premium-panel study-appear rounded-[1.85rem] p-10 text-center backdrop-blur-xl">
      <div className="text-2xl font-bold text-white">{title}</div>
      <button onClick={onBack} {...magneticHoverProps} className="study-premium-button mt-5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-zinc-100">
        Back to overview
      </button>
    </div>
  );
}

function StudyWorkspaceSkeleton() {
  return (
    <main className="min-h-screen bg-[#140f36] pb-20 text-white">
      <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-6">
        <section className="study-premium-panel rounded-[1.75rem] p-5 backdrop-blur-xl md:p-6">
          <div className="study-skeleton h-6 w-40 rounded-full" />
          <div className="study-skeleton mt-5 h-16 max-w-3xl rounded-[1.5rem]" />
          <div className="study-skeleton mt-4 h-6 max-w-2xl rounded-full" />
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="study-premium-card rounded-[1.4rem] p-4">
                <div className="study-skeleton h-4 w-24 rounded-full" />
                <div className="study-skeleton mt-4 h-10 w-20 rounded-2xl" />
              </div>
            ))}
          </div>
        </section>
        <div className="mt-6 grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="study-premium-panel rounded-[1.6rem] p-4 backdrop-blur-xl">
              <div className="study-skeleton h-4 w-24 rounded-full" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="study-skeleton h-11 rounded-2xl" />
                ))}
              </div>
            </div>
            <div className="study-premium-panel rounded-[1.6rem] p-4 backdrop-blur-xl">
              <div className="study-skeleton h-4 w-20 rounded-full" />
              <div className="study-skeleton mt-4 h-11 rounded-2xl" />
              <div className="study-skeleton mt-3 h-11 rounded-2xl" />
              <div className="study-skeleton mt-3 h-11 rounded-2xl" />
            </div>
          </aside>
          <section className="space-y-6">
            <div className="study-premium-panel rounded-[1.75rem] p-6 backdrop-blur-xl">
              <div className="study-skeleton h-6 w-36 rounded-full" />
              <div className="study-skeleton mt-4 h-12 w-72 rounded-[1.2rem]" />
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="study-skeleton h-40 rounded-[1.5rem]" />
                <div className="study-skeleton h-40 rounded-[1.5rem]" />
              </div>
            </div>
            <div className="study-premium-panel rounded-[1.75rem] p-6 backdrop-blur-xl">
              <div className="study-skeleton h-6 w-44 rounded-full" />
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="study-skeleton h-28 rounded-[1.4rem]" />
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function filterCards(set: StudySet, progressMap: Record<string, CardProgress>, filter: StudyFilter) {
  return set.cards.filter((card) => {
    const progress = progressMap[card.id] ?? getDefaultProgress(card.id);
    if (filter === "starred") return progress.starred;
    if (filter === "difficult") return progress.markedDifficult;
    if (filter === "missed") return !!progress.missedRecently;
    if (filter === "unseen") return progress.timesSeen === 0;
    return true;
  });
}

function shuffleForMatch(cards: StudyCard[]) {
  const items = cards.flatMap((card) => [
    { id: `term-${card.id}`, label: card.front },
    { id: `def-${card.id}`, label: card.back },
  ]);

  return items.sort(() => Math.random() - 0.5);
}

function updateDraftCard(
  onDraftSetChange: React.Dispatch<React.SetStateAction<StudySet>>,
  cardId: string,
  patch: Partial<StudyCard>,
) {
  onDraftSetChange((current) => ({
    ...current,
    cards: current.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card)),
  }));
}

function stripQuestionPrompt(prompt: string) {
  return prompt.replace(/^What best matches:\s*/i, "").replace(/^Type the definition for:\s*/i, "").trim();
}

function formatSeconds(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatMatchTime(totalMs: number) {
  const totalSeconds = Math.floor(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((totalMs % 1000) / 100);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${tenths}`;
}

function groupSetsByPeriod(sets: StudySet[]) {
  const now = new Date();
  const today = now.toDateString();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const groups = new Map<string, StudySet[]>();

  for (const set of [...sets].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())) {
    const updatedAt = new Date(set.updatedAt);
    let label = `In ${updatedAt.toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase()}`;

    if (updatedAt.toDateString() === today) {
      label = "Today";
    } else if (updatedAt.getMonth() === currentMonth && updatedAt.getFullYear() === currentYear) {
      label = "This month";
    }

    const existing = groups.get(label) ?? [];
    existing.push(set);
    groups.set(label, existing);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function existsInLibrary(library: StudyLibraryState, setId: string) {
  return library.sets.some((set) => set.id === setId);
}
