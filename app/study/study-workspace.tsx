"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import {
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
  Globe,
  GripVertical,
  ImageIcon,
  Layers3,
  Lock,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Plus,
  Pencil,
  Play,
  Pause,
  RotateCcw,
  Search,
  Share2,
  Shuffle,
  Sparkles,
  Star,
  Target,
  Trash2,
  Trophy,
  Users,
  Volume2,
  WandSparkles,
  X,
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

/**
 * Speak `text` using a natural English voice.
 *
 * Chrome loads voices asynchronously, so `getVoices()` often returns [] on the
 * first call.  We listen for `voiceschanged` as a fallback so the correct
 * voice is always used regardless of when the button is clicked.
 *
 * Voice priority (descending):
 *   1. en-US + "Google" / "Natural" / "Premium" / "Enhanced" in the name
 *   2. Any en-US voice
 *   3. Any English voice (en-*)
 *   4. Browser default (lang tag only, no voice override)
 */
function speakEnglish(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();

  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = "en-US";

  const pickVoiceAndSpeak = () => {
    const voices = window.speechSynthesis.getVoices();
    const enUsNatural = voices.find(
      (v) => v.lang === "en-US" && /google|natural|premium|enhanced|samantha|alex/i.test(v.name),
    );
    const enUs = voices.find((v) => v.lang === "en-US");
    const enAny = voices.find((v) => v.lang.startsWith("en"));
    const chosen = enUsNatural ?? enUs ?? enAny ?? null;
    if (chosen) utt.voice = chosen;
    window.speechSynthesis.speak(utt);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    pickVoiceAndSpeak();
  } else {
    // Voices not ready yet — wait for the browser to finish loading them
    window.speechSynthesis.addEventListener("voiceschanged", pickVoiceAndSpeak, { once: true } as EventListenerOptions);
  }
}

function playCelebrationSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    // C major arpeggio: C5, E5, G5, C6
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.03);
      gain.gain.linearRampToValueAtTime(0, start + 0.28);
      osc.start(start);
      osc.stop(start + 0.32);
    });
  } catch { /* ignore */ }
}

function VisibilityIcon({
  visibility,
  className = "h-3.5 w-3.5",
}: {
  visibility: StudySet["visibility"];
  className?: string;
}) {
  return visibility === "public" ? <Globe className={className} /> : <Lock className={className} />;
}

function VisibilityBadge({
  visibility,
  compact = false,
}: {
  visibility: StudySet["visibility"];
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${
        compact
          ? visibility === "public"
            ? "border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-emerald-200"
            : "border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-amber-200"
          : visibility === "public"
            ? "border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200"
            : "border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200"
      }`}
    >
      <VisibilityIcon visibility={visibility} className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {visibility === "public" ? "Public" : "Private"}
    </span>
  );
}

function triggerCelebration() {
  playCelebrationSound();
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([80, 40, 80, 40, 200]);
  }
}

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
  { prompt: "What is the chemical symbol for gold?", choices: ["Go", "Au", "Ag", "Gd"], correctAnswer: "Au" },
  { prompt: "How many sides does a hexagon have?", choices: ["5", "6", "7", "8"], correctAnswer: "6" },
  { prompt: "Which country is home to the kangaroo?", choices: ["New Zealand", "South Africa", "Brazil", "Australia"], correctAnswer: "Australia" },
  { prompt: "What is the longest river in the world?", choices: ["Amazon", "Mississippi", "Nile", "Yangtze"], correctAnswer: "Nile" },
  { prompt: "How many strings does a standard guitar have?", choices: ["4", "5", "6", "7"], correctAnswer: "6" },
  { prompt: "What is the smallest country in the world?", choices: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], correctAnswer: "Vatican City" },
  { prompt: "Which element has the symbol 'O'?", choices: ["Gold", "Osmium", "Oxygen", "Oganesson"], correctAnswer: "Oxygen" },
  { prompt: "How many players are on a basketball team on the court?", choices: ["4", "5", "6", "7"], correctAnswer: "5" },
  { prompt: "What is the capital of France?", choices: ["Lyon", "Marseille", "Paris", "Nice"], correctAnswer: "Paris" },
  { prompt: "Which gas makes up most of Earth's atmosphere?", choices: ["Oxygen", "Carbon dioxide", "Nitrogen", "Argon"], correctAnswer: "Nitrogen" },
  { prompt: "What is the square root of 144?", choices: ["11", "12", "13", "14"], correctAnswer: "12" },
  { prompt: "Which famous scientist developed the theory of relativity?", choices: ["Newton", "Darwin", "Einstein", "Hawking"], correctAnswer: "Einstein" },
  { prompt: "How many colors are in a rainbow?", choices: ["5", "6", "7", "8"], correctAnswer: "7" },
  { prompt: "What is the largest mammal on Earth?", choices: ["African Elephant", "Blue Whale", "Giraffe", "Hippopotamus"], correctAnswer: "Blue Whale" },
  { prompt: "Which metal is liquid at room temperature?", choices: ["Iron", "Lead", "Mercury", "Copper"], correctAnswer: "Mercury" },
  { prompt: "How many teeth does an adult human have (full set)?", choices: ["28", "30", "32", "34"], correctAnswer: "32" },
  { prompt: "What is the capital of Australia?", choices: ["Sydney", "Melbourne", "Brisbane", "Canberra"], correctAnswer: "Canberra" },
  { prompt: "Which programming language was created by Guido van Rossum?", choices: ["Java", "Ruby", "Python", "Perl"], correctAnswer: "Python" },
  { prompt: "How long does light from the Sun take to reach Earth?", choices: ["1 minute", "8 minutes", "30 minutes", "1 hour"], correctAnswer: "8 minutes" },
  { prompt: "What is the most spoken language in the world?", choices: ["English", "Spanish", "Hindi", "Mandarin Chinese"], correctAnswer: "Mandarin Chinese" },
  { prompt: "Which organ is responsible for filtering blood in humans?", choices: ["Liver", "Kidney", "Spleen", "Pancreas"], correctAnswer: "Kidney" },
  { prompt: "What is the chemical formula for table salt?", choices: ["NaCl", "KCl", "CaCl2", "MgCl2"], correctAnswer: "NaCl" },
  { prompt: "How many moons does Mars have?", choices: ["0", "1", "2", "4"], correctAnswer: "2" },
  { prompt: "Which country has the most natural lakes?", choices: ["Russia", "USA", "Finland", "Canada"], correctAnswer: "Canada" },
  { prompt: "What is the tallest mountain in the world?", choices: ["K2", "Kangchenjunga", "Everest", "Lhotse"], correctAnswer: "Everest" },
  { prompt: "In which year did World War II end?", choices: ["1943", "1944", "1945", "1946"], correctAnswer: "1945" },
  { prompt: "What is the powerhouse of the cell?", choices: ["Nucleus", "Ribosome", "Mitochondria", "Golgi Apparatus"], correctAnswer: "Mitochondria" },
  { prompt: "Which Shakespeare play features the character Juliet?", choices: ["Hamlet", "Macbeth", "Romeo and Juliet", "Othello"], correctAnswer: "Romeo and Juliet" },
  { prompt: "How many zeros are in one billion?", choices: ["6", "7", "8", "9"], correctAnswer: "9" },
  { prompt: "What is the speed of light (approximate)?", choices: ["200,000 km/s", "300,000 km/s", "400,000 km/s", "500,000 km/s"], correctAnswer: "300,000 km/s" },
  { prompt: "Which planet is closest to the Sun?", choices: ["Venus", "Earth", "Mercury", "Mars"], correctAnswer: "Mercury" },
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
  return normalizeFolderPath(set.folder || "");
}

function resolveNoteFolder(note: StudyNote) {
  return normalizeFolderPath(note.folder || "");
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
  const [savedFilter, setSavedFilter] = useState(false);
  const [librarySection, setLibrarySection] = useState<LibrarySection>("flashcards");
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [draftSet, setDraftSet] = useState<StudySet>(emptyDraftSet());
  const [saveDestinationDialog, setSaveDestinationDialog] = useState<SaveDestinationDialogState>(null);
  const [draftGuide, setDraftGuide] = useState<StudyNote>(emptyDraftGuide());
  // Card fronts to practice when entering LearnMode via the "Practice mistakes" chip
  const [learnInitialMistakeFronts, setLearnInitialMistakeFronts] = useState<string[] | null>(null);
  // Groups modal triggered from the set overview / flashcards header
  const [groupPickerSetId, setGroupPickerSetId] = useState<string | null>(null);
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
  const [triviaSessionQuestions] = useState<TriviaQuestion[]>(() => {
    const shuffled = [...HOME_TRIVIA_QUESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 10);
  });
  const [triviaIndex, setTriviaIndex] = useState(0);
  const [selectedTriviaChoice, setSelectedTriviaChoice] = useState<string | null>(null);
  const [triviaCorrectCount, setTriviaCorrectCount] = useState(0);
  const [triviaSessionDone, setTriviaSessionDone] = useState(false);
  const [libraryItemMenuOpen, setLibraryItemMenuOpen] = useState<string | null>(null);

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

  // Auto-join from invite URL (?join=CODE)
  const joinCodeFromUrl = searchParams.get("join");
  const hasAutoJoinedRef = useRef(false);
  useEffect(() => {
    if (!joinCodeFromUrl || hasAutoJoinedRef.current) return;
    if (status !== "authenticated") {
      promptGoogleSignIn();
      return;
    }
    hasAutoJoinedRef.current = true;
    setInviteCodeInput(joinCodeFromUrl.toUpperCase());
    fetch("/api/study/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: joinCodeFromUrl.toUpperCase() }),
    })
      .then((r) => r.json())
      .then((payload) => {
        if (payload.ok && payload.group) {
          const joinedGroup = payload.group as StudyGroup;
          setLibrary((current) => ({
            ...current,
            groups: [joinedGroup, ...current.groups.filter((g) => g.id !== joinedGroup.id)],
          }));
          setSelectedGroupId(joinedGroup.id);
          openStudyScreen("groups");
          showToast(`Joined "${joinedGroup.name}"!`, "reward");
        } else {
          showToast(payload.error || "Could not join that group.", "error");
        }
      })
      .catch(() => showToast("Could not join that group.", "error"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinCodeFromUrl, status]);

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

  // Scroll to a specific card in edit mode when ?card=CARDID is in the URL
  const editScrollCardId = isCreateRoute ? searchParams.get("card") : null;
  useEffect(() => {
    if (!editScrollCardId) return;
    const scroll = () => {
      const el = document.getElementById(`edit-card-${editScrollCardId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-indigo-400/60");
        setTimeout(() => el.classList.remove("ring-2", "ring-indigo-400/60"), 2500);
      }
    };
    const timer = window.setTimeout(scroll, 350);
    return () => window.clearTimeout(timer);
  }, [editScrollCardId]);

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

  const activeTriviaQuestion = triviaSessionQuestions[triviaIndex] ?? triviaSessionQuestions[0];

  useEffect(() => {
    if (!selectedTriviaChoice) return;
    const isCorrect = selectedTriviaChoice === activeTriviaQuestion?.correctAnswer;
    if (isCorrect) setTriviaCorrectCount((c) => c + 1);
    const timeout = window.setTimeout(() => {
      setSelectedTriviaChoice(null);
      const nextIndex = triviaIndex + 1;
      if (nextIndex >= triviaSessionQuestions.length) {
        setTriviaSessionDone(true);
      } else {
        setTriviaIndex(nextIndex);
      }
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [selectedTriviaChoice, activeTriviaQuestion, triviaIndex, triviaSessionQuestions.length]);

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
    if (!libraryItemMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-library-menu]")) setLibraryItemMenuOpen(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [libraryItemMenuOpen]);

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
      const matchesSaved = !savedFilter || set.saved === true;
      return matchesSearch && matchesSubject && matchesDifficulty && matchesFolder && matchesSaved;
    });
  }, [difficultyFilter, folderFilter, library.sets, savedFilter, search, subjectFilter]);

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
    showToast("Added shared set to your library as a private copy.");

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
    if (target.canEdit === false) {
      showToast("This shared set is read-only. Duplicate it to make your own copy.", "error");
      return;
    }

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

  const quickToggleSetVisibility = async (setId: string) => {
    const target = library.sets.find((set) => set.id === setId);
    if (!target) return;
    if (target.canEdit === false) {
      showToast("Only the owner can change visibility for this shared set.", "error");
      return;
    }
    const nextVisibility: StudySet["visibility"] = target.visibility === "public" ? "private" : "public";
    const nextSet = { ...target, visibility: nextVisibility, updatedAt: new Date().toISOString() };
    setLibrary((current) => ({
      ...current,
      sets: current.sets.map((set) => (set.id === setId ? nextSet : set)),
    }));
    if (nextVisibility === "public") {
      try {
        const response = await fetch("/api/study/public-sets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ set: nextSet }),
        });
        const payload = await response.json();
        if (!response.ok) {
          setLibrary((current) => ({
            ...current,
            sets: current.sets.map((set) => (set.id === setId ? { ...set, visibility: "private" } : set)),
          }));
          showToast(payload.error || "Could not make this set public.", "error");
        } else {
          showToast("Set is now public — anyone can find it by searching.");
        }
      } catch {
        setLibrary((current) => ({
          ...current,
          sets: current.sets.map((set) => (set.id === setId ? { ...set, visibility: "private" } : set)),
        }));
        showToast("Could not publish this set.", "error");
      }
    } else {
      try {
        await fetch("/api/study/public-sets", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ setId }),
        });
      } catch {}
      showToast("Set is now private — only you can see it.");
    }
  };

  const toggleSaveSet = (setId: string) => {
    let nextSet: StudySet | null = null;
    setLibrary((current) => {
      const sets = current.sets.map((set) => {
        if (set.id !== setId) return set;
        nextSet = { ...set, saved: !set.saved, updatedAt: new Date().toISOString() };
        return nextSet;
      });
      return { ...current, sets };
    });
    if (!nextSet) return;
    const isSaved = (nextSet as StudySet).saved;
    showToast(isSaved ? "Set saved to your library." : "Set removed from saved.");
    if (isSignedIn) {
      fetch("/api/study/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set: nextSet }),
      }).catch(() => undefined);
    }
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

  const renameGroup = (groupId: string) => {
    const target = library.groups.find((g) => g.id === groupId);
    if (!target) return;
    const nextName = window.prompt("Rename group", target.name);
    if (!nextName || !nextName.trim() || nextName.trim() === target.name) return;
    setLibrary((current) => ({
      ...current,
      groups: current.groups.map((g) => g.id === groupId ? { ...g, name: nextName.trim() } : g),
    }));
    showToast("Group renamed.");
  };

  const renameNote = (noteId: string) => {
    const target = library.notes.find((n) => n.id === noteId);
    if (!target) return;
    const nextTitle = window.prompt("Rename note", target.title);
    if (!nextTitle || !nextTitle.trim() || nextTitle.trim() === target.title) return;
    setLibrary((current) => ({
      ...current,
      notes: current.notes.map((n) => n.id === noteId ? { ...n, title: nextTitle.trim(), updatedAt: new Date().toISOString() } : n),
    }));
    showToast("Note renamed.");
  };

  const deleteNote = (noteId: string) => {
    const target = library.notes.find((n) => n.id === noteId);
    if (!target) return;
    if (!window.confirm(`Delete "${target.title}"? This cannot be undone.`)) return;
    setLibrary((current) => ({
      ...current,
      notes: current.notes.filter((n) => n.id !== noteId),
    }));
    showToast("Note deleted.");
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

  const removeSetFromGroup = async (groupId: string, setId: string) => {
    try {
      const response = await fetch(`/api/study/groups/${encodeURIComponent(groupId)}/sets`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to remove set.");
      const updatedGroup = payload.group as StudyGroup;
      setLibrary((current) => ({
        ...current,
        groups: current.groups.map((group) => (group.id === groupId ? updatedGroup : group)),
      }));
    } catch {
      // Optimistic fallback
      setLibrary((current) => ({
        ...current,
        groups: current.groups.map((g) =>
          g.id === groupId ? { ...g, setIds: g.setIds.filter((id) => id !== setId) } : g,
        ),
      }));
    }
    showToast("Set removed from group.");
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
        onToggleSaved={() => toggleSaveSet(selectedSet.id)}
        onGroupsClick={() => setGroupPickerSetId(selectedSet.id)}
        onSessionSave={saveSession}
        onCelebrate={(message) => showToast(message, "reward")}
      />
    ) : selectedSet && screen === "learn" ? (
      <LearnMode
        set={selectedSet}
        initialPracticeCardFronts={learnInitialMistakeFronts}
        onBack={() => { setLearnInitialMistakeFronts(null); openStudyScreen("overview", selectedSet.id); }}
        onProgress={(cardId, result) => updateCardProgress(selectedSet.id, cardId, (current) => updateProgressForReview(current, result))}
        onSessionSave={saveSession}
        onCelebrate={(message) => showToast(message, "reward")}
      />
    ) : selectedSet && screen === "test" ? (
      <AssessmentMode
        title="Test"
        set={selectedSet}
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
        <div className="mx-auto max-w-310 px-1 pb-14 pt-3 sm:px-2">
          <div className="study-appear mb-8 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-[2rem] font-bold tracking-[-0.04em] text-white">
                {isGuideCreateRoute ? "Create a new study guide" : "Create a new flashcard set"}
              </h1>
            </div>
            <button
              onClick={() => router.push("/study")}
              {...magneticHoverProps}
              className="study-premium-button inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-200"
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
        <div className="mx-auto max-w-280 px-4 pb-14 pt-5 sm:px-6">
          <div className="study-appear mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={() => router.push("/study?view=library")}
              {...magneticHoverProps}
              className="study-premium-button inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-100"
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
                  if (selectedSet.canEdit === false) {
                    duplicateSet(selectedSet);
                    return;
                  }
                  router.push(`/study/create?edit=${encodeURIComponent(selectedSet.id)}`);
                }}
                onToggleVisibility={() => quickToggleSetVisibility(selectedSet.id)}
                onToggleFlag={(cardId, patch) =>
                  updateCardProgress(selectedSet.id, cardId, (current) => ({ ...current, ...patch }))
                }
                onToggleSaved={() => toggleSaveSet(selectedSet.id)}
                onPracticeMistakes={(cardFronts) => {
                  setLearnInitialMistakeFronts(cardFronts);
                  openStudyScreen("learn", selectedSet.id);
                }}
                onGroupsClick={() => setGroupPickerSetId(selectedSet.id)}
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
      <div className="mx-auto max-w-7xl px-1 pb-16 pt-3 sm:px-2">
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
                onRenameGroup={renameGroup}
                onRemoveSetFromGroup={removeSetFromGroup}
                onOpenAddSetPicker={setGroupSetPickerGroupId}
              />
            ) : (
            <>
            {libraryView ? (
              <section className="study-appear">
                <div className="flex flex-col gap-4">
                  {/* Header */}
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Study hub</p>
                      <h1 className="mt-1 text-2xl font-bold tracking-[-0.03em] text-white">Your library</h1>
                    </div>
                    {/* Search */}
                    <div className="relative hidden sm:block">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={librarySearchPlaceholder}
                        className="h-9 w-55 rounded-lg border border-white/8 bg-white/4 pl-9 pr-4 text-[13px] text-white outline-none placeholder:text-slate-600 focus:border-white/14 focus:bg-white/6"
                      />
                    </div>
                  </div>

                  {/* Tabs + filter row */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Section tabs */}
                    <div className="flex items-center gap-0.5 rounded-lg border border-white/7 bg-white/3 p-0.5">
                      {(["flashcards", "notes", "groups", "guides"] as const).map((section) => {
                        const label = { flashcards: "Sets", notes: "Notes", groups: "Groups", guides: "Guides" }[section];
                        const counts = {
                          flashcards: setList.length,
                          notes: matchingNotes.length,
                          groups: matchingGroups.length,
                          guides: matchingGuides.length,
                        }[section];
                        const active = librarySection === section;
                        return (
                          <button
                            key={section}
                            onClick={() => setLibrarySection(section)}
                            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                              active ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            {label}
                            {counts > 0 && (
                              <span className={`text-[10px] tabular-nums ${active ? "text-slate-400" : "text-slate-600"}`}>{counts}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Flashcard-specific filters */}
                    {librarySection === "flashcards" && setList.length > 0 && (
                      <>
                        <select
                          value={difficultyFilter}
                          onChange={(event) => setDifficultyFilter(event.target.value)}
                          className="h-8 rounded-lg border border-white/8 bg-white/4 px-2.5 text-[13px] text-slate-300 outline-none"
                        >
                          <option value="all">Any difficulty</option>
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                        <button
                          onClick={() => setSavedFilter((prev) => !prev)}
                          className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-medium transition ${
                            savedFilter
                              ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300"
                              : "border-white/8 bg-white/4 text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          <Bookmark className={`h-3 w-3 ${savedFilter ? "fill-current" : ""}`} />
                          Saved
                        </button>
                      </>
                    )}

                    {/* Mobile search */}
                    <div className="relative sm:hidden">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={librarySearchPlaceholder}
                        className="h-8 w-full rounded-lg border border-white/8 bg-white/4 pl-9 pr-3 text-[13px] text-white outline-none placeholder:text-slate-600"
                      />
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
            {folderFilter ? (
              <section className="mx-auto max-w-215 space-y-6 pb-24">
                {/* Folder header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
                      <Folder className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold tracking-[-0.02em] text-white">{folderLabelFromPath(folderFilter)}</h2>
                      <p className="text-[11px] text-slate-500">{folderSetPreview.length} set{folderSetPreview.length !== 1 ? "s" : ""} · {folderNotePreview.length} note{folderNotePreview.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="relative flex items-center gap-2">
                    {/* Inline search */}
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search folder"
                        className="h-8 w-45 rounded-lg border border-white/8 bg-white/4 pl-9 pr-3 text-[13px] text-white outline-none placeholder:text-slate-600 focus:border-white/14"
                      />
                    </div>
                    {/* Folder actions */}
                    <button
                      onClick={() => setFolderActionsOpen((current) => !current)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/4 text-slate-400 transition hover:bg-white/8 hover:text-white"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {folderActionsOpen ? (
                      <div className="absolute right-0 top-10 z-20 w-50 rounded-xl border border-white/10 bg-[#0f1520] py-1 shadow-[0_20px_40px_rgba(0,0,0,0.5)]">
                        <button onClick={() => renameCurrentFolder(folderFilter)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-slate-300 transition hover:bg-white/6 hover:text-white">
                          <Pencil className="h-3.5 w-3.5 text-slate-500" /> Rename
                        </button>
                        <button onClick={() => createSubfolder(folderFilter)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-slate-300 transition hover:bg-white/6 hover:text-white">
                          <FolderPlus className="h-3.5 w-3.5 text-slate-500" /> New subfolder
                        </button>
                        <button onClick={() => { setFolderLibraryPickerOpen(true); setFolderActionsOpen(false); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-slate-300 transition hover:bg-white/6 hover:text-white">
                          <BookOpen className="h-3.5 w-3.5 text-slate-500" /> Add from library
                        </button>
                        <div className="my-1 h-px bg-white/6" />
                        <button onClick={() => deleteCurrentFolder(folderFilter)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-rose-400 transition hover:bg-rose-500/8">
                          <Trash2 className="h-3.5 w-3.5" /> Delete folder
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Subfolders */}
                {childFolders.length > 0 && (
                  <div>
                    <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Subfolders</p>
                    <div className="flex flex-wrap gap-2">
                      {childFolders.map((folder) => (
                        <button
                          key={folder}
                          onClick={() => router.push(`/study?folder=${encodeURIComponent(folder)}`)}
                          className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5 text-left transition hover:border-white/14 hover:bg-white/7"
                        >
                          <Folder className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                          <span className="text-[13px] font-medium text-white">{folderLabelFromPath(folder)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sets in folder */}
                <div>
                  <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Sets</p>
                  {folderSetPreview.length ? (
                    <div className="space-y-1.5">
                      {folderSetPreview.map((set) => {
                        const prog = library.progress[set.id] ?? {};
                        const seenCount = set.cards.filter((c) => (prog[c.id]?.timesSeen ?? 0) > 0).length;
                        const masteryPct = set.cards.length > 0 ? Math.round((seenCount / set.cards.length) * 100) : 0;
                        return (
                          <button
                            key={set.id}
                            onClick={() => { setSelectedSetId(set.id); openStudyScreen("overview", set.id); }}
                            className="atlas-lib-row group"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                              <BookOpen className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1 text-left">
                              <p className="truncate text-[13px] font-semibold text-white">{set.title}</p>
                              <p className="text-[11px] text-slate-500">{set.cards.length} cards{set.course ? ` · ${set.course}` : ""}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="hidden items-center gap-1.5 sm:flex">
                                <div className="h-1 w-16 overflow-hidden rounded-full bg-white/8">
                                  <div className="h-full rounded-full bg-indigo-400/70" style={{ width: `${masteryPct}%` }} />
                                </div>
                                <span className="text-[11px] tabular-nums text-slate-500">{masteryPct}%</span>
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 text-slate-600 opacity-0 transition group-hover:opacity-100" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/8 px-4 py-5 text-[13px] text-slate-600">
                      No sets in this folder yet.
                    </div>
                  )}
                </div>

                {/* Notes in folder */}
                {folderNotePreview.length > 0 && (
                  <div>
                    <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Notes</p>
                    <div className="space-y-1.5">
                      {folderNotePreview.map((note) => (
                        <button
                          key={note.id}
                          onClick={() => router.push(`/study?mode=notes&note=${encodeURIComponent(note.id)}`)}
                          className="atlas-lib-row group"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
                            <FileText className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1 text-left">
                            <p className="truncate text-[13px] font-semibold text-white">{note.title || "Untitled note"}</p>
                            <p className="text-[11px] text-slate-500">{note.course || note.subject || "Note"}</p>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-slate-600 opacity-0 transition group-hover:opacity-100" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Floating dock */}
                <div className="fixed bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-white/10 bg-[#080d18]/95 px-2 py-2 shadow-[0_20px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl">
                  <button
                    onClick={() => router.push(`/study/create?type=flashcards&folder=${encodeURIComponent(folderFilter)}`)}
                    className="atlas-continue-btn rounded-xl"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add set
                  </button>
                  <button
                    onClick={() => router.push(`/study?mode=notes`)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-semibold text-slate-300 transition hover:bg-white/8 hover:text-white"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    New note
                  </button>
                  <button
                    onClick={() => router.push(`/study/create?type=guide`)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10 text-violet-400 transition hover:bg-violet-500/15"
                  >
                    <Sparkles className="h-4 w-4" />
                  </button>
                </div>
              </section>
            ) : (
            <section className={`${libraryView ? "space-y-6" : "mx-auto max-w-230 space-y-6"}`}>

              {/* ─── HOME VIEW: Flashcards, not in library mode ─── */}
              {librarySection === "flashcards" && !libraryView ? (
                <>
                  {/* ── COMMAND HERO ─────────────────────────────────── */}
                  {selectedSet ? (
                    <div className="study-appear atlas-command-hero relative overflow-hidden rounded-2xl">
                      {/* ambient glow */}
                      <div className="pointer-events-none absolute -top-20 left-1/3 h-56 w-56 rounded-full bg-indigo-500/8 blur-3xl" />
                      <div className="relative flex items-center gap-5 p-5 sm:gap-6 sm:p-6">
                        {/* Mastery ring */}
                        <div className="relative shrink-0">
                          <svg width="88" height="88" viewBox="0 0 120 120" className="-rotate-90">
                            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(30,41,59,0.8)" strokeWidth="8" />
                            <circle
                              cx="60" cy="60" r="52"
                              fill="none"
                              stroke="url(#heroRingGrad)"
                              strokeWidth="8"
                              strokeLinecap="round"
                              strokeDasharray="326.7"
                              strokeDashoffset={326.7 - (326.7 * Math.max(3, dashboard.averageAccuracy)) / 100}
                              className="atlas-ring-fill"
                            />
                            <defs>
                              <linearGradient id="heroRingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#818cf8" />
                                <stop offset="100%" stopColor="#a78bfa" />
                              </linearGradient>
                            </defs>
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-[17px] font-bold tabular-nums leading-none text-white">{dashboard.averageAccuracy}%</span>
                            <span className="mt-0.5 text-[8.5px] font-semibold uppercase tracking-widest text-slate-500">mastery</span>
                          </div>
                        </div>
                        {/* Set info + primary CTA */}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Continue studying</p>
                          <h2 className="mt-1.5 line-clamp-2 text-[1.55rem] font-bold leading-[1.12] tracking-[-0.03em] text-white">
                            {selectedSet.title}
                          </h2>
                          <p className="mt-1 text-[12px] text-slate-400">
                            {selectedSet.cards.length} cards{selectedSet.course ? ` · ${selectedSet.course}` : ""}
                          </p>
                          <div className="mt-3.5 flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => { openSurface("flashcards"); openStudyScreen("flashcards", selectedSet.id); }}
                              className="atlas-continue-btn"
                            >
                              Continue
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => { openSurface("flashcards"); openStudyScreen("learn", selectedSet.id); }} className="atlas-mode-pill">Learn</button>
                            <button onClick={() => { openSurface("flashcards"); openStudyScreen("test", selectedSet.id); }} className="atlas-mode-pill">Test</button>
                            <button onClick={() => { openSurface("flashcards"); openStudyScreen("match", selectedSet.id); }} className="atlas-mode-pill">Match</button>
                          </div>
                        </div>
                      </div>
                      {/* Session pulse strip */}
                      {(dashboard.cardsReviewed > 0 || dashboard.activeToday > 0) && (
                        <div className="flex items-center gap-1 border-t border-white/5.5 px-5 py-2.5 sm:px-6">
                          <div className="atlas-stat-pill">
                            <Flame className="h-3 w-3 text-amber-400" />
                            <span>{dashboard.cardsReviewed} reviewed</span>
                          </div>
                          <div className="mx-2.5 h-3 w-px bg-white/10" />
                          <div className="atlas-stat-pill">
                            <Clock3 className="h-3 w-3 text-sky-400" />
                            <span>{dashboard.totalStudyTimeMinutes > 0 ? `${dashboard.totalStudyTimeMinutes}m studied` : "Just started"}</span>
                          </div>
                          {dashboard.averageAccuracy > 0 && (
                            <>
                              <div className="mx-2.5 h-3 w-px bg-white/10" />
                              <div className="atlas-stat-pill">
                                <Target className="h-3 w-3 text-emerald-400" />
                                <span>{dashboard.averageAccuracy}% accuracy</span>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="study-appear atlas-command-hero rounded-2xl p-8">
                      <div className="mx-auto max-w-sm text-center">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15">
                          <BookOpen className="h-6 w-6 text-indigo-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white">Build your first study set</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          Create flashcards from scratch or paste your notes — AI does the heavy lifting.
                        </p>
                        <button
                          onClick={() => router.push("/study/create?type=flashcards")}
                          className="atlas-continue-btn mx-auto mt-5"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Create set
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── SET RAIL ─────────────────────────────────────── */}
                  <div data-tour="study-home-recents">
                    {setList.length > 0 ? (
                      <>
                        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {globalQuery ? "Search results" : "Your sets"}
                        </p>
                        <div className="hide-scroll -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
                          {setList.slice(0, 8).map((set) => {
                            const prog = library.progress[set.id] ?? {};
                            const seenCount = set.cards.filter((c) => (prog[c.id]?.timesSeen ?? 0) > 0).length;
                            const masteryPct = set.cards.length > 0 ? Math.round((seenCount / set.cards.length) * 100) : 0;
                            const masteryColor = masteryPct >= 70 ? "bg-emerald-400" : masteryPct >= 40 ? "bg-amber-400" : "bg-rose-400/70";
                            const isActive = set.id === selectedSet?.id;
                            return (
                              <button
                                key={set.id}
                                onClick={() => { setSelectedSetId(set.id); openStudyScreen("overview", set.id); }}
                                className={`atlas-set-rail-card${isActive ? " atlas-set-rail-card--active" : ""}`}
                              >
                                <div className={`mb-2.5 h-0.5 w-full rounded-full ${masteryColor}`} />
                                <p className="line-clamp-2 text-[13px] font-semibold leading-tight text-white">{set.title}</p>
                                <p className="mt-1.5 text-[11px] text-slate-500">{set.cards.length} cards · {masteryPct}%</p>
                              </button>
                            );
                          })}
                          <button
                            onClick={() => router.push("/study/create?type=flashcards")}
                            className="atlas-set-rail-new"
                          >
                            <Plus className="h-4 w-4 text-slate-600" />
                            <p className="mt-2 text-[11px] font-medium text-slate-600">New set</p>
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>

                  {/* ── SEARCH: matching notes ────────────────────────── */}
                  {globalQuery ? (
                    <div>
                      <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Matching notes</div>
                      <div className="grid gap-2.5 md:grid-cols-2">
                        {matchingNotes.length ? (
                          matchingNotes.slice(0, 6).map((note) => (
                            <button
                              key={note.id}
                              onClick={() => router.push(`/study?mode=notes&note=${encodeURIComponent(note.id)}`)}
                              className="block w-full rounded-xl border border-white/7 bg-white/4 px-4 py-3.5 text-left transition hover:bg-white/7"
                            >
                              <div className="text-[11px] text-slate-500">{note.course || note.subject || "Note"}</div>
                              <div className="mt-0.5 text-sm font-semibold text-white">{note.title}</div>
                              <div className="mt-1 line-clamp-1 text-[12px] text-slate-400">{note.rawContent || note.transcriptContent || "Open note"}</div>
                            </button>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">No notes matched.</div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* ── QUICK-FIRE TRIVIA ─────────────────────────────── */}
                  <div>
                    <div className="mb-2.5 flex items-center gap-2">
                      <div className="flex h-4.5 w-4.5 items-center justify-center rounded-[5px] bg-amber-500/18">
                        <Brain className="h-2.5 w-2.5 text-amber-400" />
                      </div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Quick-fire</p>
                      <div className="ml-auto flex items-center gap-1">
                        {triviaSessionQuestions.map((_, i) => (
                          <span
                            key={i}
                            className={`h-0.75 w-4 rounded-full transition-all duration-300 ${
                              i < triviaIndex ? "bg-amber-400" : i === triviaIndex ? "bg-white/35" : "bg-white/8"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="atlas-quickfire-card">
                      {triviaSessionDone ? (
                        <div className="flex flex-col items-center gap-3 py-3 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
                            <Trophy className="h-5 w-5 text-amber-400" />
                          </div>
                          <p className="text-sm font-bold text-white">
                            {triviaCorrectCount}/{triviaSessionQuestions.length} correct
                          </p>
                          <button
                            onClick={() => {
                              setTriviaIndex(0);
                              setTriviaCorrectCount(0);
                              setTriviaSessionDone(false);
                              setSelectedTriviaChoice(null);
                            }}
                            className="atlas-mode-pill mt-0.5"
                          >
                            <RotateCcw className="h-3 w-3" />
                            New round
                          </button>
                        </div>
                      ) : activeTriviaQuestion ? (
                        <>
                          <p className="text-sm font-semibold leading-snug text-white">{activeTriviaQuestion.prompt}</p>
                          <div className="mt-3.5 grid grid-cols-2 gap-2">
                            {activeTriviaQuestion.choices.map((choice) => {
                              const isSelected = selectedTriviaChoice === choice;
                              const isCorrect = choice === activeTriviaQuestion.correctAnswer;
                              const revealed = selectedTriviaChoice !== null;
                              let choiceCls = "border-white/8 bg-white/3 text-slate-300 hover:border-indigo-500/35 hover:bg-indigo-500/6";
                              if (revealed && isCorrect) choiceCls = "border-emerald-500/40 bg-emerald-500/8 text-emerald-300";
                              else if (revealed && isSelected && !isCorrect) choiceCls = "border-rose-500/35 bg-rose-500/7 text-rose-300";
                              return (
                                <button
                                  key={choice}
                                  disabled={revealed}
                                  onClick={() => setSelectedTriviaChoice(choice)}
                                  className={`atlas-trivia-choice ${choiceCls}`}
                                >
                                  {choice}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {/* ── ACTION STRIP ──────────────────────────────────── */}
                  <div className="flex gap-3" data-tour="study-home-modes">
                    <button
                      onClick={() => router.push("/study/create?type=flashcards")}
                      className="atlas-action-strip-btn flex-1"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                        <Layers3 className="h-4.25 w-4.25" />
                      </div>
                      <div className="text-left">
                        <p className="text-[13px] font-semibold text-white">Create flashcards</p>
                        <p className="text-[11px] text-slate-500">From scratch or with AI</p>
                      </div>
                    </button>
                    <button
                      onClick={() => router.push("/study/create?type=guide")}
                      className="atlas-action-strip-btn flex-1"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
                        <WandSparkles className="h-4.25 w-4.25" />
                      </div>
                      <div className="text-left">
                        <p className="text-[13px] font-semibold text-white">AI study guide</p>
                        <p className="text-[11px] text-slate-500">Paste notes, get a guide</p>
                      </div>
                    </button>
                  </div>
                </>
              ) : null}

              {/* ─── LIBRARY: Flashcard sets ─── */}
              {librarySection === "flashcards" && libraryView ? (
                <div className="space-y-6">
                  {setList.length ? (
                    groupSetsByPeriod(setList).map((group) => (
                      <div key={group.label}>
                        <div className="mb-2 flex items-center gap-3">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{group.label}</span>
                          <div className="h-px flex-1 bg-white/6" />
                        </div>
                        <div className="space-y-1">
                          {group.items.map((set) => {
                            const prog = library.progress[set.id] ?? {};
                            const seenCount = set.cards.filter((c) => (prog[c.id]?.timesSeen ?? 0) > 0).length;
                            const masteryPct = set.cards.length > 0 ? Math.round((seenCount / set.cards.length) * 100) : 0;
                            return (
                              <div key={set.id} className="atlas-lib-row group">
                                <button
                                  onClick={() => { setSelectedSetId(set.id); openStudyScreen("overview", set.id); }}
                                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                >
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                                    <BookOpen className="h-3.5 w-3.5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <p className="truncate text-[13px] font-semibold text-white">{set.title}</p>
                                      <VisibilityBadge visibility={set.visibility} compact />
                                    </div>
                                    <p className="text-[11px] text-slate-500">{set.cards.length} cards{set.course ? ` · ${set.course}` : ""}</p>
                                  </div>
                                </button>
                                <div className="flex items-center gap-3">
                                  <div className="hidden items-center gap-1.5 sm:flex">
                                    <div className="h-1 w-14 overflow-hidden rounded-full bg-white/8">
                                      <div className="h-full rounded-full bg-indigo-400/70" style={{ width: `${masteryPct}%` }} />
                                    </div>
                                    <span className="w-7 text-right text-[11px] tabular-nums text-slate-500">{masteryPct}%</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setMoveLibraryItem({ type: "set", id: set.id, title: set.title })}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/7 bg-white/3 text-slate-500 opacity-0 transition hover:bg-white/8 hover:text-slate-300 group-hover:opacity-100"
                                    aria-label={`Move ${set.title}`}
                                  >
                                    <Folder className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="atlas-lib-empty">
                      <BookOpen className="h-6 w-6 text-slate-600" />
                      <p>No flashcard sets yet.</p>
                      <button onClick={() => router.push("/study/create?type=flashcards")} className="atlas-continue-btn mt-1">
                        <Plus className="h-3.5 w-3.5" /> Create set
                      </button>
                    </div>
                  )}
                </div>
              ) : null}

              {/* ─── LIBRARY: Notes ─── */}
              {librarySection === "notes" ? (
                <div className="space-y-1">
                  {matchingNotes.length ? (
                    matchingNotes.slice(0, 12).map((note) => (
                      <div key={note.id} className="atlas-lib-row group">
                        <button
                          onClick={() => router.push(`/study?mode=notes&note=${encodeURIComponent(note.id)}`)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
                            <FileText className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-white">{note.title || "Untitled note"}</p>
                            <p className="truncate text-[11px] text-slate-500">{[note.course || note.subject, note.rawContent?.slice(0, 60)].filter(Boolean).join(" · ") || "Empty"}</p>
                          </div>
                        </button>
                        <div className="relative shrink-0" data-library-menu>
                          <button
                            type="button"
                            onClick={() => setLibraryItemMenuOpen(libraryItemMenuOpen === note.id ? null : note.id)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/7 bg-white/3 text-slate-500 opacity-0 transition hover:bg-white/8 hover:text-slate-300 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                          {libraryItemMenuOpen === note.id && (
                            <div className="absolute right-0 top-9 z-40 w-44 rounded-xl border border-white/10 bg-[#0f1520] py-1 shadow-2xl">
                              <button onClick={() => { setLibraryItemMenuOpen(null); renameNote(note.id); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-slate-300 hover:bg-white/6 hover:text-white">
                                <Pencil className="h-3.5 w-3.5 text-slate-500" /> Rename
                              </button>
                              <button onClick={() => { setLibraryItemMenuOpen(null); setMoveLibraryItem({ type: "note", id: note.id, title: note.title }); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-slate-300 hover:bg-white/6 hover:text-white">
                                <FolderPlus className="h-3.5 w-3.5 text-slate-500" /> Move to folder
                              </button>
                              <div className="my-1 h-px bg-white/6" />
                              <button onClick={() => { setLibraryItemMenuOpen(null); deleteNote(note.id); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-rose-400 hover:bg-rose-500/8">
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="atlas-lib-empty">
                      <FileText className="h-6 w-6 text-slate-600" />
                      <p>No notes yet.</p>
                      <button onClick={() => router.push("/study?mode=notes")} className="atlas-continue-btn mt-1">
                        <Plus className="h-3.5 w-3.5" /> New note
                      </button>
                    </div>
                  )}
                </div>
              ) : null}

              {/* ─── LIBRARY: Groups ─── */}
              {librarySection === "groups" ? (
                <div className="space-y-1">
                  {matchingGroups.length ? (
                    matchingGroups.slice(0, 12).map((group) => (
                      <div key={group.id} className="atlas-lib-row group">
                        <button
                          onClick={() => { setSelectedGroupId(group.id); openStudyScreen("groups"); }}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
                            <Users className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-white">{group.name}</p>
                            <p className="text-[11px] text-slate-500">{group.memberNames.length} member{group.memberNames.length !== 1 ? "s" : ""} · {group.setIds.length} set{group.setIds.length !== 1 ? "s" : ""}{group.course ? ` · ${group.course}` : ""}</p>
                          </div>
                        </button>
                        <div className="relative shrink-0" data-library-menu>
                          <button
                            type="button"
                            onClick={() => setLibraryItemMenuOpen(libraryItemMenuOpen === `group-${group.id}` ? null : `group-${group.id}`)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/7 bg-white/3 text-slate-500 opacity-0 transition hover:bg-white/8 hover:text-slate-300 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                          {libraryItemMenuOpen === `group-${group.id}` && (
                            <div className="absolute right-0 top-9 z-40 w-40 rounded-xl border border-white/10 bg-[#0f1520] py-1 shadow-2xl">
                              <button onClick={() => { setLibraryItemMenuOpen(null); renameGroup(group.id); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-slate-300 hover:bg-white/6 hover:text-white">
                                <Pencil className="h-3.5 w-3.5 text-slate-500" /> Rename
                              </button>
                              <div className="my-1 h-px bg-white/6" />
                              <button onClick={() => { setLibraryItemMenuOpen(null); void deleteGroup(group.id); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-rose-400 hover:bg-rose-500/8">
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="atlas-lib-empty">
                      <Users className="h-6 w-6 text-slate-600" />
                      <p>No study groups yet.</p>
                      <button onClick={() => openStudyScreen("groups")} className="atlas-continue-btn mt-1">
                        <Plus className="h-3.5 w-3.5" /> Create group
                      </button>
                    </div>
                  )}
                </div>
              ) : null}

              {/* ─── LIBRARY: Guides ─── */}
              {librarySection === "guides" ? (
                <div className="space-y-1">
                  {matchingGuides.length ? (
                    matchingGuides.slice(0, 12).map((guide) => (
                      <div key={guide.id} className="atlas-lib-row group">
                        <button
                          onClick={() => router.push(`/study?mode=notes&note=${encodeURIComponent(guide.id)}`)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                            <Sparkles className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-white">{guide.title}</p>
                            <p className="truncate text-[11px] text-slate-500">{[guide.course || guide.subject, guide.structuredContent?.summary?.slice(0, 60)].filter(Boolean).join(" · ") || "AI study guide"}</p>
                          </div>
                        </button>
                        <div className="relative shrink-0" data-library-menu>
                          <button
                            type="button"
                            onClick={() => setLibraryItemMenuOpen(libraryItemMenuOpen === `guide-${guide.id}` ? null : `guide-${guide.id}`)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/7 bg-white/3 text-slate-500 opacity-0 transition hover:bg-white/8 hover:text-slate-300 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                          {libraryItemMenuOpen === `guide-${guide.id}` && (
                            <div className="absolute right-0 top-9 z-40 w-40 rounded-xl border border-white/10 bg-[#0f1520] py-1 shadow-2xl">
                              <button onClick={() => { setLibraryItemMenuOpen(null); renameNote(guide.id); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-slate-300 hover:bg-white/6 hover:text-white">
                                <Pencil className="h-3.5 w-3.5 text-slate-500" /> Rename
                              </button>
                              <div className="my-1 h-px bg-white/6" />
                              <button onClick={() => { setLibraryItemMenuOpen(null); deleteNote(guide.id); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-rose-400 hover:bg-rose-500/8">
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="atlas-lib-empty">
                      <Sparkles className="h-6 w-6 text-slate-600" />
                      <p>No study guides yet.</p>
                      <button onClick={() => router.push("/study/create?type=guide")} className="atlas-continue-btn mt-1">
                        <Plus className="h-3.5 w-3.5" /> Create guide
                      </button>
                    </div>
                  )}
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
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition hover:text-slate-200"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Home
              </button>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Notes</p>
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
            <div className="mx-auto max-w-345">
              {focusedModeContent}
            </div>
          </div>
        ) : (
          <>
        {!isFocusedStudyMode && <div className="study-appear mb-4">
          <button
            onClick={goToStudyHome}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition hover:text-slate-200"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Home
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
                onRenameGroup={renameGroup}
                onRemoveSetFromGroup={removeSetFromGroup}
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
                  if (selectedSet.canEdit === false) {
                    duplicateSet(selectedSet);
                    return;
                  }
                  router.push(`/study/create?edit=${encodeURIComponent(selectedSet.id)}`);
                }}
                onToggleVisibility={() => quickToggleSetVisibility(selectedSet.id)}
                onToggleFlag={(cardId, patch) =>
                  updateCardProgress(selectedSet.id, cardId, (current) => ({ ...current, ...patch }))
                }
                onToggleSaved={() => toggleSaveSet(selectedSet.id)}
                onPracticeMistakes={(cardFronts) => {
                  setLearnInitialMistakeFronts(cardFronts);
                  openStudyScreen("learn", selectedSet.id);
                }}
                onGroupsClick={() => setGroupPickerSetId(selectedSet.id)}
              />
            )}

          </section>

          {!isFocusedStudyMode && <aside className="order-2 space-y-3 lg:sticky lg:top-24">
            {/* Set finder */}
            <div className="study-appear atlas-panel rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Find sets</span>
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Course, title, tags…"
                className="study-premium-input mt-3 w-full rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
              />
              <div className="mt-2 grid gap-2">
                <select
                  value={subjectFilter}
                  onChange={(event) => setSubjectFilter(event.target.value)}
                  className="study-premium-input rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 text-sm text-slate-300 outline-none"
                >
                  <option value="all">All subjects</option>
                  {subjects.map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
                <select
                  value={difficultyFilter}
                  onChange={(event) => setDifficultyFilter(event.target.value)}
                  className="study-premium-input rounded-xl border border-white/8 bg-white/4 px-3 py-2.5 text-sm text-slate-300 outline-none"
                >
                  <option value="all">All difficulty</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div className="mt-4 border-t border-white/6 pt-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Library</div>
              </div>
              <div className="mt-2 space-y-1">
                {setList.slice(0, 6).map((set) => (
                  <div
                    key={set.id}
                    className={`rounded-xl border px-3 py-2.5 transition ${
                      selectedSetId === set.id
                        ? "border-indigo-500/30 bg-indigo-500/8"
                        : "border-white/6 bg-white/3 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => { setSelectedSetId(set.id); openStudyScreen("overview", set.id); }}
                        {...magneticHoverProps}
                        className="study-premium-button min-w-0 flex-1 text-left"
                      >
                        <div className="truncate text-sm font-medium text-white">{set.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                          <span>{set.course || set.subject} · {set.cards.length} cards</span>
                          <VisibilityBadge visibility={set.visibility} compact />
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSet(set.id)}
                        {...magneticHoverProps}
                        aria-label={`Delete ${set.title}`}
                        className="study-premium-button shrink-0 rounded-lg border border-rose-500/20 bg-rose-500/8 p-1.5 text-rose-400 hover:bg-rose-500/15"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Public sets */}
            {search.trim().length >= 2 && (
              <div className="study-appear atlas-panel rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Shared sets</div>
                  <div className="text-[11px] text-slate-600">{publicSearchResults.length} found</div>
                </div>
                <div className="mt-3 space-y-2">
                  {publicSearchResults.length ? (
                    publicSearchResults.slice(0, 5).map((set) => {
                      const alreadyAdded = library.sets.some((entry) => entry.title === set.title && entry.course === set.course);
                      return (
                        <div key={set.id} className="atlas-set-card rounded-xl p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="truncate text-sm font-medium text-white">{set.title}</div>
                                <VisibilityBadge visibility={set.visibility} compact />
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                {[set.course || set.subject, `${set.cards.length} cards`].filter(Boolean).join(" · ")}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => addPublicSetToLibrary(set)}
                              {...magneticHoverProps}
                              className={`study-premium-button shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                                alreadyAdded
                                  ? "border border-white/8 bg-white/4 text-slate-400"
                                  : "border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/18"
                              }`}
                            >
                              {alreadyAdded ? "Added" : "Add"}
                            </button>
                          </div>
                          {set.description ? (
                            <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-slate-500">{set.description}</p>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-700/40 px-4 py-4 text-sm text-slate-600">
                      No shared sets matched yet.
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
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-16 backdrop-blur-[2px]">
          <div className="w-full max-w-170 rounded-[1.6rem] border border-white/10 bg-[#0f1520] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[1.7rem] font-bold tracking-[-0.04em] text-white">Add from library</div>
                <div className="mt-2 text-sm leading-6 text-zinc-400">
                  Add flashcard sets or notes from your library into {folderLabelFromPath(folderFilter)}.
                </div>
              </div>
              <button
                onClick={() => setFolderLibraryPickerOpen(false)}
                className="rounded-full p-2 text-zinc-400 transition hover:bg-white/6 hover:text-white"
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
                      className="flex w-full items-start justify-between rounded-xl border border-white/10 bg-white/4 px-4 py-4 text-left transition hover:bg-white/8"
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
                      className="flex w-full items-start justify-between rounded-xl border border-white/10 bg-white/4 px-4 py-4 text-left transition hover:bg-white/8"
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
                <div className="rounded-xl border border-dashed border-white/12 bg-white/3 px-5 py-6 text-sm text-zinc-400">
                  Nothing in your library yet.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {moveLibraryItem ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-16 backdrop-blur-[2px]">
          <div className="w-full max-w-140 rounded-[1.6rem] border border-white/10 bg-[#0f1520] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[1.7rem] font-bold tracking-[-0.04em] text-white">Move to folder</div>
                <div className="mt-2 text-sm leading-6 text-zinc-400">
                  Choose which folder should contain {moveLibraryItem.title}.
                </div>
              </div>
              <button
                onClick={() => setMoveLibraryItem(null)}
                className="rounded-full p-2 text-zinc-400 transition hover:bg-white/6 hover:text-white"
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
                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/4 px-4 py-4 text-left text-sm font-semibold text-white transition hover:bg-white/8"
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
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/4 px-4 py-4 text-left text-sm font-semibold text-white transition hover:bg-white/8"
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
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-16 backdrop-blur-[2px]">
          <div className="w-full max-w-155 rounded-[1.6rem] border border-white/10 bg-[#0f1520] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[1.7rem] font-bold tracking-[-0.04em] text-white">Add a set</div>
                <div className="mt-2 text-sm leading-6 text-zinc-400">
                  Choose exactly which flashcard set should be linked to this study group.
                </div>
              </div>
              <button
                onClick={() => setGroupSetPickerGroupId("")}
                className="rounded-full p-2 text-zinc-400 transition hover:bg-white/6 hover:text-white"
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
                          ? "cursor-not-allowed border-white/8 bg-white/3 text-zinc-500"
                          : "border-white/10 bg-white/4 hover:bg-white/8"
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
                <div className="rounded-xl border border-dashed border-white/12 bg-white/3 px-5 py-6 text-sm text-zinc-400">
                  No flashcard sets yet. Create one first, then add it to this group.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Groups picker modal: add this set to groups ─────────────────── */}
      {groupPickerSetId ? (() => {
        const pickerSet = library.sets.find((s) => s.id === groupPickerSetId);
        return (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-16 backdrop-blur-[2px]"
            onClick={(e) => { if (e.target === e.currentTarget) setGroupPickerSetId(null); }}
          >
            <div className="w-full max-w-125 rounded-[1.6rem] border border-white/10 bg-[#0f1520] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[1.4rem] font-bold tracking-[-0.04em] text-white">Add to a group</div>
                  {pickerSet && (
                    <div className="mt-1 text-sm text-zinc-400 line-clamp-1">{pickerSet.title}</div>
                  )}
                </div>
                <button
                  onClick={() => setGroupPickerSetId(null)}
                  className="rounded-full p-2 text-zinc-400 transition hover:bg-white/6 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-5 space-y-2">
                {library.groups.length ? (
                  library.groups.map((group) => {
                    const inGroup = group.setIds.includes(groupPickerSetId);
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={async () => {
                          if (!inGroup) {
                            await addSetToGroup(group.id, groupPickerSetId);
                          } else {
                            showToast("This set is already in that group.");
                          }
                        }}
                        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-left transition ${
                          inGroup
                            ? "border-indigo-400/30 bg-indigo-500/10"
                            : "border-white/10 bg-white/4 hover:bg-white/9"
                        }`}
                      >
                        <div>
                          <div className={`text-sm font-semibold ${inGroup ? "text-indigo-200" : "text-white"}`}>
                            {group.name}
                          </div>
                          {group.course && (
                            <div className="mt-0.5 text-xs text-zinc-400">{group.course}</div>
                          )}
                        </div>
                        <span className={`text-xs font-semibold ${inGroup ? "text-indigo-300" : "text-zinc-400"}`}>
                          {inGroup ? "✓ Added" : "Add"}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-white/12 bg-white/3 px-5 py-5 text-sm text-zinc-400">
                    You don&apos;t have any study groups yet. Create one below.
                  </div>
                )}
              </div>

              {/* Inline create-group form */}
              <div className="mt-5 border-t border-white/10 pt-5">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Create a new group</div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    placeholder="Group name…"
                    className="h-10 flex-1 rounded-xl border border-white/10 bg-white/6 px-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-indigo-400/50"
                  />
                  <button
                    type="button"
                    disabled={!groupName.trim()}
                    onClick={async () => {
                      if (!groupName.trim()) return;
                      if (!isSignedIn) { promptGoogleSignIn(); return; }
                      try {
                        const resp = await fetch("/api/study/groups", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name: groupName.trim(), course: "", description: "" }),
                        });
                        const payload = await resp.json();
                        if (!resp.ok) throw new Error(payload.error || "Failed to create group.");
                        const newGroup = payload.group as StudyGroup;
                        setLibrary((cur) => ({ ...cur, groups: [newGroup, ...cur.groups] }));
                        setGroupName("");
                        // Add the set to the newly created group
                        await addSetToGroup(newGroup.id, groupPickerSetId);
                        setGroupPickerSetId(null);
                      } catch (err) {
                        showToast(err instanceof Error ? err.message : "Failed to create group.", "error");
                      }
                    }}
                    className="h-10 rounded-xl bg-[#5561ff] px-4 text-sm font-semibold text-white transition hover:bg-[#4a55f0] disabled:opacity-40"
                  >
                    Create &amp; add
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })() : null}

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
              <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-zinc-300">
                Flashcards
              </span>
              <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-zinc-300">
                Learn mode
              </span>
              <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-zinc-300">
                Tests
              </span>
              <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-zinc-300">
                Test practice
              </span>
            </div>

            <button
              onClick={onCreateSet}
              {...magneticHoverProps}
              className="study-premium-button inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/6 px-5 py-3 text-sm font-semibold text-white"
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
    <div className="space-y-5">
      <div className="study-appear atlas-hero-card relative overflow-hidden rounded-2xl p-6">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-0.75 rounded-r-sm bg-linear-to-b from-indigo-400 via-violet-500 to-transparent" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Recommended next</p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-white md:text-[2rem]">{selectedSet.title}</h2>
          </div>
          <button
            onClick={onOpenSet}
            {...magneticHoverProps}
            className="atlas-cta-btn study-premium-button shrink-0"
          >
            Open set
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {recommendedCards.map((card) => {
            const progress = selectedProgress[card.id] ?? getDefaultProgress(card.id);
            return (
              <div key={card.id} className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{card.tags[0] || selectedSet.subject}</div>
                <div className="mt-2 text-sm font-semibold text-white">{card.front}</div>
                <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Mastery {progress.masteryScore}%</span>
                  <span className={progress.markedDifficult ? "text-rose-400" : "text-slate-500"}>{progress.markedDifficult ? "Needs work" : "Review due"}</span>
                </div>
                <div className="mt-2 h-1 rounded-full bg-slate-700/60">
                  <div className="h-1 rounded-full bg-linear-to-r from-indigo-500 to-violet-400" style={{ width: `${Math.max(4, progress.masteryScore)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="study-appear atlas-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Weak spots</p>
            <button
              onClick={onCreateSet}
              {...magneticHoverProps}
              className="study-premium-button rounded-full border border-white/10 bg-white/3 px-3 py-1.5 text-xs font-semibold text-zinc-200"
            >
              New set
            </button>
          </div>
          <div className="mt-4 space-y-4">
            {dashboard.weakestTopics.length ? dashboard.weakestTopics.map((topic) => (
              <div key={topic.topic}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-200">{topic.topic}</span>
                  <span className="text-slate-500">{Math.round(topic.ratio * 100)}% miss</span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-slate-800/80">
                  <div className="h-1 rounded-full bg-rose-500/70" style={{ width: `${Math.max(4, Math.round(topic.ratio * 100))}%` }} />
                </div>
              </div>
            )) : <p className="text-sm text-slate-500">Study more to map your weak topics here.</p>}
          </div>
        </div>

        <div className="study-appear atlas-panel rounded-2xl p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Recent sessions</p>
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-700/40">
            {recentSessions.length ? recentSessions.map((session) => (
              <div key={session.id} className="grid grid-cols-[1.1fr_0.7fr_0.5fr_0.6fr] gap-3 border-b border-slate-700/40 bg-slate-800/20 px-4 py-3 text-sm last:border-b-0">
                <div className="font-medium text-white truncate">{library.sets.find((set) => set.id === session.setId)?.title || "Study set"}</div>
                <div className="capitalize text-slate-400">{session.mode}</div>
                <div className="text-slate-400">{session.cardsReviewed}c</div>
                <div className="text-right text-slate-300">{session.accuracy}%</div>
              </div>
            )) : (
              <div className="px-4 py-5 text-sm text-slate-500">No sessions yet. Complete any study mode to see them here.</div>
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
  onRenameGroup,
  onRemoveSetFromGroup,
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
  onRenameGroup: (groupId: string) => void;
  onRemoveSetFromGroup: (groupId: string, setId: string) => void;
  onOpenAddSetPicker: (groupId: string) => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const prevGroupIdRef = useRef(selectedGroupId);

  useEffect(() => {
    if (selectedGroupId && selectedGroupId !== prevGroupIdRef.current) {
      const timeoutId = window.setTimeout(() => setShowDetail(true), 0);
      prevGroupIdRef.current = selectedGroupId;
      return () => window.clearTimeout(timeoutId);
    }
    prevGroupIdRef.current = selectedGroupId;
  }, [selectedGroupId]);

  // Close "more" menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelectGroup = (groupId: string) => {
    onSelectGroup(groupId);
    setShowDetail(true);
    onGroupTabChange("materials");
  };

  const copyInviteLink = async () => {
    if (!selectedGroup) return;
    const inviteUrl = `${window.location.origin}/study?join=${selectedGroup.inviteCode}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      // fallback
    }
  };

  const groupSets = selectedGroup
    ? selectedGroup.setIds.map((setId) => sets.find((s) => s.id === setId)).filter(Boolean) as StudySet[]
    : [];

  // ── DETAIL VIEW ──────────────────────────────────────────────────────────
  if (showDetail && selectedGroup) {
    return (
      <>
        <div className="space-y-6">
          {/* Back */}
          <button
            onClick={() => setShowDetail(false)}
            className="flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Study groups
          </button>

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-[2.1rem] font-bold tracking-[-0.05em] text-white">{selectedGroup.name}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenAddSetPicker(selectedGroup.id)}
                className="rounded-full border border-white/12 bg-white/7 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/12"
              >
                Add a set
              </button>
              <div className="relative" ref={moreMenuRef}>
                <button
                  onClick={() => setMoreMenuOpen((prev) => !prev)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/7 text-zinc-300 transition hover:bg-white/12 hover:text-white"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                {moreMenuOpen ? (
                  <div className="absolute right-0 top-12 z-30 w-44 rounded-2xl border border-white/12 bg-[#0f1520] py-2 shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
                    <button
                      onClick={() => { setMoreMenuOpen(false); onRenameGroup(selectedGroup.id); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-white/6"
                    >
                      <Pencil className="h-4 w-4 text-zinc-400" />
                      Rename group
                    </button>
                    <button
                      onClick={() => { setMoreMenuOpen(false); onDeleteGroup(selectedGroup.id); setShowDetail(false); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-300 transition hover:bg-white/6"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete group
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-6 border-b border-white/10 text-sm">
            <button
              onClick={() => onGroupTabChange("materials")}
              className={`pb-3 font-semibold transition ${groupTab === "materials" ? "border-b-2 border-[#7b61ff] text-white" : "text-zinc-400 hover:text-white"}`}
            >
              Materials
            </button>
            <button
              onClick={() => onGroupTabChange("members")}
              className={`pb-3 font-semibold transition ${groupTab === "members" ? "border-b-2 border-[#7b61ff] text-white" : "text-zinc-400 hover:text-white"}`}
            >
              Members
            </button>
          </div>

          {/* Tab content */}
          {groupTab === "materials" ? (
            <div className="rounded-[1.6rem] border border-white/10 bg-[#1e2240] p-6">
              {groupSets.length ? (
                <div className="space-y-3">
                  {groupSets.map((set) => (
                    <div key={set.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/4 px-4 py-4 transition hover:bg-white/7">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4f46e5]/30 text-[#a5b4fc]">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{set.title}</div>
                        <div className="mt-0.5 text-xs text-zinc-400">
                          Flashcard set • {set.cards.length} terms{set.course ? ` • ${set.course}` : ""}
                        </div>
                      </div>
                      <button
                        onClick={() => onRemoveSetFromGroup(selectedGroup.id, set.id)}
                        className="shrink-0 rounded-full p-1.5 text-zinc-500 transition hover:bg-white/6 hover:text-zinc-300"
                        title="Remove from group"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-70 flex-col items-center justify-center text-center">
                  <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-[1.4rem] bg-[#4f46e5]/20 text-[#a5b4fc]">
                    <BookOpen className="h-9 w-9" />
                  </div>
                  <div className="text-[1.6rem] font-semibold tracking-tight text-white">Add sets to your group</div>
                  <div className="mt-2 text-sm text-zinc-400">Choose a flashcard set to share with the group.</div>
                  <button
                    onClick={() => onOpenAddSetPicker(selectedGroup.id)}
                    className="mt-6 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/16"
                  >
                    Add sets
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Invite banner */}
              <div className="flex items-center justify-between gap-4 rounded-[1.2rem] border border-white/10 bg-white/4 px-5 py-4">
                <div>
                  <div className="text-sm font-semibold text-white">
                    {selectedGroup.memberNames.length} member{selectedGroup.memberNames.length === 1 ? "" : "s"}
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">
                    Invite members by sharing the link (15 max)
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    By inviting others, your info will be visible to accepted members.
                  </div>
                </div>
                <button
                  onClick={copyInviteLink}
                  className="shrink-0 rounded-full bg-[#4f46e5] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5d56f0]"
                >
                  Copy link
                </button>
              </div>
              {/* Also show join-by-code input */}
              <div className="flex gap-2">
                <input
                  value={inviteCodeInput}
                  onChange={(e) => onInviteCodeInputChange(e.target.value)}
                  placeholder="Have an invite code? Paste it here"
                  className="study-premium-input flex-1 rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
                />
                <button
                  onClick={onJoinGroup}
                  disabled={!inviteCodeInput.trim()}
                  className="rounded-xl bg-[#4f46e5] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#5d56f0] disabled:opacity-40"
                >
                  Join
                </button>
              </div>
              {/* Members list */}
              <div className="space-y-2">
                {selectedGroup.memberNames.map((member, idx) => (
                  <div key={idx} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#5b39c6] text-sm font-bold text-white">
                      {member.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-sm font-medium text-white">
                      {member}
                      {idx === 0 ? <span className="ml-2 text-xs text-zinc-500">(You)</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Create group modal */}
        {createGroupOpen ? (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-16 backdrop-blur-[2px]">
            <div className="w-full max-w-140 rounded-[1.6rem] border border-white/10 bg-[#0f1520] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[2rem] font-bold tracking-[-0.04em] text-white">Create a study group</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-400">Study flashcards together and track progress as a team.</div>
                </div>
                <button onClick={() => onCreateGroupOpenChange(false)} className="rounded-full p-2 text-zinc-400 transition hover:bg-white/6 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-6 space-y-4">
                <input value={groupName} onChange={(e) => onGroupNameChange(e.target.value)} placeholder="Group name (e.g. League of Learners)" className="study-premium-input w-full rounded-xl border border-white/12 bg-transparent px-4 py-4 text-base text-white outline-none placeholder:text-zinc-500" />
                <div className="grid gap-3 md:grid-cols-2">
                  <input value={groupCourse} onChange={(e) => onGroupCourseChange(e.target.value)} placeholder="Course or topic" className="study-premium-input rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500" />
                  <input value={groupDescription} onChange={(e) => onGroupDescriptionChange(e.target.value)} placeholder="Short description" className="study-premium-input rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500" />
                </div>
                <div className="flex justify-end">
                  <button onClick={onCreateGroup} disabled={!groupName.trim()} className="rounded-full bg-[#4f46e5] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#5d56f0] disabled:opacity-50">Create group</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-[2.2rem] font-bold tracking-[-0.05em] text-white">Study groups</h1>
          <button
            onClick={() => onCreateGroupOpenChange(true)}
            className="rounded-full border border-white/12 bg-white/7 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/12"
          >
            Create new group
          </button>
        </div>

        {groups.length === 0 ? (
          /* Empty state */
          <div className="flex min-h-[52vh] flex-col items-center justify-center text-center">
            <div className="relative mb-10">
              <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-[1.6rem] bg-white text-[#1b1448] shadow-[0_18px_40px_rgba(0,0,0,0.24)]">
                <Users className="h-12 w-12" />
              </div>
              <div className="absolute -bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
                {(["A", "B", "C", "D"] as const).map((item, index) => (
                  <div key={item} className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ${index === 0 ? "bg-amber-400" : index === 1 ? "bg-pink-400" : index === 2 ? "bg-sky-400" : "bg-indigo-400"}`}>{item}</div>
                ))}
              </div>
            </div>
            <h2 className="max-w-115 text-[1.9rem] font-bold leading-tight tracking-tight text-white">
              Get your study group going and learn together
            </h2>
            <p className="mt-3 max-w-sm text-sm text-zinc-400">Create a group, add your sets, and share the invite link with classmates.</p>
            <button onClick={() => onCreateGroupOpenChange(true)} className="mt-8 rounded-full bg-[#4f46e5] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#5d56f0]">
              Create a group
            </button>
            {/* Join by code */}
            <div className="mt-6 flex gap-2">
              <input
                value={inviteCodeInput}
                onChange={(e) => onInviteCodeInputChange(e.target.value)}
                placeholder="Have an invite code? Enter it here"
                className="study-premium-input rounded-xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
              />
              <button onClick={onJoinGroup} disabled={!inviteCodeInput.trim()} className="rounded-xl bg-[#4f46e5] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#5d56f0] disabled:opacity-40">
                Join
              </button>
            </div>
          </div>
        ) : (
          /* Groups list */
          <div className="space-y-3">
            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => handleSelectGroup(group.id)}
                className="flex w-full items-center gap-4 rounded-[1.2rem] border border-white/8 bg-white/3 px-5 py-4 text-left transition hover:border-white/14 hover:bg-white/6"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#4f46e5]/25 text-[#a5b4fc]">
                  <Users className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-base font-semibold text-white">{group.name}</div>
                  <div className="mt-0.5 text-sm text-zinc-400">{group.setIds.length} set{group.setIds.length !== 1 ? "s" : ""} • {group.memberNames.length} member{group.memberNames.length !== 1 ? "s" : ""}</div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-zinc-500" />
              </button>
            ))}
            {/* Join by code */}
            <div className="mt-4 flex gap-2">
              <input
                value={inviteCodeInput}
                onChange={(e) => onInviteCodeInputChange(e.target.value)}
                placeholder="Join with invite code"
                className="study-premium-input flex-1 rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
              />
              <button onClick={onJoinGroup} disabled={!inviteCodeInput.trim()} className="rounded-xl bg-[#4f46e5] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#5d56f0] disabled:opacity-40">
                Join
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create group modal */}
      {createGroupOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-16 backdrop-blur-[2px]">
          <div className="w-full max-w-140 rounded-[1.6rem] border border-white/10 bg-[#0f1520] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[2rem] font-bold tracking-[-0.04em] text-white">Create a study group</div>
                <div className="mt-2 text-sm leading-6 text-zinc-400">Study flashcards together and track progress as a team.</div>
              </div>
              <button onClick={() => onCreateGroupOpenChange(false)} className="rounded-full p-2 text-zinc-400 transition hover:bg-white/6 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <input value={groupName} onChange={(e) => onGroupNameChange(e.target.value)} placeholder="Group name (e.g. League of Learners)" className="study-premium-input w-full rounded-xl border border-white/12 bg-transparent px-4 py-4 text-base text-white outline-none placeholder:text-zinc-500" />
              <div className="grid gap-3 md:grid-cols-2">
                <input value={groupCourse} onChange={(e) => onGroupCourseChange(e.target.value)} placeholder="Course or topic" className="study-premium-input rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500" />
                <input value={groupDescription} onChange={(e) => onGroupDescriptionChange(e.target.value)} placeholder="Short description" className="study-premium-input rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500" />
              </div>
              <div className="flex justify-end">
                <button onClick={onCreateGroup} disabled={!groupName.trim()} className="rounded-full bg-[#4f46e5] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#5d56f0] disabled:opacity-50">Create group</button>
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
        <div className="study-appear rounded-3xl">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={toggleVisibility}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-zinc-200 transition hover:bg-white/12"
            >
              <VisibilityIcon visibility={draftSet.visibility} className="h-3.5 w-3.5" />
              {draftSet.visibility === "public" ? "Public" : "Private"}
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onRequestSave("overview")}
                {...magneticHoverProps}
                className="study-premium-button rounded-full bg-white/16 px-5 py-2.5 text-sm font-semibold text-white"
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
            <button onClick={onImportFromText} {...magneticHoverProps} className="study-premium-button rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-100">
              + Import
            </button>
            <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCardSearchOpen((current) => !current)}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 transition ${
                cardSearchOpen ? "bg-[#5561ff] text-white" : "bg-white/6"
              }`}
              aria-label="Search terms and definitions"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={swapAllTermsAndDefinitions}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/6 text-zinc-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Swap all terms and definitions"
            >
              <Shuffle className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onDeleteSet}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/6 text-zinc-300 transition hover:bg-red-500/15 hover:text-red-100"
              aria-label={isEditing ? "Delete set" : "Delete draft"}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            </div>
          </div>
          {cardSearchOpen ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/4 p-3">
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
                id={`edit-card-${card.id}`}
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
                    className="flex min-h-30 flex-col items-center justify-center rounded-xl border border-dashed border-white/25 bg-transparent text-zinc-300 transition hover:bg-white/5"
                  >
                    <ImageIcon className="h-5 w-5" />
                    <span className="mt-2 text-xs font-semibold">Image</span>
                  </button>
                </div>
              </div>
            ))}
            {!visibleCards.length ? (
              <div className="rounded-[1.2rem] border border-dashed border-white/12 bg-white/3 px-5 py-8 text-sm text-zinc-400">
                No cards matched that search yet.
              </div>
            ) : null}
          </div>
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => onDraftSetChange((current) => ({ ...current, cards: [...current.cards, emptyDraftCard(current.cards.length)] }))}
              {...magneticHoverProps}
              className="study-premium-button rounded-full bg-white/12 px-6 py-3 text-sm font-semibold text-white"
            >
              Add a card
            </button>
          </div>
          <div className="mt-8 flex justify-end gap-3">
            <button
              onClick={() => onRequestSave("overview")}
              {...magneticHoverProps}
              className="study-premium-button rounded-full bg-white/12 px-5 py-2.5 text-sm font-semibold text-white"
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
        <div className="study-appear rounded-3xl border border-white/10 bg-[#444d74] p-5">
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
            <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/8">
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
            <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-white/12 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/16">
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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-16 backdrop-blur-[2px]">
      <div className="w-full max-w-120 rounded-[1.7rem] border border-white/10 bg-[#171b42] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.42)]">
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
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/6 text-zinc-200 transition hover:bg-white/12"
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
            className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
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
        <div className="study-premium-panel study-appear rounded-3xl p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="text-sm font-semibold text-white">Paste text or upload a PDF</div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/8">
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
              className="study-premium-button rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isGenerating ? "Generating..." : "Generate guide"}
            </button>
          </div>
        </div>

        <div className="study-premium-panel study-appear rounded-3xl p-5 backdrop-blur-xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Guide details</div>
              <h2 className="mt-2 max-w-lg text-[1.45rem] font-semibold tracking-[-0.03em] text-white">Review and save</h2>
            </div>
            <button onClick={onSave} {...magneticHoverProps} className="study-premium-button self-start rounded-xl border border-white/10 bg-white/6 px-4 py-2.5 text-sm font-semibold text-white">
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
                className={`study-premium-input rounded-2xl border bg-white/5 px-4 py-3 text-lg font-semibold text-white outline-none placeholder:text-zinc-500 ${
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
                  className={`study-premium-input rounded-2xl border bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 ${
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
                  className="study-premium-input rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
                />
              </label>
            </div>

            <label className="grid gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Folder</span>
              <select
                value={draftGuide.folder || ""}
                onChange={(event) => onDraftGuideChange((current) => ({ ...current, folder: event.target.value }))}
                className="study-premium-input rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
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
                <div className="rounded-[1.2rem] border border-emerald-400/10 bg-emerald-500/5 p-4">
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200/80">Summary</div>
                  <div className="mt-2 text-sm leading-7 text-zinc-200">{generatedGuide.summary}</div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {generatedGuide.sections.map((section) => (
                    <div key={section.heading} className="rounded-[1.2rem] border border-white/8 bg-white/3 p-4">
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
                  <div className="rounded-[1.2rem] border border-white/8 bg-white/3 p-4">
                    <div className="text-sm font-semibold text-white">Key terms</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {generatedGuide.keyTerms.length ? generatedGuide.keyTerms.map((term) => (
                        <span key={term} className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-zinc-200">
                          {term}
                        </span>
                      )) : <span className="text-sm text-zinc-500">No key terms yet.</span>}
                    </div>
                  </div>
                  <div className="rounded-[1.2rem] border border-white/8 bg-white/3 p-4">
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
              <div className="rounded-[1.2rem] border border-dashed border-white/10 bg-white/3 px-5 py-8 text-sm leading-6 text-zinc-400">
                Generate a study guide to preview the structured summary here before saving.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-5 2xl:sticky 2xl:top-6 2xl:self-start">
        <div className="study-premium-panel study-appear rounded-3xl p-5 backdrop-blur-xl">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Publishing</div>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Visibility</span>
              <select
                value={draftGuide.visibility}
                onChange={(event) => onDraftGuideChange((current) => ({ ...current, visibility: event.target.value as StudyNote["visibility"] }))}
                className="study-premium-input rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
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
  onToggleVisibility,
  onToggleFlag,
  onToggleSaved,
  onPracticeMistakes,
  onGroupsClick,
}: {
  set: StudySet;
  progressMap: Record<string, CardProgress>;
  availableFolders: string[];
  onModeChange: (screen: Screen) => void;
  onMoveToFolder: (folder: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onToggleVisibility: () => void;
  onToggleFlag: (cardId: string, patch: Partial<CardProgress>) => void;
  onToggleSaved: () => void;
  onPracticeMistakes: (cardFronts: string[]) => void;
  onGroupsClick: () => void;
}) {
  const mastery = set.cards.length
    ? Math.round(set.cards.reduce((sum, card) => sum + (progressMap[card.id]?.masteryScore || 0), 0) / set.cards.length)
    : 0;
  const starred = set.cards.filter((card) => progressMap[card.id]?.starred).length;
  const difficult = set.cards.filter((card) => progressMap[card.id]?.markedDifficult).length;
  const [previewState, setPreviewState] = useState(() => ({
    setId: set.id,
    index: 0,
    flipped: false,
  }));
  const [previewMotion, setPreviewMotion] = useState<"idle" | "next" | "prev">("idle");
  const previewMotionTimeoutRef = useRef<number | null>(null);
  const [trackPreviewProgress, setTrackPreviewProgress] = useState(false);
  const previewIndex = previewState.setId === set.id ? previewState.index : 0;
  const previewFlipped = previewState.setId === set.id ? previewState.flipped : false;
  const previewCard = set.cards[previewIndex] ?? set.cards[0];
  const previewCardProgress = progressMap[previewCard?.id ?? ""] ?? getDefaultProgress(previewCard?.id ?? "");
  const missedCardCount = set.cards.filter((card) => progressMap[card.id]?.missedRecently).length;

  // Share modal state
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const handleNativeShare = () => {
    if (navigator.share) {
      navigator.share({ title: set.title, url: shareUrl }).catch(() => {});
    }
  };

  // Three-dots menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const modeTiles = [
    { label: "Flashcards", icon: <Copy className="h-4 w-4" />, active: true, onClick: () => onModeChange("flashcards") },
    { label: "Learn", icon: <Brain className="h-4 w-4" />, active: false, onClick: () => onModeChange("learn") },
    { label: "Test", icon: <Target className="h-4 w-4" />, active: false, onClick: () => onModeChange("test") },
    { label: "Match", icon: <Shuffle className="h-4 w-4" />, active: false, onClick: () => onModeChange("match") },
  ];

  const setPreviewIndex = (updater: number | ((current: number) => number)) => {
    setPreviewState((current) => {
      const currentIndex = current.setId === set.id ? current.index : 0;
      const nextIndex = typeof updater === "function" ? updater(currentIndex) : updater;
      return { setId: set.id, index: nextIndex, flipped: false };
    });
  };

  const setPreviewFlipped = (updater: boolean | ((current: boolean) => boolean)) => {
    setPreviewState((current) => {
      const currentFlipped = current.setId === set.id ? current.flipped : false;
      const nextFlipped = typeof updater === "function" ? updater(currentFlipped) : updater;
      return { setId: set.id, index: previewIndex, flipped: nextFlipped };
    });
  };

  const triggerPreviewMotion = (direction: "next" | "prev") => {
    if (previewMotionTimeoutRef.current) window.clearTimeout(previewMotionTimeoutRef.current);
    setPreviewMotion(direction);
    previewMotionTimeoutRef.current = window.setTimeout(() => {
      setPreviewMotion("idle");
      previewMotionTimeoutRef.current = null;
    }, 420);
  };

  if (!previewCard) {
    return <EmptyModeState title="No cards in this set yet." onBack={() => onModeChange("flashcards")} />;
  }

  return (
    <>
      {/* Share Modal */}
      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-16 backdrop-blur-[2px]" onClick={() => setShareOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f1520] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Share this set</h2>
              <button onClick={() => setShareOpen(false)} className="rounded-full p-1 text-zinc-400 transition hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-zinc-300">{set.title} · {set.cards.length} cards</p>
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="flex-1 truncate text-sm text-zinc-300">{shareUrl}</span>
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out this study set: ${set.title}`)}&url=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
              >
                <Globe className="h-4 w-4 text-sky-400" />
                Share on X / Twitter
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${set.title} — ${shareUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
              >
                <Users className="h-4 w-4 text-green-400" />
                Share via WhatsApp
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(set.title)}&body=${encodeURIComponent(`Here is a study set I thought you would find useful:\n${shareUrl}`)}`}
                className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
              >
                <Share2 className="h-4 w-4 text-zinc-400" />
                Share via Email
              </a>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button
                  onClick={handleNativeShare}
                  className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
                >
                  <Share2 className="h-4 w-4 text-indigo-400" />
                  More options…
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    <div className="mx-auto max-w-215 space-y-6">
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
              <VisibilityBadge visibility={set.visibility} />
              <button
                onClick={onToggleSaved}
                title={set.saved ? "Remove from saved" : "Save this set"}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  set.saved
                    ? "border-[#6a63f6] bg-[#2a255a] text-white hover:bg-[#231f52]"
                    : "border-white/20 bg-white/6 text-zinc-300 hover:border-[#6a63f6]/60 hover:bg-[#1e1b45] hover:text-white"
                }`}
              >
                <Bookmark className={`h-4 w-4 ${set.saved ? "fill-current" : ""}`} />
                {set.saved ? "Saved" : "Save"}
              </button>
              <button
                onClick={onGroupsClick}
                className="inline-flex items-center gap-2 rounded-full bg-white/8 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/14 hover:text-white"
              >
                <Users className="h-4 w-4" />
                Groups
              </button>
              <button
                onClick={() => setShareOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-zinc-200 transition hover:bg-white/14 hover:text-white"
                aria-label="Share set"
              >
                <Share2 className="h-4 w-4" />
              </button>
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-zinc-200 transition hover:bg-white/14 hover:text-white"
                  aria-label="More options"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-12 z-40 w-52 rounded-2xl border border-white/10 bg-[#0f1520] py-1.5 shadow-2xl">
                    <button
                      onClick={() => { setMenuOpen(false); onEdit(); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-white/5 hover:text-white"
                    >
                      <Pencil className="h-4 w-4 text-zinc-400" />
                      Edit set
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); onDuplicate(); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-white/5 hover:text-white"
                    >
                      <Copy className="h-4 w-4 text-zinc-400" />
                      Duplicate set
                    </button>
                    <button
                      onClick={() => { setMenuOpen(false); onToggleVisibility(); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-white/5 hover:text-white"
                    >
                      <VisibilityIcon visibility={set.visibility === "public" ? "private" : "public"} className="h-4 w-4 text-zinc-400" />
                      {set.visibility === "public" ? "Make private" : "Make public"}
                    </button>
                    {availableFolders.length > 0 && (
                      <div className="border-t border-white/5 pt-1">
                        <p className="px-4 pb-1 pt-1.5 text-xs font-medium text-zinc-500">Move to folder</p>
                        {availableFolders.slice(0, 5).map((folder) => (
                          <button
                            key={folder}
                            onClick={() => { setMenuOpen(false); onMoveToFolder(folder); }}
                            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
                          >
                            <Folder className="h-3.5 w-3.5 text-zinc-400" />
                            {folderLabelFromPath(folder)}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="border-t border-white/5 pt-1">
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          if (window.confirm(`Delete "${set.title}"? This cannot be undone.`)) onDelete();
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-rose-400 transition hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete set
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {modeTiles.map((tile) => (
              <button
                key={tile.label}
                onClick={tile.onClick}
                className="flex items-center gap-3 rounded-xl bg-[#3b4568] px-5 py-4 text-left text-sm font-semibold text-zinc-100 transition hover:bg-[#455178]"
              >
                <span className="text-[#70a7ff]">{tile.icon}</span>
                {tile.label}
              </button>
            ))}
            {missedCardCount > 0 ? (
              <div className="col-span-2 flex justify-start">
                <button
                  onClick={() => {
                    const missedFronts = set.cards
                      .filter((card) => progressMap[card.id]?.missedRecently)
                      .map((card) => card.front);
                    onPracticeMistakes(missedFronts);
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-500/10 px-3.5 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/18 hover:text-rose-200"
                >
                  <Target className="h-3 w-3 text-rose-400" />
                  Practice {missedCardCount} mistake{missedCardCount !== 1 ? "s" : ""}
                </button>
              </div>
            ) : null}
          </div>

          <div className="rounded-[1.7rem] border border-white/10 bg-[#444d74] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.24)]">
            <div className="flex items-center justify-between text-sm text-zinc-200">
              <div className="inline-flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" />
                Get a hint
              </div>
              <div className="flex items-center gap-1">
                <button
                  aria-label="Edit this card"
                  title="Edit this card"
                  onClick={() => {
                    if (!previewCard) return;
                    window.location.href = `/study/create?edit=${encodeURIComponent(set.id)}&card=${encodeURIComponent(previewCard.id)}`;
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  aria-label="Read aloud"
                  title="Read aloud"
                  onClick={() => {
                    if (!previewCard) return;
                    speakEnglish(previewFlipped ? previewCard.back : previewCard.front);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
                <button
                  aria-label={previewCardProgress.starred ? "Unstar card" : "Star card"}
                  title={previewCardProgress.starred ? "Unstar card" : "Star card"}
                  onClick={() => previewCard && onToggleFlag(previewCard.id, { starred: !previewCardProgress.starred })}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/10 ${previewCardProgress.starred ? "text-yellow-400 hover:text-yellow-300" : "text-zinc-400 hover:text-white"}`}
                >
                  <Star className={`h-4 w-4 ${previewCardProgress.starred ? "fill-current" : ""}`} />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPreviewFlipped((current) => !current)}
              className="relative mt-5 h-72.5 w-full cursor-pointer select-none rounded-3xl perspective-[1400px] outline-none focus:outline-none"
            >
              <div
                key={`${previewCard.id}-${previewIndex}`}
                className={`relative h-full w-full transform-gpu rounded-3xl transition-transform duration-420 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${previewMotion === "next" ? "study-card-enter-next" : previewMotion === "prev" ? "study-card-enter-prev" : ""}`}
                style={{
                  transformStyle: "preserve-3d",
                  WebkitTransformStyle: "preserve-3d",
                  transform: previewFlipped ? "rotateX(180deg)" : "rotateX(0deg)",
                }}
              >
                <div
                  className="absolute inset-0 flex h-full w-full transform-gpu items-center justify-center rounded-3xl p-6 text-center"
                  style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateX(0deg)" }}
                >
                  <div className="text-[1.9rem] font-medium tracking-[-0.03em] text-white">{previewCard.front}</div>
                </div>
                <div
                  className="absolute inset-0 flex h-full w-full transform-gpu items-center justify-center rounded-3xl p-6 text-center"
                  style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateX(180deg)" }}
                >
                  <div className="text-[1.75rem] font-medium tracking-[-0.03em] text-white">{previewCard.back}</div>
                </div>
              </div>
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
                  if (previewIndex <= 0) return;
                  triggerPreviewMotion("prev");
                  setPreviewIndex((current) => Math.max(0, current - 1));
                  setPreviewFlipped(false);
                }}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/8 text-zinc-100"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="min-w-19.5 text-center text-sm font-semibold text-white">
                {previewIndex + 1} / {set.cards.length}
              </div>
              <button
                onClick={() => {
                  if (previewIndex >= set.cards.length - 1) return;
                  triggerPreviewMotion("next");
                  setPreviewIndex((current) => Math.min(set.cards.length - 1, current + 1));
                  setPreviewFlipped(false);
                }}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/8 text-zinc-100"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => onModeChange("flashcards")} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-zinc-100">
                <Play className="h-4 w-4" />
              </button>
              <button onClick={() => onModeChange("match")} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-zinc-100">
                <Shuffle className="h-4 w-4" />
              </button>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-zinc-100">
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Narrow progress bar below nav */}
          <div className="mt-4 h-0.75 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/50"
              style={{ width: `${set.cards.length > 1 ? ((previewIndex + 1) / set.cards.length) * 100 : 100}%` }}
            />
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
              className="study-premium-input rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-100 outline-none"
            >
              <option value="">No folder</option>
              {availableFolders.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
            <button onClick={onDuplicate} className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-100">
              Copy set
            </button>
            <button onClick={onDelete} className="rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100">
              Delete set
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

function FlashcardsMode({
  set,
  progressMap,
  onBack,
  onModeChange,
  onProgress,
  onToggleFlag,
  onToggleSaved,
  onGroupsClick,
  onSessionSave,
  onCelebrate,
}: {
  set: StudySet;
  progressMap: Record<string, CardProgress>;
  onBack: () => void;
  onModeChange: (screen: Screen) => void;
  onProgress: (cardId: string, result: "knew" | "missed") => void;
  onToggleFlag: (cardId: string, patch: Partial<CardProgress>) => void;
  onToggleSaved: () => void;
  onGroupsClick: () => void;
  onSessionSave: (session: ReturnType<typeof buildStudySession>) => void;
  onCelebrate: (message: string) => void;
}) {
  const filter: StudyFilter = "all";
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [cardMotion, setCardMotion] = useState<"idle" | "next" | "prev">("idle");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [trackProgress, setTrackProgress] = useState(false);
  const [recentFeedback, setRecentFeedback] = useState<"knew" | "missed" | null>(null);
  const [optimisticProgress, setOptimisticProgress] = useState<Record<string, CardProgress>>({});
  const [shuffledCardIds, setShuffledCardIds] = useState<string[] | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [aiHints, setAiHints] = useState<Record<string, string>>({});
  const [loadingHintId, setLoadingHintId] = useState<string | null>(null);
  const [startedAt] = useState(() => new Date().toISOString());
  const [fcShareOpen, setFcShareOpen] = useState(false);
  const [fcCopied, setFcCopied] = useState(false);
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

  // Reset hint whenever the card changes
  useEffect(() => {
    setShowHint(false);
  }, [index]);

  const isRealHint = (hint: string | undefined): boolean => {
    if (!hint || hint.trim().length < 8) return false;
    const lower = hint.toLowerCase();
    if (lower.startsWith("card ") && lower.includes("generated")) return false;
    if (lower.includes("pasted study text")) return false;
    if (lower.includes("flashcard") && lower.includes("generated from")) return false;
    return true;
  };

  const handleGetHint = async () => {
    if (!card) return;
    // If a real hint already exists on the card, just toggle
    if (isRealHint(card.hint)) {
      setShowHint((h) => !h);
      return;
    }
    // If we already fetched an AI hint for this card, just toggle
    if (aiHints[card.id]) {
      setShowHint((h) => !h);
      return;
    }
    // Fetch a new AI hint
    setLoadingHintId(card.id);
    setShowHint(true);
    try {
      const response = await fetch("/api/study/generate-hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front: card.front, back: card.back }),
      });
      const payload = await response.json() as { hint?: string };
      setAiHints((prev) => ({ ...prev, [card.id]: payload.hint || `Think about the key concept behind "${card.front}".` }));
    } catch {
      setAiHints((prev) => ({ ...prev, [card.id]: `Think about the key concept behind "${card.front}".` }));
    } finally {
      setLoadingHintId(null);
    }
  };

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
    if (!autoplay) return;
    // Phase 1: show front for FRONT_MS
    // Phase 2: flip to back for BACK_MS
    // Phase 3: advance to next card (shows front), repeat
    const FRONT_MS = 2800;
    const BACK_MS = 2200;
    const TOTAL_MS = FRONT_MS + BACK_MS;

    setFlipped(false); // always start from front

    let flipTimer: number;
    const scheduleFlip = () => {
      flipTimer = window.setTimeout(() => setFlipped(true), FRONT_MS);
    };
    scheduleFlip();

    const interval = window.setInterval(() => {
      window.clearTimeout(flipTimer);
      setFlipped(false);
      triggerCardMotion("next");
      setIndex((current) => (current + 1) % cards.length);
      scheduleFlip();
    }, TOTAL_MS);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(flipTimer);
    };
  }, [autoplay, cards.length]);

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
      if (event.key === "ArrowRight") {
        setIndex((current) => {
          const nextIndex = Math.min(cards.length - 1, current + 1);
          if (nextIndex !== current) {
            setFlipped(false);
            triggerCardMotion("next");
          }
          return nextIndex;
        });
      }
      if (event.key === "ArrowLeft") {
        setIndex((current) => {
          const nextIndex = Math.max(0, current - 1);
          if (nextIndex !== current) {
            setFlipped(false);
            triggerCardMotion("prev");
          }
          return nextIndex;
        });
      }
      if (event.key === " ") {
        event.preventDefault();
        setFlipped((current) => !current);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cards.length]);

  if (!card) {
    return <EmptyModeState title="No cards match that filter." onBack={onBack} />;
  }

  const currentProgress = effectiveProgressMap[card.id] ?? getDefaultProgress(card.id);
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

  const fcShareUrl = typeof window !== "undefined" ? window.location.href : "";
  const handleFcCopyLink = () => {
    navigator.clipboard.writeText(fcShareUrl).then(() => {
      setFcCopied(true);
      setTimeout(() => setFcCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <>
      {fcShareOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-16 backdrop-blur-[2px]" onClick={() => setFcShareOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0f1520] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Share this set</h2>
              <button onClick={() => setFcShareOpen(false)} className="rounded-full p-1 text-zinc-400 transition hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-zinc-300">{set.title} · {set.cards.length} cards</p>
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="flex-1 truncate text-sm text-zinc-300">{fcShareUrl}</span>
              <button
                onClick={handleFcCopyLink}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
              >
                {fcCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {fcCopied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out this study set: ${set.title}`)}&url=${encodeURIComponent(fcShareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
              >
                <Globe className="h-4 w-4 text-sky-400" />
                Share on X / Twitter
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${set.title} — ${fcShareUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
              >
                <Users className="h-4 w-4 text-green-400" />
                Share via WhatsApp
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent(set.title)}&body=${encodeURIComponent(`Here is a study set I thought you would find useful:\n${fcShareUrl}`)}`}
                className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
              >
                <Share2 className="h-4 w-4 text-zinc-400" />
                Share via Email
              </a>
            </div>
          </div>
        </div>
      )}
    <div className="mx-auto max-w-215 space-y-5">
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
              <button
                onClick={onToggleSaved}
                title={set.saved ? "Remove from saved" : "Save this set"}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  set.saved
                    ? "border-[#6a63f6] bg-[#2a255a] text-white hover:bg-[#231f52]"
                    : "border-white/20 bg-white/6 text-zinc-300 hover:border-[#6a63f6]/60 hover:bg-[#1e1b45] hover:text-white"
                }`}
              >
                <Bookmark className={`h-4 w-4 ${set.saved ? "fill-current" : ""}`} />
                {set.saved ? "Saved" : "Save"}
              </button>
              <button
                onClick={onGroupsClick}
                className="inline-flex items-center gap-2 rounded-full bg-white/8 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/14 hover:text-white"
              >
                <Users className="h-4 w-4" />
                Groups
              </button>
              <button
                onClick={() => setFcShareOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-zinc-200 transition hover:bg-white/14 hover:text-white"
                aria-label="Share set"
              >
                <Share2 className="h-4 w-4" />
              </button>
              <button
                onClick={onBack}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-zinc-200 transition hover:bg-white/14 hover:text-white"
                aria-label="Back to set overview"
                title="Back to set overview"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { screen: "flashcards" as Screen, label: "Flashcards", icon: <Copy className="h-4 w-4" /> },
              { screen: "learn" as Screen, label: "Learn", icon: <Brain className="h-4 w-4" /> },
              { screen: "test" as Screen, label: "Test", icon: <Target className="h-4 w-4" /> },
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
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => void handleGetHint()}
              disabled={loadingHintId === card.id}
              className="inline-flex items-center gap-2 text-sm transition cursor-pointer text-indigo-300 hover:text-indigo-200 disabled:cursor-default disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {loadingHintId === card.id
                ? "Generating hint…"
                : showHint
                  ? "Hide hint"
                  : "Get a hint"}
            </button>
            {showHint && (
              <div className="mt-1 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200">
                {loadingHintId === card.id
                  ? "Thinking…"
                  : aiHints[card.id] ?? (isRealHint(card.hint) ? card.hint : "Generating…")}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              aria-label="Edit this card"
              title="Edit this card"
              onClick={() => {
                window.location.href = `/study/create?edit=${encodeURIComponent(set.id)}&card=${encodeURIComponent(card.id)}`;
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              aria-label="Read aloud"
              title="Read aloud"
              onClick={() => speakEnglish(flipped ? card.back : card.front)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <Volume2 className="h-4 w-4" />
            </button>
            <button
              aria-label={currentProgress.starred ? "Unstar card" : "Star card"}
              title={currentProgress.starred ? "Unstar card" : "Star card"}
              onClick={() => onToggleFlag(card.id, { starred: !currentProgress.starred })}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/10 ${currentProgress.starred ? "text-yellow-400 hover:text-yellow-300" : "text-zinc-400 hover:text-white"}`}
            >
              <Star className={`h-4 w-4 ${currentProgress.starred ? "fill-current" : ""}`} />
            </button>
          </div>
        </div>

        {/* Narrow progress bar */}
        <div className="mt-5 h-0.75 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-white/50"
            style={{ width: `${cards.length > 1 ? ((index + 1) / cards.length) * 100 : 100}%` }}
          />
        </div>

        <div ref={containerRef} className={`mt-4 ${isFullscreen ? "mx-auto w-full max-w-6xl" : ""}`}>
          <button
            type="button"
            onClick={() => setFlipped((current) => !current)}
            className={`group relative w-full cursor-pointer select-none overflow-hidden rounded-4xl perspective-[1800px] outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${isFullscreen ? "h-[68vh] max-h-190 min-h-130" : "h-105"}`}
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
              className={`relative h-full w-full rounded-4xl ${
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
                className={`relative h-full w-full transform-gpu rounded-4xl will-change-transform transition-transform ${isFullscreen ? "duration-1020 ease-[cubic-bezier(0.16,1,0.3,1)]" : "duration-630 ease-[cubic-bezier(0.22,1,0.36,1)]"}`}
                style={{
                  transformStyle: "preserve-3d",
                  WebkitTransformStyle: "preserve-3d",
                  transform: flipped ? "rotateX(180deg)" : "rotateX(0deg)",
                }}
              >
                <div
                  className="absolute inset-0 flex h-full w-full transform-gpu items-center justify-center rounded-4xl border border-white/10 bg-[#444d74] p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.3)]"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateX(0deg)",
                  }}
                >
                  <div>
                    <div className="text-4xl font-medium tracking-[-0.03em] text-white">{card.front}</div>
                  </div>
                </div>
                <div
                  className="absolute inset-0 flex h-full w-full transform-gpu items-center justify-center rounded-4xl border border-white/10 bg-[linear-gradient(180deg,#1a2037_0%,#232d4b_100%)] p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.3)]"
                  style={{
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateX(180deg)",
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
                <div className="min-w-22 text-center text-base font-semibold tracking-[-0.03em] text-white">
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
                <div className="min-w-22 text-center text-2xl font-semibold tracking-[-0.04em] text-white">
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
    </>
  );
}

function LearnMode({
  set,
  initialPracticeCardFronts,
  onBack,
  onProgress,
  onSessionSave,
  onCelebrate,
}: {
  set: StudySet;
  initialPracticeCardFronts?: string[] | null;
  onBack: () => void;
  onProgress: (cardId: string, result: "knew" | "missed") => void;
  onSessionSave: (session: ReturnType<typeof buildStudySession>) => void;
  onCelebrate: (message: string) => void;
}) {
  const [practiceOnlyCardFronts, setPracticeOnlyCardFronts] = useState<string[] | null>(
    initialPracticeCardFronts && initialPracticeCardFronts.length > 0 ? initialPracticeCardFronts : null,
  );
  const questions = useMemo(() => {
    const bank = buildQuestionBank(set).filter((question) => question.type === "multiple_choice" && (question.choices?.length || 0) >= 4);
    const full = bank.length ? bank : buildQuestionBank(set).filter((question) => question.type === "true_false");
    if (practiceOnlyCardFronts && practiceOnlyCardFronts.length > 0) {
      const filtered = full.filter((q) =>
        practiceOnlyCardFronts.some(
          (front) => stripQuestionPrompt(q.prompt) === front || q.prompt.includes(front),
        ),
      );
      return filtered.length > 0 ? filtered : full;
    }
    return full;
  }, [set, practiceOnlyCardFronts]);
  const [index, setIndex] = useState(0);
  const [startedAt] = useState(() => new Date().toISOString());
  const [score, setScore] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [finalStats, setFinalStats] = useState<{ correct: number; total: number; durationMs: number } | null>(null);
  const [wrongQuestions, setWrongQuestions] = useState<Array<{ prompt: string; correctAnswerText: string; userAnswer: string | null; cardFront: string }>>([]);
  const [showMistakes, setShowMistakes] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [enhancedChoices, setEnhancedChoices] = useState<Record<string, string[]>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Cache of pre-fetched explanations keyed by question index so the result is
  // ready the instant the user submits an answer (no "Preparing…" delay).
  const prefetchedExplanations = useRef<Record<number, string>>({});
  const sessionStartMs = useRef(Date.now());
  const panelRef = useRef<HTMLDivElement | null>(null);
  const question = questions[index];

  // Compute selectedIsCorrect early (null-safe) so it can be used in effects and continueLearn
  const selectedIsCorrect =
    submitted &&
    selectedChoice != null &&
    question != null &&
    ((question.type === "true_false" ? selectedChoice.toLowerCase() : selectedChoice) === String(question.correctAnswer));

  const resetSession = () => {
    setCompleted(false);
    setFinalStats(null);
    setWrongQuestions([]);
    setShowMistakes(false);
    setAiExplanation(null);
    setLoadingExplanation(false);
    setIndex(0);
    setScore(0);
    setSelectedChoice(null);
    setSubmitted(false);
    setShowExplanation(false);
    prefetchedExplanations.current = {};
    sessionStartMs.current = Date.now();
  };

  const restartLearn = () => {
    setPracticeOnlyCardFronts(null);
    resetSession();
  };

  const restartWithMistakes = () => {
    const fronts = [...new Set(wrongQuestions.map((wq) => wq.cardFront).filter(Boolean))];
    setPracticeOnlyCardFronts(fronts);
    resetSession();
  };

  const continueLearn = () => {
    if (index === questions.length - 1) {
      // score state is already updated by submitChoice/handleDontKnow before this runs
      const finalCorrect = score;
      const finalTotal = questions.length;
      onSessionSave(
        buildStudySession(
          set.id,
          "learn",
          startedAt,
          finalTotal,
          Math.round((finalCorrect / Math.max(finalTotal, 1)) * 100),
        ),
      );
      setFinalStats({ correct: finalCorrect, total: finalTotal, durationMs: Date.now() - sessionStartMs.current });
      setCompleted(true);
      if (finalCorrect === finalTotal) triggerCelebration();
      return;
    }
    setIndex((current) => current + 1);
    setSelectedChoice(null);
    setSubmitted(false);
    setShowExplanation(false);
    setAiExplanation(null);
    setLoadingExplanation(false);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (completed) return;
      if (submitted) {
        // After answering: Enter or Space continues to next question
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          continueLearn();
        }
      } else {
        // Before answering: 1–4 selects and immediately submits that choice
        const num = parseInt(event.key, 10);
        if (num >= 1 && num <= 4) {
          const q = questions[index];
          if (!q) return;
          const ch = q.type === "true_false"
            ? ["True", "False"]
            : (enhancedChoices[q.id] ?? q.choices ?? []);
          if (num <= ch.length) {
            event.preventDefault();
            submitChoice(ch[num - 1]);
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length, submitted, completed, index, selectedIsCorrect, score, enhancedChoices]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === panelRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    const mcQuestions = questions.filter((mq) => mq.type === "multiple_choice");
    if (mcQuestions.length === 0) return;
    fetch("/api/study/generate-distractors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questions: mcQuestions.map((mq) => ({
          id: mq.id,
          prompt: stripQuestionPrompt(mq.prompt),
          correctAnswer: String(mq.correctAnswer),
          topic: mq.topic || "",
        })),
      }),
    })
      .then((r) => r.json())
      .then((payload) => {
        if (!Array.isArray(payload.distractors)) return;
        const map: Record<string, string[]> = {};
        for (const item of payload.distractors) {
          if (item.id && Array.isArray(item.choices)) {
            const src = mcQuestions.find((mq) => mq.id === item.id);
            if (!src) continue;
            const all = [String(src.correctAnswer), ...item.choices.slice(0, 3)];
            for (let i = all.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [all[i], all[j]] = [all[j], all[i]];
            }
            map[item.id] = all;
          }
        }
        setEnhancedChoices(map);
      })
      .catch(() => {});
  }, [questions]);

  const toggleFullscreen = async () => {
    if (!panelRef.current) return;
    if (document.fullscreenElement === panelRef.current) {
      await document.exitFullscreen?.();
      return;
    }
    await panelRef.current.requestFullscreen?.();
  };

  const q = question ?? questions[0];
  const choices = q
    ? (q.type === "true_false" ? ["True", "False"] : (enhancedChoices[q.id] ?? q.choices ?? []))
    : [];
  const currentCard = q
    ? (set.cards.find((card) => stripQuestionPrompt(q.prompt).includes(card.front) || q.prompt.includes(card.front)) ?? set.cards[index])
    : undefined;

  // Pre-fetch explanation the moment a question appears (before the user answers).
  // The result is cached in a ref so that when they submit, "Explain this" is
  // already ready with no "Preparing…" delay.
  useEffect(() => {
    const currentQ = questions[index];
    if (!currentQ) return;
    // Already cached for this index — nothing to do
    if (prefetchedExplanations.current[index] !== undefined) return;
    let cancelled = false;
    fetch("/api/study/explain-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: stripQuestionPrompt(currentQ.prompt),
        correctAnswer: String(currentQ.correctAnswer),
        userAnswer: "",   // unknown yet — explanation is about the correct answer
        topic: currentQ.topic,
      }),
    })
      .then((r) => r.json())
      .then((payload) => {
        if (!cancelled) {
          prefetchedExplanations.current[index] = payload.explanation || currentQ.explanation || "";
          // If the user has already submitted by the time the fetch completes, populate immediately
          setAiExplanation((prev) => prev ?? prefetchedExplanations.current[index] ?? null);
          setLoadingExplanation(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          prefetchedExplanations.current[index] = currentQ.explanation || "Could not load explanation.";
          setAiExplanation((prev) => prev ?? prefetchedExplanations.current[index] ?? null);
          setLoadingExplanation(false);
        }
      });
    return () => { cancelled = true; };
  }, [index, questions]);

  if (!question && !completed) {
    return <EmptyModeState title="No cards available to learn right now." onBack={onBack} />;
  }

  const handleExplainThis = () => {
    if (showExplanation) {
      setShowExplanation(false);
      return;
    }
    // Pull from cache immediately — prefetch started as soon as the question loaded
    const cached = prefetchedExplanations.current[index];
    if (cached !== undefined) {
      setAiExplanation(cached);
      setLoadingExplanation(false);
    } else {
      // Fetch not done yet (very fast answer) — show loading and wait
      setLoadingExplanation(true);
    }
    setShowExplanation(true);
  };

  const handleDontKnow = () => {
    if (submitted) return;
    setSubmitted(true);
    setSelectedChoice(null);
    if (currentCard) onProgress(currentCard.id, "missed");
    setWrongQuestions((prev) => [
      ...prev,
      { prompt: stripQuestionPrompt(q.prompt), correctAnswerText: String(q.correctAnswer), userAnswer: null, cardFront: currentCard?.front ?? stripQuestionPrompt(q.prompt) },
    ]);
  };

  const playCorrectSound = () => {
    try {
      type AnyWindow = typeof window & { webkitAudioContext?: typeof AudioContext };
      const AudioCtx = window.AudioContext || (window as AnyWindow).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      // Two-note ascending bling: E5 → B5
      const notes = [659.25, 987.77];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.11;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.16, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t);
        osc.stop(t + 0.22);
      });
    } catch {
      // AudioContext not available — silent fail
    }
  };

  const submitChoice = (choice: string) => {
    if (submitted) return;
    setSelectedChoice(choice);
    setSubmitted(true);

    const normalizedChoice = q.type === "true_false" ? choice.toLowerCase() : choice;
    const isCorrect = normalizedChoice === String(q.correctAnswer);
    if (currentCard) {
      onProgress(currentCard.id, isCorrect ? "knew" : "missed");
    }
    if (isCorrect) {
      playCorrectSound();
      setScore((current) => current + 1);
      onCelebrate("Nice. Keep going.");
    } else {
      setWrongQuestions((prev) => [
        ...prev,
        { prompt: stripQuestionPrompt(q.prompt), correctAnswerText: String(q.correctAnswer), userAnswer: choice, cardFront: currentCard?.front ?? stripQuestionPrompt(q.prompt) },
      ]);
    }
  };

  return (
    <div
      ref={panelRef}
      className={`study-appear mx-auto max-w-310 ${isFullscreen ? "study-flashcards-fullscreen min-h-screen overflow-auto p-8" : ""}`}
    >
      {/* Shared header — always visible */}
      <div className={`flex items-center justify-between gap-4 ${isFullscreen && !completed ? "pt-[8vh]" : ""}`}>
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/6 text-zinc-200"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-sm font-semibold text-white">
            {practiceOnlyCardFronts ? "Practice Mistakes" : "Learn"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/6 text-zinc-200 transition hover:bg-white/12"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button onClick={onBack} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/6 text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {completed && finalStats ? (
        /* ── COMPLETION SUMMARY ── */
        (() => {
          const pct = Math.round((finalStats.correct / Math.max(finalStats.total, 1)) * 100);
          const wrong = finalStats.total - finalStats.correct;
          const mins = Math.floor(finalStats.durationMs / 60000);
          const secs = Math.floor((finalStats.durationMs % 60000) / 1000);
          const timeLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
          const grade = pct >= 90 ? { label: "Excellent!", color: "text-emerald-300", ring: "ring-emerald-400/40", bg: "bg-emerald-500/10" }
            : pct >= 70 ? { label: "Good job!", color: "text-sky-300", ring: "ring-sky-400/40", bg: "bg-sky-500/10" }
            : pct >= 50 ? { label: "Keep it up!", color: "text-amber-300", ring: "ring-amber-400/40", bg: "bg-amber-500/10" }
            : { label: "Keep practicing!", color: "text-rose-300", ring: "ring-rose-400/40", bg: "bg-rose-500/10" };
          return (
            <div className="relative mx-auto mt-8 flex max-w-170 flex-col items-center gap-8 px-4 pb-12">
              {pct === 100 ? (
                <div className="pointer-events-none absolute inset-x-0 top-0 h-48 overflow-hidden">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <span
                      key={i}
                      className="study-confetti-piece absolute top-2 h-3 w-2 rounded-full"
                      style={{
                        left: `${4 + i * 4}%`,
                        background: i % 4 === 0 ? "#34d399" : i % 4 === 1 ? "#60a5fa" : i % 4 === 2 ? "#fbbf24" : "#f87171",
                        animationDelay: `${i * 40}ms`,
                      }}
                    />
                  ))}
                </div>
              ) : null}
              <div className={`flex h-20 w-20 items-center justify-center rounded-full ring-4 ${grade.ring} ${grade.bg}`}>
                <span className="text-4xl">{pct === 100 ? "🎉" : pct >= 90 ? "🏆" : pct >= 70 ? "⭐" : pct >= 50 ? "💪" : "📖"}</span>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold tracking-tight ${grade.color}`}>{grade.label}</div>
                <div className="mt-1 text-sm text-zinc-400">
                  {practiceOnlyCardFronts
                    ? `Practiced ${finalStats.total} mistake${finalStats.total !== 1 ? "s" : ""} from `
                    : "You finished learning "}
                  <span className="font-semibold text-zinc-200">{set.title}</span>
                </div>
              </div>
              <div className="relative flex h-36 w-36 items-center justify-center">
                <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
                  <circle cx="60" cy="60" r="52" fill="none"
                    stroke={pct >= 70 ? "#34d399" : pct >= 50 ? "#fbbf24" : "#f87171"}
                    strokeWidth="10" strokeDasharray={`${(pct / 100) * 326.7} 326.7`} strokeLinecap="round"
                  />
                </svg>
                <div className="text-center">
                  <div className="text-4xl font-bold text-white">{pct}%</div>
                  <div className="text-xs text-zinc-400">accuracy</div>
                </div>
              </div>
              <div className="flex w-full gap-4">
                {[
                  { value: finalStats.correct, label: "Correct", color: "text-emerald-300" },
                  { value: wrong, label: "Incorrect", color: "text-rose-300" },
                  { value: finalStats.total, label: "Total", color: "text-zinc-100" },
                  { value: timeLabel, label: "Time", color: "text-zinc-100" },
                ].map((stat) => (
                  <div key={stat.label} className="flex flex-1 flex-col items-center gap-1 rounded-[1.1rem] border border-white/10 bg-white/4 px-4 py-4">
                    <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                    <div className="text-xs font-medium text-zinc-400">{stat.label}</div>
                  </div>
                ))}
              </div>
              {wrongQuestions.length > 0 ? (
                <div className="w-full">
                  <button
                    onClick={() => setShowMistakes((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-[1.1rem] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/15"
                  >
                    <span>{wrongQuestions.length} mistake{wrongQuestions.length !== 1 ? "s" : ""} — review them</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${showMistakes ? "rotate-180" : ""}`} />
                  </button>
                  {showMistakes ? (
                    <div className="mt-2 space-y-2">
                      {wrongQuestions.map((item, i) => (
                        <div key={i} className="rounded-2xl border border-white/10 bg-white/3 px-4 py-3">
                          <div className="text-sm font-medium text-zinc-200">{item.prompt}</div>
                          {item.userAnswer
                            ? <div className="mt-1 text-xs text-rose-400">Your answer: {item.userAnswer}</div>
                            : <div className="mt-1 text-xs text-zinc-500">You skipped this one</div>}
                          <div className="mt-1 text-xs text-emerald-400">Correct: {item.correctAnswerText}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                practiceOnlyCardFronts ? (
                  <div className="w-full rounded-[1.1rem] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-center text-sm font-semibold text-emerald-300">
                    All mistakes cleared! 🎉
                  </div>
                ) : null
              )}
              <div className="flex w-full flex-col gap-3">
                {wrongQuestions.length > 0 ? (
                  <button
                    onClick={restartWithMistakes}
                    className="w-full rounded-full bg-rose-500 py-3.5 text-sm font-semibold text-white transition hover:bg-rose-600"
                  >
                    Practice {wrongQuestions.length} mistake{wrongQuestions.length !== 1 ? "s" : ""}
                  </button>
                ) : null}
                <button
                  onClick={restartLearn}
                  className="w-full rounded-full bg-[#5561ff] py-3.5 text-sm font-semibold text-white transition hover:bg-[#4450ee]"
                >
                  Study all again
                </button>
                <button
                  onClick={onBack}
                  className="w-full rounded-full border border-white/10 bg-white/6 py-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
                >
                  Back to set
                </button>
              </div>
            </div>
          );
        })()
      ) : q ? (
        /* ── ACTIVE QUESTION ── */
        <div className={`mt-6 space-y-6 ${isFullscreen ? "pt-[4vh]" : ""}`}>
          {(() => {
            const progressT = Math.min(1, (index + (submitted ? 1 : 0)) / Math.max(questions.length, 1));
            const cr = Math.round(85 + (16 - 85) * progressT);
            const cg = Math.round(97 + (185 - 97) * progressT);
            const cb = Math.round(255 + (129 - 255) * progressT);
            const progressColor = `rgb(${cr},${cg},${cb})`;
            return (
              <div className="flex items-center gap-1.5">
                <div className="flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold text-white transition-all duration-500" style={{ backgroundColor: progressColor }}>
                  {score}
                </div>
                {Array.from({ length: 6 }).map((_, segmentIndex) => {
                  const fill = Math.min(1, Math.max(0, (progressT * 6) - segmentIndex));
                  return (
                    <div key={segmentIndex} className="h-3 flex-1 overflow-hidden rounded-full bg-white/12">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${fill * 100}%`, backgroundColor: progressColor }} />
                    </div>
                  );
                })}
                <div className="flex h-8 min-w-10 items-center justify-center rounded-full bg-white/10 px-2 text-xs font-semibold text-zinc-200">
                  {questions.length}
                </div>
              </div>
            );
          })()}

          <div className="mx-auto w-full max-w-245 rounded-[1.6rem] border border-[#515b84] bg-[#394264] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)] sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                <span>Term</span>
                <button
                  type="button"
                  aria-label="Read question aloud"
                  onClick={() => speakEnglish(stripQuestionPrompt(q.prompt))}
                  className="rounded-full p-0.5 text-zinc-400 transition hover:text-zinc-100"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="text-xs text-zinc-400">{index + 1} of {questions.length}</div>
            </div>
            <div className="mt-8 min-h-27.5 text-[2rem] leading-[1.2] font-medium tracking-[-0.03em] text-white">
              {stripQuestionPrompt(q.prompt)}
            </div>
            {submitted ? (
              <div className={`mt-8 text-sm font-semibold ${selectedIsCorrect ? "text-emerald-300" : "text-amber-300"}`}>
                {selectedIsCorrect
                  ? (["Nice, you got it!", "Correct! Keep it up.", "That's the one!", "Nailed it.", "Right on."] as const)[index % 5]
                  : (["Not quite — check the answer below.", "Keep going, you're building it.", "Almost! Review it and move on.", "That one's tricky — it'll stick next time.", "Wrong this time, but you'll get it."] as const)[index % 5]}
              </div>
            ) : null}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {choices.map((choice, choiceIndex) => {
                const normalizedChoice = q.type === "true_false" ? choice.toLowerCase() : choice;
                const isSelected = selectedChoice === choice;
                const isCorrect = normalizedChoice === String(q.correctAnswer);
                const tone = submitted
                  ? isCorrect ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-100"
                    : isSelected ? "border-amber-400/70 bg-amber-500/10 text-amber-100"
                    : "border-white/10 bg-[#3f496f] text-zinc-300"
                  : "border-white/10 bg-[#3f496f] text-zinc-200 hover:bg-[#465178]";
                return (
                  <button key={choice} onClick={() => submitChoice(choice)} className={`flex items-start gap-3 rounded-[0.95rem] border px-4 py-4 text-left text-sm font-medium transition ${tone}`}>
                    <span className="mt-0.5 w-4 shrink-0 text-zinc-400">{choiceIndex + 1}</span>
                    <span>{choice}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-5 flex items-center justify-between gap-4">
              <button onClick={handleDontKnow} disabled={submitted} className={`text-xs font-medium transition ${submitted ? "cursor-default text-zinc-600" : "text-zinc-400 hover:text-zinc-200"}`}>
                Don&apos;t know?
              </button>
              {submitted ? (
                <div className="flex items-center gap-3">
                  <button onClick={handleExplainThis} className="rounded-full bg-white/12 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/18">
                    {showExplanation ? "Hide" : loadingExplanation ? "Preparing…" : "Explain this"}
                  </button>
                  <button onClick={continueLearn} className="rounded-full bg-[#5561ff] px-5 py-3 text-sm font-semibold text-white">
                    Continue
                  </button>
                </div>
              ) : (
                <div className="text-xs font-medium text-zinc-400">Choose the correct answer</div>
              )}
            </div>
            {showExplanation ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-[#313858] px-4 py-3 text-sm leading-6 text-zinc-200">
                {loadingExplanation ? <span className="text-zinc-400">Getting explanation from AI…</span> : (aiExplanation || q.explanation)}
              </div>
            ) : null}
          </div>

          {(() => {
            const liveAccuracy = Math.round((score / Math.max(index + Number(submitted), 1)) * 100) || 0;
            const accColor = liveAccuracy >= 80 ? "#4ade80" : liveAccuracy >= 60 ? "#fbbf24" : liveAccuracy >= 40 ? "#fb923c" : "#f87171";
            return (
              <div className="mx-auto flex w-full max-w-245 items-center justify-between px-2 text-sm text-zinc-300">
                <div>Click the correct answer or press any key to continue</div>
                <div className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-xs font-semibold transition-colors" style={{ color: accColor }}>
                  {liveAccuracy}% correct
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}

function AssessmentMode({
  title,
  set,
  onBack,
  onProgress,
  onSessionSave,
  onResultSave,
  onCelebrate,
}: {
  title: string;
  set: StudySet;
  onBack: () => void;
  onProgress: (cardId: string, result: "correct" | "wrong") => void;
  onSessionSave: (session: ReturnType<typeof buildStudySession>) => void;
  onResultSave: (result: QuizResult) => void;
  onCelebrate: (message: string) => void;
}) {
  const [startedAt] = useState(() => new Date().toISOString());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [explanation, setExplanation] = useState<string>("");
  const [perfectBurst, setPerfectBurst] = useState(false);
  const [setupOpen, setSetupOpen] = useState(true);
  const [questionCount, setQuestionCount] = useState(() => Math.max(1, set.cards.length));
  const [answerWith, setAnswerWith] = useState<"term" | "definition" | "both">("both");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTestMistakes, setShowTestMistakes] = useState(false);
  const [enhancedChoices, setEnhancedChoices] = useState<Record<string, string[]>>({});
  const testPanelRef = useRef<HTMLDivElement | null>(null);
  const questionCardRefs = useRef<(HTMLDivElement | null)[]>([]);
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

  const toggleSetupType = (key: keyof typeof enabledTypes) => {
    setEnabledTypes((current) => {
      const next = { ...current, [key]: !current[key] };
      return Object.values(next).some(Boolean) ? next : current;
    });
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === testPanelRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    const mcQuestions = questions.filter((mq) => mq.type === "multiple_choice");
    if (mcQuestions.length === 0) return;
    fetch("/api/study/generate-distractors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questions: mcQuestions.map((mq) => ({
          id: mq.id,
          prompt: stripQuestionPrompt(mq.prompt),
          correctAnswer: String(mq.correctAnswer),
          topic: mq.topic || "",
        })),
      }),
    })
      .then((r) => r.json())
      .then((payload) => {
        if (!Array.isArray(payload.distractors)) return;
        const map: Record<string, string[]> = {};
        for (const item of payload.distractors) {
          if (item.id && Array.isArray(item.choices)) {
            const src = mcQuestions.find((mq) => mq.id === item.id);
            if (!src) continue;
            const all = [String(src.correctAnswer), ...item.choices.slice(0, 3)];
            for (let i = all.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [all[i], all[j]] = [all[j], all[i]];
            }
            map[item.id] = all;
          }
        }
        setEnhancedChoices(map);
      })
      .catch(() => {});
  }, [questions]);

  if (!questions.length) {
    return <EmptyModeState title="Not enough material to generate this assessment yet." onBack={onBack} />;
  }

  const toggleTestFullscreen = async () => {
    if (!testPanelRef.current) return;
    if (document.fullscreenElement === testPanelRef.current) {
      await document.exitFullscreen?.();
      return;
    }
    await testPanelRef.current.requestFullscreen?.();
  };

  const scrollQuestionIntoView = (element: HTMLDivElement | null) => {
    if (!element) return;

    const fullscreenContainer = document.fullscreenElement === testPanelRef.current ? testPanelRef.current : null;
    const elementRect = element.getBoundingClientRect();
    const visualAnchor = 0.42;

    if (fullscreenContainer) {
      const containerRect = fullscreenContainer.getBoundingClientRect();
      const nextTop = fullscreenContainer.scrollTop
        + (elementRect.top - containerRect.top)
        - (fullscreenContainer.clientHeight * visualAnchor - elementRect.height / 2);

      fullscreenContainer.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
      return;
    }

    const nextTop = window.scrollY + elementRect.top - (window.innerHeight * visualAnchor - elementRect.height / 2);
    window.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
  };

  // Auto-scroll to next question after picking an MC/TF answer
  const handleSelectAnswer = (questionId: string, value: string, questionIndex: number) => {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    if (questionIndex < questions.length - 1) {
      window.setTimeout(() => {
        scrollQuestionIntoView(questionCardRefs.current[questionIndex + 1]);
      }, 160);
    }
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
    if (percentCorrect === 100) triggerCelebration();
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
            <div className="study-premium-card rounded-3xl p-6">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">Final score</div>
              <div className="mt-3 text-6xl font-black tracking-[-0.05em] text-white">{percent}%</div>
              <div className="mt-3 text-sm text-zinc-400">
                {correctCount} / {questions.length} correct
              </div>
              <div className="mt-4 rounded-2xl border border-emerald-400/16 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-100">
                {percent === 100
                  ? "Perfect score! Absolutely flawless — you nailed every single one."
                  : percent >= 90
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
            <div className="space-y-4">
              <div className="study-premium-card rounded-3xl p-6">
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
                          <div className="h-2 rounded-full bg-linear-to-r from-red-500 via-amber-400 to-emerald-400" style={{ width: `${accuracy}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {incorrectQuestions.length > 0 ? (
                <div className="study-premium-card rounded-3xl p-6">
                  <button
                    onClick={() => setShowTestMistakes((prev) => !prev)}
                    className="flex w-full items-center justify-between"
                  >
                    <div className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500">
                      {incorrectQuestions.length} mistake{incorrectQuestions.length !== 1 ? "s" : ""}
                    </div>
                    <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${showTestMistakes ? "rotate-180" : ""}`} />
                  </button>
                  {showTestMistakes ? (
                    <div className="mt-4 space-y-3">
                      {incorrectQuestions.map((quizQuestion) => (
                        <div key={quizQuestion.id} className="rounded-[0.9rem] border border-white/10 bg-white/4 px-4 py-3">
                          <div className="text-sm font-medium text-zinc-200">{stripQuestionPrompt(quizQuestion.prompt)}</div>
                          {answers[quizQuestion.id] ? (
                            <div className="mt-1 text-xs text-rose-400">Your answer: {answers[quizQuestion.id]}</div>
                          ) : (
                            <div className="mt-1 text-xs text-zinc-500">No answer given</div>
                          )}
                          <div className="mt-1 text-xs text-emerald-400">
                            Correct: {Array.isArray(quizQuestion.correctAnswer) ? quizQuestion.correctAnswer.join(", ") : String(quizQuestion.correctAnswer)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const answeredCount = Object.values(answers).filter(Boolean).length;

  return (
      <div ref={testPanelRef} className={`study-appear space-y-5 ${isFullscreen ? "study-flashcards-fullscreen min-h-screen overflow-auto p-8" : ""}`}>
      <div className="mx-auto flex w-full max-w-310 items-center justify-between gap-4 text-zinc-200">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            {...magneticHoverProps}
            className="study-premium-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/4"
            aria-label="Back to set"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-sm font-semibold text-white">{title}</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-semibold text-white">{answeredCount} / {questions.length} answered</div>
          <div className="text-xs text-zinc-500">{set.title}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSetupOpen(true)}
            {...magneticHoverProps}
            className="study-premium-button rounded-full border border-white/10 bg-white/4 px-4 py-2 text-xs font-semibold text-zinc-100"
          >
            Options
          </button>
          <button
            onClick={toggleTestFullscreen}
            aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
            {...magneticHoverProps}
            className="study-premium-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/4"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <Link href="/study" {...magneticHoverProps} className="study-premium-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/4">
            <Layers3 className="h-4.5 w-4.5" />
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-245 space-y-24 sm:space-y-32">
        {questions.map((q, qIndex) => {
          const isMC = q.type === "multiple_choice" || q.type === "true_false";
          const isWritten = q.type === "short_answer" || q.type === "fill_blank" || q.type === "written";
          const choices = q.type === "true_false" ? ["True", "False"] : (enhancedChoices[q.id] ?? q.choices ?? []);
          const selectedValue = answers[q.id];

          return (
            <div
              key={q.id}
              ref={(el) => { questionCardRefs.current[qIndex] = el; }}
              className="rounded-[1.6rem] border border-[#515b84] bg-[#394264] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)] sm:p-7"
            >
              {/* Question header */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                  <span>{q.topic || "Term"}</span>
                  <button
                    type="button"
                    aria-label="Read question aloud"
                    onClick={() => speakEnglish(stripQuestionPrompt(q.prompt))}
                    className="rounded-full p-0.5 text-zinc-400 transition hover:text-zinc-100"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="text-xs text-zinc-400">{qIndex + 1} of {questions.length}</div>
              </div>

              {/* Question prompt */}
              <div className="mt-7 text-[1.75rem] leading-[1.18] font-medium tracking-[-0.04em] text-white">
                {q.prompt}
              </div>

              {/* Answer section */}
              <div className="mt-8">
                {isMC && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {choices.map((choice, choiceIndex) => {
                      const normalizedChoice = q.type === "true_false" ? choice.toLowerCase() : choice;
                      const isSelected = selectedValue === normalizedChoice;
                      return (
                        <button
                          key={choice}
                          onClick={() => handleSelectAnswer(q.id, normalizedChoice, qIndex)}
                          {...magneticHoverProps}
                          className={`study-premium-button flex items-start gap-3 rounded-[0.95rem] border px-4 py-4 text-left text-sm transition ${
                            isSelected
                              ? "border-indigo-300/60 bg-indigo-500/20 text-white"
                              : "border-white/10 bg-[#394264] text-zinc-200 hover:bg-[#434d74]"
                          }`}
                        >
                          <span className={`mt-0.5 w-4 shrink-0 text-sm ${isSelected ? "text-indigo-300" : "text-zinc-500"}`}>
                            {q.type === "multiple_choice" ? choiceIndex + 1 : ""}
                          </span>
                          <span>{choice}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {isWritten && (
                  <textarea
                    value={answers[q.id] || ""}
                    onChange={(event) => setAnswers((current) => ({ ...current, [q.id]: event.target.value }))}
                    rows={q.type === "written" ? 6 : 4}
                    placeholder={q.type === "written" ? "Write your answer…" : "Type your answer…"}
                    className="study-premium-input w-full rounded-[0.95rem] border border-white/10 bg-[#394264] px-4 py-3 text-base leading-7 text-white outline-none placeholder:text-zinc-500"
                  />
                )}
              </div>

              {/* Answered indicator */}
              <div className="mt-4 text-xs font-medium text-zinc-500">
                {selectedValue
                  ? <span className="text-indigo-300">Answer saved ✓</span>
                  : isWritten
                    ? "Write your best answer"
                    : "Pick the best option"}
              </div>
            </div>
          );
        })}

        {/* Submit button */}
        <div className="flex items-center justify-between rounded-[1.4rem] border border-white/8 bg-white/3 px-6 py-5">
          <div className="text-sm text-zinc-400">
            {answeredCount < questions.length
              ? `${questions.length - answeredCount} question${questions.length - answeredCount !== 1 ? "s" : ""} unanswered`
              : "All questions answered — ready to submit!"}
          </div>
          <button
            onClick={() => void finishAssessment()}
            {...magneticHoverProps}
            className="study-premium-button rounded-2xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
          >
            Submit test
          </button>
        </div>
      </div>

      {setupOpen ? (
        <div className="fixed inset-0 z-80 flex items-start justify-center bg-black/20 px-4 pt-16 backdrop-blur-[2px]">
          <div className="w-full max-w-115 rounded-[1.55rem] border border-[#2f3761] bg-[#151137] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-zinc-300">{set.title}</div>
                <h3 className="mt-2 text-[2rem] font-bold leading-none tracking-[-0.04em] text-white">Set up your test</h3>
              </div>
              <button
                onClick={() => setSetupOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/4 text-zinc-300"
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
                  max={Math.max(1, set.cards.length)}
                  value={questionCount}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    setQuestionCount(Math.max(1, Math.min(Math.max(1, set.cards.length), Number.isFinite(nextValue) ? nextValue : set.cards.length)));
                    setAnswers({});
                  }}
                  className="study-premium-input w-20 rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none"
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <label className="text-sm font-medium text-zinc-200">Answer with</label>
                <select
                  value={answerWith}
                  onChange={(event) => setAnswerWith(event.target.value as typeof answerWith)}
                  className="study-premium-input rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-sm text-white outline-none"
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
  const [sourceCards, setSourceCards] = useState<StudyCard[]>(() => {
    // Pick a random subset of up to 6 cards from the full set on first render
    const shuffled = [...set.cards].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  });
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
  const [isNewBest, setIsNewBest] = useState(false);
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
    if (matched.includes(id)) return;
    // If already selected, clicking again deselects it
    if (selected.includes(id)) {
      setSelected((prev) => prev.filter((s) => s !== id));
      return;
    }
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
    // Guard: only process completion once (completedMs === null means not yet processed)
    if (!startedAt || !isComplete || completedMs !== null) return;
    const finalMs = new Date().getTime() - new Date(startedAt).getTime();
    setCompletedMs(finalMs);
    onSessionSave(buildStudySession(set.id, "match", startedAt, sourceCards.length, 100));
    const newBest = bestMs == null || finalMs < bestMs;
    if (newBest) {
      setIsNewBest(true);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedMs, isComplete, startedAt]);

  const restartMatch = () => {
    // Always pick a fresh set of cards so replaying never shows the exact same round.
    let newCards: StudyCard[];

    if (set.cards.length <= 6) {
      // Small set – we can't change which cards appear, so just reshuffle positions.
      newCards = [...set.cards].sort(() => Math.random() - 0.5);
    } else {
      const prevIds = new Set(sourceCards.map(c => c.id));
      const unusedCards = set.cards.filter(c => !prevIds.has(c.id));

      if (unusedCards.length >= 6) {
        // Enough fresh cards for a completely new round.
        newCards = [...unusedCards].sort(() => Math.random() - 0.5).slice(0, 6);
      } else if (unusedCards.length > 0) {
        // Mix: put all new cards in first, then pad with random previous cards.
        const shuffledUnused = [...unusedCards].sort(() => Math.random() - 0.5);
        const shuffledPrev   = [...sourceCards].sort(() => Math.random() - 0.5);
        newCards = [...shuffledUnused, ...shuffledPrev].slice(0, 6);
      } else {
        // All cards have been seen – start a completely fresh random selection.
        newCards = [...set.cards].sort(() => Math.random() - 0.5).slice(0, 6);
      }
    }

    setSourceCards(newCards);
    setItems(shuffleForMatch(newCards));
    setSelected([]);
    setMatched([]);
    setStartedAt(null);
    setElapsedMs(0);
    setCompletedMs(null);
    setIsNewBest(false);
  };

  return (
    <div className="study-appear space-y-4">
      <div className="rounded-[1.65rem] border border-white/8 bg-[linear-gradient(180deg,rgba(11,14,32,0.96),rgba(10,13,27,0.94))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              {...magneticHoverProps}
              className="study-premium-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/4 text-zinc-100"
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

          <div className="rounded-full border border-white/10 bg-white/4 px-5 py-2 text-lg font-semibold tracking-[-0.03em] text-white">
            {startedAt ? formatMatchTime(completedMs ?? elapsedMs) : "0:00.0"}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={restartMatch}
              {...magneticHoverProps}
              className="study-premium-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/4 text-zinc-200"
              aria-label="Restart match"
              title="Restart"
            >
              <RotateCcw className="h-4.5 w-4.5" />
            </button>
            <Link
              href="/study"
              {...magneticHoverProps}
              className="study-premium-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/4 text-zinc-200"
              aria-label="Study home"
              title="Study home"
            >
              <Layers3 className="h-4.5 w-4.5" />
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/8 pt-4 text-sm text-zinc-400">
          <span>{matched.length / 2} / {sourceCards.length} solved</span>
          <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-xs font-semibold text-zinc-200">
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
        {isComplete && completedMs !== null ? (
          <div className="flex flex-col items-center gap-6 px-4 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/15">
              <CheckCircle2 className="h-8 w-8 text-emerald-300" />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-[-0.03em] text-white">All matched!</div>
              <div className="mt-1 text-sm text-zinc-400">{sourceCards.length} pairs · {set.title}</div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Your time</div>
                <div className="mt-1 text-3xl font-bold tracking-[-0.04em] text-white">{formatMatchTime(completedMs)}</div>
              </div>
              <div className={`rounded-2xl border px-6 py-4 text-center ${isNewBest ? "border-amber-400/30 bg-amber-500/10" : "border-white/10 bg-white/5"}`}>
                <div className={`text-xs font-semibold uppercase tracking-[0.14em] ${isNewBest ? "text-amber-400" : "text-zinc-500"}`}>
                  {isNewBest ? "🏆 New best!" : "Best time"}
                </div>
                <div className={`mt-1 text-3xl font-bold tracking-[-0.04em] ${isNewBest ? "text-amber-200" : "text-white"}`}>
                  {formatMatchTime(bestMs ?? completedMs)}
                </div>
              </div>
            </div>
            {!isNewBest && bestMs !== null && bestMs < completedMs && (
              <div className="text-sm text-zinc-400">
                Best is <span className="font-semibold text-zinc-200">{formatMatchTime(bestMs)}</span> — you were <span className="font-semibold text-zinc-200">{formatMatchTime(completedMs - bestMs)}</span> off
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={restartMatch}
                {...magneticHoverProps}
                className="study-premium-button inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-6 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-white/10"
              >
                <RotateCcw className="h-4 w-4" />
                Play again
              </button>
              <button
                onClick={onBack}
                {...magneticHoverProps}
                className="study-premium-button inline-flex items-center gap-2 rounded-full bg-[#5561ff] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#4a55f0]"
              >
                Back to set
              </button>
            </div>
          </div>
        ) : (
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
                  className={`study-premium-button min-h-44 rounded-[1.15rem] border p-6 text-center text-[1.05rem] font-medium leading-8 transition disabled:cursor-default ${
                    solved
                      ? "border-emerald-400/35 bg-emerald-500/16 text-emerald-50"
                      : active
                      ? "border-indigo-400/80 bg-[#4f46e5] text-white shadow-[0_16px_40px_rgba(99,102,241,0.40)] scale-[1.02]"
                      : "border-[#50597e] bg-[#394264] text-zinc-100 hover:bg-[#434d74]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ModeHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div className="study-premium-panel study-appear flex flex-col gap-4 rounded-[1.6rem] p-5 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
      <div>
        <button onClick={onBack} {...magneticHoverProps} className="study-premium-button mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-zinc-300 hover:text-white">
          <ChevronLeft className="h-4 w-4" />
          Back to set
        </button>
        <h2 className="text-3xl font-black tracking-[-0.05em] text-white">{title}</h2>
        {subtitle ? <p className="mt-2 text-sm leading-7 text-zinc-400">{subtitle}</p> : null}
      </div>
      <Link href="/study" {...magneticHoverProps} className="study-premium-button inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm font-semibold text-zinc-100">
        <Layers3 className="h-4 w-4" />
        Study home
      </Link>
    </div>
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
        <div className="rounded-2xl border border-white/8 bg-white/5 p-2.5 text-zinc-300 shadow-[0_10px_24px_rgba(2,6,23,0.12)]">
          {icon}
        </div>
      </div>
    </div>
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
          : "border border-white/10 bg-white/5 hover:bg-white/8"
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
            : "border-white/10 bg-white/5 text-red-400 hover:bg-red-500/12"
          : active
          ? "border-emerald-300/45 bg-emerald-500/22 text-emerald-100 shadow-[0_18px_45px_rgba(16,185,129,0.18)]"
          : "border-white/10 bg-white/5 text-emerald-400 hover:bg-emerald-500/12"
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
      <button onClick={onBack} {...magneticHoverProps} className="study-premium-button mt-5 rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm font-semibold text-zinc-100">
        Back to overview
      </button>
    </div>
  );
}

function StudyWorkspaceSkeleton() {
  return (
    <main className="min-h-screen bg-[#080d18] pb-20 text-white">
      <div className="mx-auto max-w-295 px-4 pb-16 pt-6 sm:px-6">
        <section className="study-premium-panel rounded-[1.75rem] p-5 backdrop-blur-xl md:p-6">
          <div className="study-skeleton h-6 w-40 rounded-full" />
          <div className="study-skeleton mt-5 h-16 max-w-3xl rounded-3xl" />
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
                <div className="study-skeleton h-40 rounded-3xl" />
                <div className="study-skeleton h-40 rounded-3xl" />
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
