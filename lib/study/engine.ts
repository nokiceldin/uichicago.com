import type {
  CardProgress,
  GeneratedExamPayload,
  GeneratedFlashcardPayload,
  QuizQuestion,
  QuizQuestionType,
  StudyCard,
  StudyDifficulty,
  StudyLibraryState,
  StudyMode,
  StudySessionRecord,
  StudySet,
} from "./types";

export function createStudyId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fuzzyMatch(input: string, accepted: string | string[]): boolean {
  const acceptedList = Array.isArray(accepted) ? accepted : [accepted];
  const normalizedInput = normalizeText(input);

  return acceptedList.some((entry) => {
    const normalizedAccepted = normalizeText(entry);
    if (!normalizedAccepted) return false;
    if (normalizedInput === normalizedAccepted) return true;
    if (normalizedAccepted.includes(normalizedInput) || normalizedInput.includes(normalizedAccepted)) return true;
    return levenshteinDistance(normalizedInput, normalizedAccepted) <= 2;
  });
}

export function buildQuestionBank(set: StudySet): QuizQuestion[] {
  const cards = [...set.cards].sort((a, b) => a.orderIndex - b.orderIndex);
  return cards.flatMap((card, index) => {
    const distractors = shuffleArray(
      Array.from(
        new Set(
          cards
            .filter((candidate) => candidate.id !== card.id)
            .map((candidate) => candidate.back.trim())
            .filter(Boolean),
        ),
      ),
    ).slice(0, 3);

    const mcChoices = shuffleArray(Array.from(new Set([card.back.trim(), ...distractors].filter(Boolean)))).slice(0, 4);
    const promptBase = card.front.endsWith("?") ? card.front : `What best matches: ${card.front}?`;

    const questionTypes: QuizQuestion[] = [];

    if (mcChoices.length >= 3) {
      questionTypes.push({
        id: createStudyId("mcq"),
        type: "multiple_choice",
        prompt: promptBase,
        choices: mcChoices,
        correctAnswer: card.back,
        explanation: `${card.front} maps to ${card.back}.`,
        difficulty: card.difficulty,
        topic: card.tags[0] || set.subject,
      });
    }

    questionTypes.push(
      {
        id: createStudyId("short"),
        type: "short_answer",
        prompt: `Type the definition for: ${card.front}`,
        correctAnswer: card.back,
        acceptedAnswers: [card.back],
        explanation: `${card.front} should be explained as ${card.back}.`,
        difficulty: card.difficulty,
        topic: card.tags[0] || set.subject,
      },
      {
        id: createStudyId("tf"),
        type: "true_false",
        prompt: `${card.front}: ${index % 2 === 0 ? card.back : distractors[0] || card.back}`,
        correctAnswer: index % 2 === 0 ? "true" : "false",
        explanation: index % 2 === 0 ? "This statement is correct." : `The correct answer is ${card.back}.`,
        difficulty: card.difficulty,
        topic: card.tags[0] || set.subject,
      },
      {
        id: createStudyId("blank"),
        type: "fill_blank",
        prompt: createFillBlankPrompt(card),
        correctAnswer: card.front,
        acceptedAnswers: [card.front],
        explanation: `The missing term is ${card.front}.`,
        difficulty: card.difficulty,
        topic: card.tags[0] || set.subject,
      },
    );

    return questionTypes;
  });
}

export function buildExam(set: StudySet, length = 12): GeneratedExamPayload {
  const bank = buildQuestionBank(set);
  const questions = shuffleArray(bank).slice(0, Math.min(length, bank.length));
  const total = questions.length || 1;
  const counts = {
    easy: questions.filter((q) => q.difficulty === "easy").length,
    medium: questions.filter((q) => q.difficulty === "medium").length,
    hard: questions.filter((q) => q.difficulty === "hard").length,
  };

  return {
    title: `${set.title} Practice Exam`,
    durationMinutes: Math.max(15, Math.round(questions.length * 1.5)),
    questions,
    topicsCovered: Array.from(new Set(questions.map((q) => q.topic))),
    difficultyMix: {
      easy: Math.round((counts.easy / total) * 100),
      medium: Math.round((counts.medium / total) * 100),
      hard: Math.round((counts.hard / total) * 100),
    },
  };
}

export function getDefaultProgress(cardId: string): CardProgress {
  return {
    cardId,
    masteryScore: 0,
    confidenceScore: 0,
    timesSeen: 0,
    timesCorrect: 0,
    timesWrong: 0,
    starred: false,
    markedDifficult: false,
  };
}

export function updateProgressForReview(
  current: CardProgress,
  result: "knew" | "missed" | "correct" | "wrong",
): CardProgress {
  const now = new Date();
  const base = { ...current };
  base.timesSeen += 1;
  base.lastReviewedAt = now.toISOString();
  base.missedRecently = result === "missed" || result === "wrong";

  if (result === "knew" || result === "correct") {
    base.timesCorrect += 1;
    base.masteryScore = Math.min(100, base.masteryScore + 16);
    base.confidenceScore = Math.min(100, base.confidenceScore + 12);
  } else {
    base.timesWrong += 1;
    base.masteryScore = Math.max(0, base.masteryScore - 12);
    base.confidenceScore = Math.max(0, base.confidenceScore - 8);
    base.markedDifficult = true;
  }

  base.nextReviewAt = new Date(now.getTime() + getReviewDelayMs(base)).toISOString();
  return base;
}

export function getRecommendedCards(set: StudySet, progressMap: Record<string, CardProgress>) {
  return [...set.cards]
    .sort((a, b) => {
      const aProgress = progressMap[a.id] ?? getDefaultProgress(a.id);
      const bProgress = progressMap[b.id] ?? getDefaultProgress(b.id);
      const aDue = aProgress.nextReviewAt ? new Date(aProgress.nextReviewAt).getTime() : 0;
      const bDue = bProgress.nextReviewAt ? new Date(bProgress.nextReviewAt).getTime() : 0;
      return aDue - bDue || aProgress.masteryScore - bProgress.masteryScore;
    });
}

export function computeStudyDashboard(library: StudyLibraryState) {
  const totalCards = library.sets.reduce((sum, set) => sum + set.cards.length, 0);
  const totalStudyTimeMs = library.sessions.reduce((sum, session) => sum + session.durationMs, 0);
  const cardsReviewed = library.sessions.reduce((sum, session) => sum + session.cardsReviewed, 0);
  const averageAccuracy =
    library.sessions.length > 0
      ? Math.round(library.sessions.reduce((sum, session) => sum + session.accuracy, 0) / library.sessions.length)
      : 0;
  const today = new Date().toDateString();
  const activeToday = new Set(
    library.sessions.filter((session) => new Date(session.endedAt).toDateString() === today).map((session) => session.setId),
  ).size;

  const weakestTopics = new Map<string, { wrong: number; seen: number }>();
  for (const set of library.sets) {
    const progressMap = library.progress[set.id] ?? {};
    for (const card of set.cards) {
      const entry = weakestTopics.get(card.tags[0] || set.subject) ?? { wrong: 0, seen: 0 };
      const progress = progressMap[card.id];
      if (progress) {
        entry.wrong += progress.timesWrong;
        entry.seen += progress.timesSeen;
      }
      weakestTopics.set(card.tags[0] || set.subject, entry);
    }
  }

  return {
    totalSets: library.sets.length,
    totalGroups: library.groups.length,
    totalCards,
    totalStudyTimeMinutes: Math.round(totalStudyTimeMs / 60000),
    cardsReviewed,
    averageAccuracy,
    activeToday,
    weakestTopics: [...weakestTopics.entries()]
      .map(([topic, stats]) => ({
        topic,
        ratio: stats.seen ? stats.wrong / stats.seen : 0,
      }))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 4),
  };
}

export function buildStudySession(
  setId: string,
  mode: StudyMode,
  startedAt: string,
  cardsReviewed: number,
  accuracy: number,
): StudySessionRecord {
  const endedAt = new Date().toISOString();
  return {
    id: createStudyId("session"),
    setId,
    mode,
    startedAt,
    endedAt,
    durationMs: new Date(endedAt).getTime() - new Date(startedAt).getTime(),
    accuracy,
    score: accuracy,
    cardsReviewed,
  };
}

export function materializeGeneratedStudySet(
  payload: GeneratedFlashcardPayload,
  input: {
    course?: string;
    subject?: string;
    difficulty?: "easy" | "medium" | "hard";
    description?: string;
  },
): StudySet {
  const now = new Date().toISOString();

  return {
    id: createStudyId("set"),
    title: payload.setTitle,
    description: input.description || "AI-generated study set",
    course: input.course || "",
    subject: input.subject || "General",
    tags: Array.from(new Set(payload.cards.flatMap((card) => card.tags))),
    difficulty: input.difficulty || "medium",
    visibility: "private",
    createdAt: now,
    updatedAt: now,
    cards: payload.cards.map((card, index) => ({
      id: createStudyId("card"),
      front: card.front,
      back: card.back,
      hint: card.hint || "",
      mnemonic: "",
      pronunciation: "",
      formula: "",
      example: "",
      imageFrontUrl: "",
      imageBackUrl: "",
      difficulty: card.difficulty,
      tags: card.tags,
      orderIndex: index,
    })),
  };
}

export function reorderCards(cards: StudyCard[], draggedId: string, targetId: string): StudyCard[] {
  const next = [...cards];
  const draggedIndex = next.findIndex((card) => card.id === draggedId);
  const targetIndex = next.findIndex((card) => card.id === targetId);
  if (draggedIndex === -1 || targetIndex === -1) return cards;
  const [dragged] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, dragged);
  return next.map((card, index) => ({ ...card, orderIndex: index }));
}

export function getQuestionTypeLabel(type: QuizQuestionType): string {
  return {
    multiple_choice: "Multiple choice",
    true_false: "True / false",
    short_answer: "Short answer",
    fill_blank: "Fill in the blank",
    matching: "Matching",
    written: "Written response",
  }[type];
}

function createFillBlankPrompt(card: StudyCard) {
  const words = card.front.split(" ");
  if (words.length <= 1) {
    return `Fill in the blank: ______ means ${card.back}`;
  }
  return `Fill in the blank: ${words.map((word, index) => (index === 0 ? "______" : word)).join(" ")} means ${card.back}`;
}

function getReviewDelayMs(progress: CardProgress): number {
  if (progress.timesWrong > progress.timesCorrect) return 1000 * 60 * 15;
  if (progress.masteryScore >= 80) return 1000 * 60 * 60 * 24 * 4;
  if (progress.masteryScore >= 55) return 1000 * 60 * 60 * 24;
  return 1000 * 60 * 60 * 6;
}

function shuffleArray<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}
