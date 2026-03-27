"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import {
  BarChart3,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  Flame,
  FolderOpen,
  Layers3,
  Maximize2,
  Plus,
  Play,
  Pause,
  RotateCcw,
  Search,
  Shuffle,
  Sparkles,
  Star,
  Target,
  Trash2,
  Trophy,
  Users,
  UserPlus,
  Volume2,
  X,
} from "lucide-react";
import { buildQuestionBank, buildStudySession, computeStudyDashboard, createStudyId, fuzzyMatch, getDefaultProgress, getRecommendedCards, reorderCards, updateProgressForReview } from "@/lib/study/engine";
import { DEFAULT_STUDY_LIBRARY } from "@/lib/study/sample-data";
import type { CardProgress, QuizQuestion, QuizResult, StudyCard, StudyGroup, StudyLibraryState, StudySet, StudySurface } from "@/lib/study/types";
import NotesWorkspace from "@/app/study/NotesWorkspace";
import StudyIdentityCard, { type StudyProfileForm } from "@/app/components/study/StudyIdentityCard";

const STORAGE_KEY = "uic-atlas-study-library-v1";
const MATCH_BESTS_KEY = "uic-atlas-study-match-bests-v1";

type Screen = "dashboard" | "groups" | "create" | "overview" | "flashcards" | "learn" | "test" | "match";
type StudyFilter = "all" | "starred" | "difficult" | "missed" | "unseen";
type ToastTone = "default" | "error" | "reward";
type StudyToast = { message: string; tone: ToastTone } | null;
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
  course?: string;
  cards?: string;
};

type StudyWorkspaceProps = {
  forcedSetId?: string;
  standaloneSetView?: boolean;
};

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

export default function StudyWorkspace({ forcedSetId, standaloneSetView = false }: StudyWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const isCreateRoute = pathname === "/study/create";
  const [hydrated, setHydrated] = useState(false);
  const [library, setLibrary] = useState<StudyLibraryState>(DEFAULT_STUDY_LIBRARY);
  const [surface, setSurface] = useState<StudySurface>("home");
  const [screen, setScreen] = useState<Screen>(isCreateRoute ? "create" : "dashboard");
  const [selectedSetId, setSelectedSetId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [draftSet, setDraftSet] = useState<StudySet>(emptyDraftSet());
  const [groupName, setGroupName] = useState("");
  const [groupCourse, setGroupCourse] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [groupTab, setGroupTab] = useState<"materials" | "members">("materials");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [courseSuggestions, setCourseSuggestions] = useState<StudyCourseSuggestion[]>([]);
  const [publicSearchResults, setPublicSearchResults] = useState<StudySet[]>([]);
  const [draftSetErrors, setDraftSetErrors] = useState<DraftSetErrors>({});
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [toast, setToast] = useState<StudyToast>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [profile, setProfile] = useState<StudyProfileForm>({
    school: "UIC",
    major: "",
    currentCourses: "",
    interests: "",
    studyPreferences: "",
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [contextCollapsed, setContextCollapsed] = useState(false);
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
    } catch {
      setLibrary(DEFAULT_STUDY_LIBRARY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    setScreen(isCreateRoute ? "create" : "dashboard");
  }, [isCreateRoute]);

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

  const globalQuery = (searchParams.get("query") || "").trim();
  const folderFilter = (searchParams.get("folder") || "").trim();
  const libraryView = searchParams.get("view") === "library";

  useEffect(() => {
    setSearch(globalQuery);
  }, [globalQuery]);

  useEffect(() => {
    if (!isCreateRoute) return;
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
  }, [isCreateRoute, library.sets, searchParams]);

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

        setProfile({
          school: payload.profile?.school || "UIC",
          major: payload.profile?.major || "",
          currentCourses: Array.isArray(payload.profile?.currentCourses) ? payload.profile.currentCourses.join(", ") : "",
          interests: Array.isArray(payload.profile?.interests) ? payload.profile.interests.join(", ") : "",
          studyPreferences: payload.profile?.studyPreferences || "",
        });

        const hasSavedContext = Boolean(
          payload.profile?.major ||
          (Array.isArray(payload.profile?.currentCourses) && payload.profile.currentCourses.length) ||
          (Array.isArray(payload.profile?.interests) && payload.profile.interests.length) ||
          payload.profile?.studyPreferences,
        );
        if (hasSavedContext) {
          setContextCollapsed(true);
        }

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
    const query = draftSet.course.trim();
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
  }, [draftSet.course, isCreateRoute]);

  useEffect(() => {
    if (!Object.keys(draftSetErrors).length) return;

    const cleanedCards = draftSet.cards.filter((card) => card.front.trim() && card.back.trim());
    setDraftSetErrors((current) => {
      const next = { ...current };
      if (next.title && draftSet.title.trim()) delete next.title;
      if (next.course && draftSet.course.trim()) delete next.course;
      if (next.cards && cleanedCards.length > 0) delete next.cards;
      return next;
    });
  }, [draftSet.cards, draftSet.course, draftSet.title, draftSetErrors]);

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

  const parseCommaSeparated = (value: string) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const saveAcademicContext = async () => {
    if (!isSignedIn) {
      promptGoogleSignIn();
      return;
    }

    try {
      setIsSavingProfile(true);
      const response = await fetch("/api/study/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school: profile.school,
          major: profile.major,
          currentCourses: parseCommaSeparated(profile.currentCourses),
          interests: parseCommaSeparated(profile.interests),
          studyPreferences: profile.studyPreferences,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not save your academic context.");
      }
      showToast("Academic context saved.");
      setContextCollapsed(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save your academic context.", "error");
    } finally {
      setIsSavingProfile(false);
    }
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
    if (nextScreen !== "groups" && surface !== "home") params.set("mode", surface);
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
      const folderLabel = (set.course || set.subject || set.title).trim();
      const matchesSearch =
        !normalizedSearch ||
        [set.title, set.course, set.subject, set.description, ...set.tags].join(" ").toLowerCase().includes(normalizedSearch);
      const matchesFolder = !folderFilter || folderLabel === folderFilter;
      const matchesSubject = subjectFilter === "all" || set.subject === subjectFilter;
      const matchesDifficulty = difficultyFilter === "all" || set.difficulty === difficultyFilter;
      return matchesSearch && matchesSubject && matchesDifficulty && matchesFolder;
    });
  }, [difficultyFilter, folderFilter, library.sets, search, subjectFilter]);

  const matchingNotes = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();
    return library.notes.filter((note) => {
      const folderLabel = (note.course || note.subject || note.title).trim();
      const matchesSearch =
        !normalizedSearch ||
        [note.title, note.course, note.subject, note.rawContent, note.transcriptContent, ...note.tags]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
      const matchesFolder = !folderFilter || folderLabel === folderFilter;
      return matchesSearch && matchesFolder;
    });
  }, [folderFilter, library.notes, search]);

  const subjects = Array.from(new Set(library.sets.map((set) => set.subject).filter(Boolean)));
  const selectedGroup = library.groups.find((group) => group.id === selectedGroupId) ?? library.groups[0];
  const folderSetPreview = setList.slice(0, 12);
  const folderNotePreview = matchingNotes.slice(0, 8);

  useEffect(() => {
    if (!library.groups.length) {
      setSelectedGroupId("");
      return;
    }
    if (!selectedGroupId || !library.groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(library.groups[0].id);
    }
  }, [library.groups, selectedGroupId]);

  const saveDraftSet = async () => {
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
    if (!draftSet.course.trim()) nextErrors.course = "Choose what class this set is for.";
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
      router.push(`/study?set=${encodeURIComponent(nextSet.id)}`);
    } else {
      openStudyScreen("overview", nextSet.id);
    }
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

  const deleteSet = (setId: string) => {
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
    openStudyScreen(remaining.length ? "overview" : "dashboard", remaining[0]?.id);
    showToast("Study set deleted.");
  };

  const importFromText = () => {
    const parsed = importText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [front, ...rest] = line.split(/::| - | – |: /);
        return {
          ...emptyDraftCard(index),
          front: front?.trim() || "",
          back: rest.join(" ").trim() || "",
        };
      })
      .filter((card) => card.front && card.back);

    if (!parsed.length) {
      showToast("Use one line per card like Term :: Definition.", "error");
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
      const response = await fetch("/api/study/generate-flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceMaterial: importText,
          course: draftSet.course,
          topic: draftSet.subject || draftSet.title,
          desiredCount: 12,
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
          selectedSetId: selectedSet?.id,
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
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to link study set.", "error");
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
        <div className="mx-auto max-w-[1080px] px-1 pb-14 pt-3 sm:px-2">
          <div className="study-appear mb-8 flex items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <Sparkles className="h-4 w-4 text-indigo-300" />
                Generate Study Guides
              </div>
            </div>
            <button
              onClick={() => router.push("/study")}
              {...magneticHoverProps}
              className="study-premium-button inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-zinc-200"
              aria-label="Close study guides"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <CreateView
            draftSet={draftSet}
            courseSuggestions={courseSuggestions}
            importText={importText}
            isGenerating={isGenerating}
            draggingCardId={draggingCardId}
            onDraftSetChange={setDraftSet}
            onImportTextChange={setImportText}
            onGenerateWithAi={generateWithAi}
            onImportPdfFile={importPdfFile}
            onImportFromText={importFromText}
            onSave={saveDraftSet}
            draftSetErrors={draftSetErrors}
            onDragStart={setDraggingCardId}
            onDragEnd={() => setDraggingCardId(null)}
            onReorder={(draggedId, targetId) =>
              setDraftSet((current) => ({ ...current, cards: reorderCards(current.cards, draggedId, targetId) }))
            }
          />
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
      </main>
    );
  }

  if (standaloneSetView && selectedSet) {
    return (
      <main className="min-h-screen bg-transparent pb-20 text-white">
        <div className="mx-auto max-w-[1120px] px-4 pb-14 pt-5 sm:px-6">
          <div className="study-appear mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={() => router.push("/study?mode=flashcards")}
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
                onModeChange={(nextScreen) => openStudyScreen(nextScreen, selectedSet.id)}
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
              />
            ) : (
            <>
            {libraryView ? (
              <section className="study-appear">
                <div className="flex flex-col gap-5">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-200/80">
                      Study mode
                    </div>
                    <h1 className="text-[2.2rem] font-bold tracking-[-0.05em] text-white md:text-[2.7rem]">
                      Your library
                    </h1>
                  </div>

                  <div className="flex flex-wrap items-center gap-6 border-b border-white/10 pb-3 text-sm">
                    <button className="border-b-2 border-[#7b61ff] pb-3 font-semibold text-white">Flashcard sets</button>
                    <button onClick={() => openSurface("notes")} className="pb-3 text-zinc-400 transition hover:text-white">Notes</button>
                    <button onClick={() => openStudyScreen("groups")} className="pb-3 text-zinc-400 transition hover:text-white">Study groups</button>
                    <button onClick={() => router.push("/study/create")} className="pb-3 text-zinc-400 transition hover:text-white">Study guides</button>
                  </div>

                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <select
                      value={difficultyFilter}
                      onChange={(event) => setDifficultyFilter(event.target.value)}
                      className="h-10 min-w-[140px] rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm text-zinc-200 outline-none"
                    >
                      <option value="all">Recent</option>
                      <option value="easy">Easy sets</option>
                      <option value="medium">Medium sets</option>
                      <option value="hard">Hard sets</option>
                    </select>
                    <div className="relative w-full max-w-[440px]">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search flashcards"
                        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-500"
                      />
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            <StudyIdentityCard
              isSignedIn={isSignedIn}
              isSaving={isSavingProfile}
              displayName={session?.user?.name}
              email={session?.user?.email}
              profile={profile}
              collapsed={contextCollapsed}
              onProfileChange={setProfile}
              onSave={saveAcademicContext}
              onSignIn={promptGoogleSignIn}
              onToggleCollapsed={setContextCollapsed}
            />

            {folderFilter ? (
              <section className="space-y-8">
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
                  <div>
                    <div className="flex items-start gap-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.05] text-white">
                        <FolderOpen className="h-8 w-8" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-[2rem] font-bold tracking-[-0.04em] text-white">
                          {folderFilter}
                        </h2>
                        <div className="mt-2 text-sm text-zinc-400">
                          {folderSetPreview.length} flashcard set{folderSetPreview.length === 1 ? "" : "s"} and {folderNotePreview.length} note{folderNotePreview.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                      <button className="rounded-full border border-white/20 bg-transparent px-4 py-2 text-sm font-semibold text-white">
                        All
                      </button>
                      <button className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.08] hover:text-white">
                        Flashcard sets
                      </button>
                      <button className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.08] hover:text-white">
                        Notes
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search this folder"
                        className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-500"
                      />
                    </div>
                    <div className="text-xs text-zinc-500">
                      Everything in this folder stays grouped here so it is easier to jump back in.
                    </div>
                  </div>
                </div>

                <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-8">
                    <div>
                      <div className="mb-4 flex items-center justify-between gap-4">
                        <div className="text-sm font-semibold text-white">Recent</div>
                        <div className="text-xs text-zinc-500">
                          {folderSetPreview.length + folderNotePreview.length} item{folderSetPreview.length + folderNotePreview.length === 1 ? "" : "s"}
                        </div>
                      </div>

                      <div className="space-y-3">
                        {folderSetPreview.length ? (
                          folderSetPreview.map((set) => (
                            <button
                              key={set.id}
                              onClick={() => {
                                setSelectedSetId(set.id);
                                openStudyScreen("overview", set.id);
                              }}
                              className="flex w-full items-start gap-4 rounded-2xl border border-transparent px-4 py-3 text-left transition hover:bg-white/[0.04]"
                            >
                              <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-xl bg-[#243252] text-[#8fd3ff]">
                                <BookOpen className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-white">{set.title}</div>
                                <div className="mt-1 text-xs text-zinc-400">
                                  Flashcard set • {set.cards.length} terms • by you
                                </div>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] px-5 py-6 text-sm text-zinc-400">
                            No flashcard sets inside this folder yet.
                          </div>
                        )}
                      </div>
                    </div>

                    {folderNotePreview.length ? (
                      <div>
                        <div className="mb-4 text-sm font-semibold text-white">Notes</div>
                        <div className="space-y-3">
                          {folderNotePreview.map((note) => (
                            <button
                              key={note.id}
                              onClick={() => router.push(`/study?mode=notes&note=${encodeURIComponent(note.id)}&folder=${encodeURIComponent(folderFilter)}`)}
                              className="flex w-full items-start gap-4 rounded-2xl border border-transparent px-4 py-3 text-left transition hover:bg-white/[0.04]"
                            >
                              <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-zinc-200">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-white">{note.title}</div>
                                <div className="mt-1 text-xs text-zinc-400">
                                  Note • by you
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                        Folder actions
                      </div>
                      <div className="mt-4 space-y-3">
                        <button
                          onClick={() => router.push("/study/create")}
                          className="flex w-full items-center justify-center rounded-full bg-[#4f46e5] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5d53f3]"
                        >
                          Add sets
                        </button>
                        <button
                          onClick={() => openSurface("notes")}
                          className="flex w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.09] hover:text-white"
                        >
                          Open notes
                        </button>
                      </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                        In this folder
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Flashcard sets</div>
                          <div className="mt-2 text-2xl font-semibold text-white">{folderSetPreview.length}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Notes</div>
                          <div className="mt-2 text-2xl font-semibold text-white">{folderNotePreview.length}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : (
            <section className="space-y-8">

              {selectedSet ? (
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
                      <div className="mt-6 flex flex-wrap gap-3">
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
                      <div className="mt-5 flex gap-3">
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

              <div>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                  {globalQuery ? "Search results" : libraryView ? "Recently added" : "Recents"}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {setList.length ? (
                    setList.slice(0, 6).map((set) => (
                      <button
                        key={set.id}
                        onClick={() => {
                          setSelectedSetId(set.id);
                          openStudyScreen("overview", set.id);
                        }}
                        className="block w-full rounded-xl border border-white/10 bg-[#4b537a] px-4 py-4 text-left transition hover:bg-[#566089]"
                      >
                        <div className="text-[11px] text-zinc-300">
                          {set.cards.length} Terms
                        </div>
                        <div className="mt-1 text-[1.15rem] font-semibold text-white">{set.title}</div>
                        <div className="mt-1 text-xs text-zinc-300">
                          {[set.course || set.subject, new Date(set.updatedAt).toLocaleDateString("en-US")].filter(Boolean).join(" • ")}
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

              {(folderFilter || globalQuery) && (
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

              <div>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                  Study exactly what you need
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <button
                    onClick={() => router.push("/study/create")}
                    className="rounded-[1.5rem] border border-white/10 bg-[#2e315d] p-5 text-left transition hover:bg-[#383d71]"
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
                      <div className="hidden h-32 w-52 overflow-hidden rounded-[1.2rem] border border-white/10 bg-[#d9e5fb] md:block">
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
                      className="rounded-[1.5rem] border border-white/10 bg-[#2a2f58] p-5 text-left transition hover:bg-[#353b6b]"
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
                        <div className="hidden h-32 w-52 overflow-hidden rounded-[1.2rem] border border-white/10 bg-[#d2eef5] md:block">
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

              <div className="grid gap-4 xl:grid-cols-3">
                <button
                  onClick={() => router.push("/study?mode=flashcards")}
                  className="rounded-xl border border-white/10 bg-white/[0.05] p-5 text-left transition hover:bg-white/[0.08]"
                >
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Flashcards</div>
                  <div className="mt-2 text-xl font-semibold text-white">Study with recall.</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-400">Open your decks, review cards, and track mastery.</div>
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
                  onClick={() => router.push("/study/create")}
                  className="rounded-xl border border-white/10 bg-white/[0.05] p-5 text-left transition hover:bg-white/[0.08]"
                >
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Study guides</div>
                  <div className="mt-2 text-xl font-semibold text-white">Generate from text.</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-400">Paste material and turn it into a guide and flashcards.</div>
                </button>
              </div>

              {!libraryView ? (
              <div>
                <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                  Learn questions
                </div>
                <div className="max-w-[760px] rounded-[1.5rem] border border-white/10 bg-[#282856] p-5">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">General trivia</div>
                  <div className="mt-3 text-sm text-zinc-400">{triviaIndex + 1} / {HOME_TRIVIA_QUESTIONS.length}</div>
                  <div className="mt-2 text-[1.4rem] font-medium text-white">
                    {activeTriviaQuestion.prompt}
                  </div>
                  <div className="mt-5 space-y-3">
                    {activeTriviaQuestion.choices.map((choice) => {
                      const isAnswered = Boolean(selectedTriviaChoice);
                      const isCorrectChoice = choice === activeTriviaQuestion.correctAnswer;
                      const isPickedChoice = choice === selectedTriviaChoice;
                      const isWrongPick = isAnswered && isPickedChoice && !isCorrectChoice;
                      const isRightState = isAnswered && isCorrectChoice;
                      return (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => {
                          if (selectedTriviaChoice) return;
                          setSelectedTriviaChoice(choice);
                        }}
                        className={`block w-full rounded-xl border px-4 py-4 text-left text-sm transition ${
                          isRightState
                            ? "border-emerald-400/70 bg-emerald-500/18 text-white"
                            : isWrongPick
                              ? "border-rose-400/70 bg-rose-500/18 text-white"
                              : "border-white/10 bg-transparent text-zinc-200 hover:bg-white/[0.05]"
                        }`}
                      >
                        {choice}
                      </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 text-xs text-zinc-500">Picks show instantly, then the next question loads automatically.</div>
                </div>
              </div>
              ) : null}

              {!libraryView ? (
              <div className="grid gap-3 md:grid-cols-4">
                <StatCard label="Study sets" value={`${dashboard.totalSets}`} icon={<Layers3 className="h-4 w-4" />} />
                <StatCard label="Groups" value={`${dashboard.totalGroups}`} icon={<Users className="h-4 w-4" />} />
                <StatCard label="Cards tracked" value={`${dashboard.totalCards}`} icon={<BookOpen className="h-4 w-4" />} />
                <StatCard label="Avg accuracy" value={`${dashboard.averageAccuracy}%`} icon={<Target className="h-4 w-4" />} />
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
            <div className="mx-auto max-w-[980px]">
              {focusedModeContent}
            </div>
          </div>
        ) : (
          <>
        {!isFocusedStudyMode && <div className="study-appear mb-4 flex items-center justify-between gap-4">
          <button
            onClick={goToStudyHome}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.07] hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to study home
          </button>
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Flashcards workspace
          </div>
        </div>}
        {!isFocusedStudyMode && <section className="study-appear study-premium-panel rounded-[1.5rem] p-5 md:p-6">
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">
                Flashcards workspace
              </div>
              <h1 className="mt-4 max-w-[11ch] text-[2rem] font-bold tracking-[-0.05em] text-white md:text-[2.5rem]">
                Flashcards, test, and match.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
                Build a set, study fast, and keep your progress in one place.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[344px]">
              <button
                onClick={() => {
                  setDraftSet(emptyDraftSet());
                  router.push("/study/create");
                }}
                {...magneticHoverProps}
                className="study-premium-button inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                Create study set
              </button>
              <button
                onClick={() => router.push("/study/create")}
                {...magneticHoverProps}
                className="study-premium-button inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/5 px-5 py-3 text-sm font-semibold text-zinc-100"
              >
                <Plus className="h-4 w-4" />
                Add another set
              </button>
            </div>
          </div>

          <div className="relative mt-5 grid gap-3 md:grid-cols-4">
            <StatCard label="Study sets" value={`${dashboard.totalSets}`} icon={<Layers3 className="h-4 w-4" />} />
            <StatCard label="Groups" value={`${dashboard.totalGroups}`} icon={<Users className="h-4 w-4" />} />
            <StatCard label="Cards tracked" value={`${dashboard.totalCards}`} icon={<BookOpen className="h-4 w-4" />} />
            <StatCard label="Avg accuracy" value={`${dashboard.averageAccuracy}%`} icon={<Target className="h-4 w-4" />} />
          </div>
        </section>}

        <div className={`mt-6 grid gap-5 ${isFocusedStudyMode ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_250px] lg:items-start"}`}>
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
                onCreateSet={() => router.push("/study/create")}
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
              />
            )}

            {screen === "create" && (
              <CreateView
                draftSet={draftSet}
                courseSuggestions={courseSuggestions}
                importText={importText}
                isGenerating={isGenerating}
                draggingCardId={draggingCardId}
                onDraftSetChange={setDraftSet}
                onImportTextChange={setImportText}
                onGenerateWithAi={generateWithAi}
                onImportPdfFile={importPdfFile}
                onImportFromText={importFromText}
                onSave={saveDraftSet}
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
                onModeChange={(nextScreen) => openStudyScreen(nextScreen, selectedSet.id)}
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
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Workspace</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <NavButton active={screen === "dashboard"} onClick={() => openStudyScreen("dashboard")} icon={<BarChart3 className="h-4 w-4" />}>
                  Dashboard
                </NavButton>
                <NavButton active={screen === "groups"} onClick={() => openStudyScreen("groups")} icon={<Users className="h-4 w-4" />}>
                  Study groups
                </NavButton>
                <NavButton active={false} onClick={() => router.push("/study/create")} icon={<Plus className="h-4 w-4" />}>
                  Create set
                </NavButton>
                <NavButton active={screen === "overview"} onClick={() => openStudyScreen("overview")} icon={<BookOpen className="h-4 w-4" />}>
                  Current set
                </NavButton>
              </div>
              <div className="mt-4 border-t border-white/8 pt-4">
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
              </div>
            </div>

            <div className="study-premium-panel study-appear rounded-[1.6rem] p-4 backdrop-blur-xl">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Library</div>
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
              {selectedSet ? (
                <button
                  onClick={() => onAddSetToGroup(selectedGroup.id, selectedSet.id)}
                  className="rounded-full bg-white/[0.08] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.14]"
                >
                  Add a set
                </button>
              ) : null}
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
                    onClick={() => selectedSet && onAddSetToGroup(selectedGroup.id, selectedSet.id)}
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
  courseSuggestions,
  importText,
  isGenerating,
  draftSetErrors,
  draggingCardId,
  onDraftSetChange,
  onImportTextChange,
  onGenerateWithAi,
  onImportPdfFile,
  onImportFromText,
  onSave,
  onDragStart,
  onDragEnd,
  onReorder,
}: {
  draftSet: StudySet;
  courseSuggestions: StudyCourseSuggestion[];
  importText: string;
  isGenerating: boolean;
  draftSetErrors: DraftSetErrors;
  draggingCardId: string | null;
  onDraftSetChange: React.Dispatch<React.SetStateAction<StudySet>>;
  onImportTextChange: (value: string) => void;
  onGenerateWithAi: () => void;
  onImportPdfFile: (file: File) => Promise<void>;
  onImportFromText: () => void;
  onSave: () => void;
  onDragStart: (cardId: string | null) => void;
  onDragEnd: () => void;
  onReorder: (draggedId: string, targetId: string) => void;
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
              rows={9}
              placeholder="Put your notes here. We'll do the rest."
              className="w-full rounded-xl border border-white/10 bg-[#49527a] px-4 py-4 text-sm leading-7 text-white outline-none placeholder:text-zinc-300"
            />
            <div className="mt-2 text-right text-xs text-zinc-500">
              {importText.length.toLocaleString()}/100,000 characters
            </div>
          </div>

          <div className="mt-10">
            <div className="text-sm font-semibold text-white">From this upload, you&apos;ll also get</div>
            <div className="mt-4 inline-flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#253a6a] text-sky-200">
                <BookOpen className="h-5 w-5" />
              </span>
              <div>
                <div className="text-sm font-semibold text-white">Flashcards</div>
                <div className="text-xs text-zinc-400">Memorize your material</div>
              </div>
            </div>
          </div>

          <div className="mt-10 flex items-center justify-between gap-4">
            <div className="max-w-md text-xs leading-6 text-zinc-500">
              This product is enhanced by AI and may provide incorrect content. Do not enter personal data.
            </div>
            <button
              onClick={onGenerateWithAi}
              disabled={isGenerating}
              {...magneticHoverProps}
              className="study-premium-button rounded-full bg-white/[0.1] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isGenerating ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>

        <div className="study-premium-panel study-appear rounded-[1.5rem] p-5 backdrop-blur-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Set details</div>
              <h2 className="mt-2 max-w-lg text-[1.45rem] font-semibold tracking-[-0.03em] text-white">Review and save</h2>
            </div>
            <button onClick={onSave} {...magneticHoverProps} className="study-premium-button self-start rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white">
              Save set
            </button>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Set title <span className="text-red-400">*</span></span>
              <input
                value={draftSet.title}
                onChange={(event) =>
                  onDraftSetChange((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Set title"
                className={`study-premium-input rounded-2xl border bg-white/[0.05] px-4 py-3 text-lg font-semibold text-white outline-none placeholder:text-zinc-500 ${
                  draftSetErrors.title ? "border-red-400/40" : "border-white/10"
                }`}
              />
              {draftSetErrors.title ? <span className="text-xs text-red-300">{draftSetErrors.title}</span> : null}
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Description</span>
              <textarea
                value={draftSet.description}
                onChange={(event) => onDraftSetChange((current) => ({ ...current, description: event.target.value }))}
                placeholder="Add a description..."
                rows={3}
                className="study-premium-input rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
              />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Course <span className="text-red-400">*</span></span>
                <input
                  list="study-course-suggestions"
                  value={draftSet.course}
                  onChange={(event) => onDraftSetChange((current) => ({ ...current, course: event.target.value }))}
                  placeholder="Choose a course like CS 211"
                  className={`study-premium-input rounded-2xl border bg-white/[0.05] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 ${
                    draftSetErrors.course ? "border-red-400/40" : "border-white/10"
                  }`}
                />
                <datalist id="study-course-suggestions">
                  {courseSuggestions.map((course) => (
                    <option key={course.id} value={course.code}>
                      {course.title}
                    </option>
                  ))}
                </datalist>
                {draftSetErrors.course ? <span className="text-xs text-red-300">{draftSetErrors.course}</span> : null}
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Subject</span>
                <input
                  value={draftSet.subject}
                  onChange={(event) => onDraftSetChange((current) => ({ ...current, subject: event.target.value }))}
                  placeholder="Subject"
                  className="study-premium-input rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
                />
              </label>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={onImportFromText} {...magneticHoverProps} className="study-premium-button rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-zinc-100">
              Import parsed cards
            </button>
            <button
              onClick={() => onDraftSetChange((current) => ({ ...current, cards: [...current.cards, emptyDraftCard(current.cards.length)] }))}
              {...magneticHoverProps}
              className="study-premium-button rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-zinc-100"
            >
              Add card
            </button>
          </div>
          {draftSetErrors.cards ? (
            <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-500/8 px-4 py-3 text-sm text-red-200">
              {draftSetErrors.cards}
            </div>
          ) : null}

          <div className="mt-6 space-y-4">
            {draftSet.cards.map((card, index) => (
              <div
                key={card.id}
                draggable
                onDragStart={() => onDragStart(card.id)}
                onDragEnd={onDragEnd}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => draggingCardId && onReorder(draggingCardId, card.id)}
                className="study-premium-card rounded-[1.5rem] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-zinc-300">Card {index + 1}</div>
                  <div className="flex items-center gap-2">
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
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <textarea
                    value={card.front}
                    onChange={(event) => updateDraftCard(onDraftSetChange, card.id, { front: event.target.value })}
                    placeholder="Enter term / front"
                    rows={3}
                    className="study-premium-input rounded-2xl border border-white/10 bg-[#1a2030] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
                  />
                  <textarea
                    value={card.back}
                    onChange={(event) => updateDraftCard(onDraftSetChange, card.id, { back: event.target.value })}
                    placeholder="Enter definition / back"
                    rows={3}
                    className="study-premium-input rounded-2xl border border-white/10 bg-[#1a2030] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
                  />
                </div>
              </div>
            ))}
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
                value={draftSet.visibility}
                onChange={(event) => onDraftSetChange((current) => ({ ...current, visibility: event.target.value as StudySet["visibility"] }))}
                className="study-premium-input rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none"
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </label>
            <div className="text-xs leading-6 text-zinc-500">
              {draftSet.visibility === "public"
                ? "Public sets are searchable by course for other students."
                : "Private sets stay in your own library only."}
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
  onModeChange,
  onDuplicate,
  onDelete,
  onEdit,
}: {
  set: StudySet;
  progressMap: Record<string, CardProgress>;
  onModeChange: (screen: Screen) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const mastery = set.cards.length
    ? Math.round(set.cards.reduce((sum, card) => sum + (progressMap[card.id]?.masteryScore || 0), 0) / set.cards.length)
    : 0;
  const starred = set.cards.filter((card) => progressMap[card.id]?.starred).length;
  const difficult = set.cards.filter((card) => progressMap[card.id]?.markedDifficult).length;

  return (
    <div className="space-y-6">
      <div className="study-premium-panel study-appear rounded-[1.75rem] p-6 backdrop-blur-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-indigo-200">
              {set.course || set.subject}
            </div>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] text-white">{set.title}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400">{set.description || "Study set ready for flashcards, learn mode, test mode, and matching practice."}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {set.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <button onClick={onEdit} {...magneticHoverProps} className="study-premium-button rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-zinc-100">
              Edit set
            </button>
            <button onClick={onDuplicate} {...magneticHoverProps} className="study-premium-button rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-zinc-100">
              Copy set
            </button>
            <button onClick={onDelete} {...magneticHoverProps} className="study-premium-button rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100">
              Delete set
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <StatCard label="Cards" value={`${set.cards.length}`} icon={<BookOpen className="h-4 w-4" />} />
          <StatCard label="Mastery" value={`${mastery}%`} icon={<Trophy className="h-4 w-4" />} />
          <StatCard label="Starred" value={`${starred}`} icon={<Star className="h-4 w-4" />} />
          <StatCard label="Difficult" value={`${difficult}`} icon={<Flame className="h-4 w-4" />} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <ModeCard icon={<Copy className="h-5 w-5" />} title="Flashcards" body="Flip through cards with smooth controls, shuffle, star, and review filters." onClick={() => onModeChange("flashcards")} />
        <ModeCard icon={<Brain className="h-5 w-5" />} title="Learn" body="Adaptive review repeats weak cards sooner and mastered cards less often." onClick={() => onModeChange("learn")} />
        <ModeCard icon={<Target className="h-5 w-5" />} title="Test" body="Multiple choice, true/false, written, and mixed mode." onClick={() => onModeChange("test")} />
        <ModeCard icon={<Shuffle className="h-5 w-5" />} title="Match" body="Fast matching practice for memorization-heavy review sessions." onClick={() => onModeChange("match")} />
      </div>

      <div className="study-premium-panel study-appear rounded-[1.75rem] p-6 backdrop-blur-xl">
        <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Preview cards</div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {set.cards.slice(0, 4).map((card) => (
            <div key={card.id} className="study-premium-card rounded-[1.4rem] p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">{card.tags[0] || set.subject}</div>
              <div className="mt-3 text-lg font-semibold text-white">{card.front}</div>
              <div className="mt-4 text-sm leading-7 text-zinc-400">{card.back}</div>
            </div>
          ))}
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
    <div className="space-y-5">
      <ModeHeader title={`${set.title} • Flashcards`} onBack={onBack} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { screen: "flashcards" as Screen, label: "Flashcards", icon: <Copy className="h-4 w-4" /> },
          { screen: "learn" as Screen, label: "Learn", icon: <Brain className="h-4 w-4" /> },
          { screen: "test" as Screen, label: "Test", icon: <Target className="h-4 w-4" /> },
          { screen: "match" as Screen, label: "Match", icon: <Shuffle className="h-4 w-4" /> },
        ].map((mode) => (
          <button
            key={mode.screen}
            onClick={() => onModeChange(mode.screen)}
            {...magneticHoverProps}
            className={`study-premium-button inline-flex items-center gap-3 rounded-[1.2rem] border px-4 py-3 text-left text-sm font-semibold transition ${
              mode.screen === "flashcards"
                ? "border-sky-300/24 bg-sky-100 text-slate-950 shadow-[0_16px_36px_rgba(125,211,252,0.16)]"
                : "border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08]"
            }`}
          >
            <span className={`inline-flex rounded-xl p-2 ${mode.screen === "flashcards" ? "bg-slate-950/8 text-slate-900" : "bg-white/[0.06] text-indigo-200"}`}>
              {mode.icon}
            </span>
            <span>{mode.label}</span>
          </button>
        ))}
      </div>
      <div ref={panelRef} className={`study-premium-panel study-appear rounded-[1.85rem] p-5 backdrop-blur-xl ${isFullscreen ? "study-flashcards-fullscreen h-full min-h-screen overflow-auto p-8" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {([
              { value: "all", label: "All" },
              { value: "starred", label: "Starred" },
              { value: "difficult", label: "Difficult" },
              { value: "missed", label: "Missed" },
              { value: "unseen", label: "Unseen" },
            ] as Array<{ value: StudyFilter; label: string }>).map((item) => (
              <button
                key={item.value}
                onClick={() => {
                  setFilter(item.value);
                  setIndex(0);
                }}
                {...magneticHoverProps}
                className={`study-premium-button rounded-full px-3 py-2 text-xs font-semibold transition ${
                  filter === item.value ? "bg-white text-zinc-950" : "border border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTrackProgress((current) => !current)}
              {...magneticHoverProps}
              className={`study-premium-button inline-flex items-center gap-3 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                trackProgress
                  ? "border-indigo-300/30 bg-indigo-400/20 text-indigo-100"
                  : "border-white/10 bg-white/[0.03] text-zinc-300"
              }`}
            >
              <span>Track progress</span>
              <span className={`relative h-6 w-11 rounded-full transition ${trackProgress ? "bg-indigo-500/90" : "bg-white/12"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${trackProgress ? "left-[1.35rem]" : "left-0.5"}`} />
              </span>
            </button>
            <button
              onClick={() => {
                setAutoplay((current) => !current);
                setRecentFeedback(null);
              }}
              {...magneticHoverProps}
              className={`study-premium-button inline-flex h-10 w-10 items-center justify-center rounded-full border text-zinc-200 transition ${autoplay ? "scale-105 border-sky-300/30 bg-sky-400/20 text-sky-100 shadow-[0_10px_24px_rgba(56,189,248,0.18)]" : "border-white/10 bg-white/[0.03]"}`}
              title={autoplay ? "Stop autoplay" : "Autoplay"}
              aria-label={autoplay ? "Stop autoplay" : "Autoplay"}
            >
              {autoplay ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              onClick={toggleFullscreen}
              {...magneticHoverProps}
              className={`study-premium-button inline-flex h-10 w-10 items-center justify-center rounded-full border text-zinc-200 transition ${isFullscreen ? "border-white/20 bg-white/[0.08]" : "border-white/10 bg-white/[0.03]"}`}
              title={isFullscreen ? "Exit full screen" : "Full screen"}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-5 h-2 rounded-full bg-white/6">
          <div className="h-2 rounded-full bg-[#7b86b5]" style={{ width: `${((index + 1) / cards.length) * 100}%` }} />
        </div>

        <div ref={containerRef} className={`mt-6 ${isFullscreen ? "mx-auto w-full max-w-6xl" : ""}`}>
          <button
            type="button"
            onClick={() => setFlipped((current) => !current)}
            className={`group relative w-full select-none overflow-hidden rounded-[2rem] [perspective:1800px] outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${isFullscreen ? "h-[68vh] max-h-[760px] min-h-[520px]" : "h-[420px]"}`}
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
              className={`relative h-full w-full rounded-[2rem] will-change-transform transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] [transform-style:preserve-3d] ${
                flipped ? "[transform:rotateY(180deg)]" : ""
              } ${cardMotion === "next" ? "study-card-enter-next" : cardMotion === "prev" ? "study-card-enter-prev" : ""}`}
            >
              <div className="absolute inset-0 flex h-full w-full [backface-visibility:hidden] items-center justify-center rounded-[2rem] border border-white/10 bg-[#343d62] p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.3)]">
                <div>
                  {card.hint ? (
                    <div className="mb-5 flex items-center justify-center gap-2 text-sm text-zinc-300">
                      <BookOpen className="h-4 w-4" />
                      {card.hint}
                    </div>
                  ) : null}
                  <div className="text-4xl font-medium tracking-[-0.03em] text-white">{card.front}</div>
                </div>
              </div>
              <div className="absolute inset-0 flex h-full w-full [backface-visibility:hidden] [transform:rotateY(180deg)] items-center justify-center rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,#1a2037_0%,#232d4b_100%)] p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.3)]">
                <div className="max-w-3xl">
                  <div className="text-3xl font-medium tracking-[-0.03em] text-white">{card.back}</div>
                  {card.example ? <div className="mt-5 text-sm leading-7 text-zinc-300">Example: {card.example}</div> : null}
                  {card.mnemonic ? <div className="mt-3 text-sm leading-7 text-zinc-400">Memory trick: {card.mnemonic}</div> : null}
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <span>{index + 1} / {cards.length}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-zinc-300">
              Mastery {setMastery}%
            </span>
            {trackProgress ? (
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                recentFeedback === "knew"
                  ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
                  : recentFeedback === "missed"
                  ? "border-red-400/30 bg-red-500/15 text-red-200"
                  : "border-white/10 bg-white/[0.04] text-zinc-300"
              }`}>
                {recentFeedback === "knew" ? "Marked known" : recentFeedback === "missed" ? "Marked difficult" : `Card ${currentProgress.masteryScore}%`}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!trackProgress ? (
              <>
                <IconControlButton onClick={() => moveCard("prev")} icon={<ChevronLeft className="h-5 w-5" />} label="Previous card" />
                <IconControlButton onClick={() => setFlipped((current) => !current)} icon={<Copy className="h-4.5 w-4.5" />} label="Flip card" />
                <IconControlButton
                  onClick={() => onToggleFlag(card.id, { starred: !currentProgress.starred })}
                  icon={<Star className={`h-4.5 w-4.5 ${currentProgress.starred ? "fill-current" : ""}`} />}
                  label={currentProgress.starred ? "Unstar card" : "Star card"}
                  active={currentProgress.starred}
                />
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
                <IconControlButton onClick={goToNextCard} icon={<ChevronRight className="h-5 w-5" />} label="Next card" />
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
  const queue = useMemo(() => getRecommendedCards(set, progressMap), [progressMap, set]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [startedAt] = useState(() => new Date().toISOString());
  const [streak, setStreak] = useState(0);
  const [rewardPopId, setRewardPopId] = useState(0);
  const card = queue[index];

  if (!card) {
    return <EmptyModeState title="No cards available to learn right now." onBack={onBack} />;
  }

  const nextCard = (result: "knew" | "missed") => {
    onProgress(card.id, result);
    const nextStreak = result === "knew" ? streak + 1 : 0;
    setStreak(nextStreak);
    if (result === "knew") {
      setRewardPopId((current) => current + 1);
    }
    if (result === "knew" && (nextStreak === 3 || nextStreak === 6)) {
      onCelebrate(nextStreak === 3 ? "Three in a row. You’re warming up." : "Six in a row. You’re locked in.");
    }
    if (index === queue.length - 1) {
      onSessionSave(buildStudySession(set.id, "learn", startedAt, queue.length, result === "knew" ? 100 : 60));
      if (result === "knew") onCelebrate("Learn session complete. Nice finish.");
      setIndex(0);
      setRevealed(false);
      setStreak(0);
      return;
    }
    setIndex((current) => current + 1);
    setRevealed(false);
  };

  return (
    <div className="study-appear space-y-5">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 text-zinc-200">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            {...magneticHoverProps}
            className="study-premium-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]"
            aria-label="Back to set"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-sm font-semibold text-white">Learn</div>
        </div>
        <div className="hidden text-xs text-zinc-500 md:block">{set.title}</div>
        <Link href="/study" {...magneticHoverProps} className="study-premium-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
          <Layers3 className="h-4.5 w-4.5" />
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-5xl items-center gap-1.5">
        <div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-emerald-500/25 px-2 text-xs font-semibold text-emerald-100">
          {streak}
        </div>
        {Array.from({ length: 6 }).map((_, segmentIndex) => {
          const progress = Math.min(1, Math.max(0, ((index + (revealed ? 1 : 0)) / Math.max(queue.length, 1)) * 6 - segmentIndex));
          return (
            <div key={segmentIndex} className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#7583b5] transition-all" style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }} />
            </div>
          );
        })}
        <div className="flex h-8 min-w-10 items-center justify-center rounded-full bg-white/10 px-2 text-xs font-semibold text-zinc-200">
          {queue.length}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl rounded-[1.6rem] border border-[#515b84] bg-[#394264] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)] sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
            <span>Term</span>
            <Volume2 className="h-3.5 w-3.5" />
          </div>
          <div className="text-xs text-zinc-400">{index + 1} of {queue.length}</div>
        </div>

        <div className="mt-8 min-h-[110px] text-[2rem] leading-[1.2] font-medium tracking-[-0.03em] text-white">
          {card.front}
        </div>

        <div className="mt-10 text-sm font-medium text-zinc-200">
          {revealed ? "Answer" : "Choose an action"}
        </div>

        <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-[#3f496f] p-5 text-center">
          {revealed ? (
            <div>
              <div className="text-xl text-white sm:text-2xl">{card.back}</div>
              {card.hint ? <div className="mt-3 text-sm leading-7 text-zinc-300">{card.hint}</div> : null}
            </div>
          ) : (
            <div className="text-sm leading-7 text-zinc-300">Think of the answer first, then reveal it when you’re ready.</div>
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {!revealed ? (
            <>
              <button onClick={() => setRevealed(true)} {...magneticHoverProps} className="study-premium-button rounded-[0.95rem] border border-white/12 bg-[#394264] px-4 py-4 text-left text-sm font-medium text-zinc-100">
                Reveal answer
              </button>
              <button onClick={() => nextCard("missed")} {...magneticHoverProps} className="study-premium-button rounded-[0.95rem] border border-white/12 bg-[#394264] px-4 py-4 text-left text-sm font-medium text-zinc-300">
                Skip for now
              </button>
            </>
          ) : (
            <>
              <button onClick={() => nextCard("missed")} {...magneticHoverProps} className="study-premium-button rounded-[0.95rem] border border-white/12 bg-[#394264] px-4 py-4 text-left text-sm font-medium text-zinc-100">
                Didn’t know it
              </button>
              <button onClick={() => nextCard("knew")} {...magneticHoverProps} className="study-premium-button rounded-[0.95rem] border border-white/12 bg-[#394264] px-4 py-4 text-left text-sm font-medium text-zinc-100">
                Knew it
              </button>
            </>
          )}
        </div>

        <div className="relative mt-5 flex h-7 items-center justify-end">
          {rewardPopId > 0 ? (
            <div
              key={rewardPopId}
              className="study-reward-pop absolute left-0 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/12 px-3 py-1 text-xs font-semibold text-emerald-100"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Nice, you got it
            </div>
          ) : null}
          <div className="text-xs font-medium text-indigo-200">{revealed ? "Continue" : "Don’t know?"}</div>
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
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 text-zinc-200">
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

      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="rounded-[1.6rem] border border-[#515b84] bg-[#394264] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)] sm:p-7">
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

function existsInLibrary(library: StudyLibraryState, setId: string) {
  return library.sets.some((set) => set.id === setId);
}
