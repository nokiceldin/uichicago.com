import type {
  CardProgress,
  GeneratedExamPayload,
  GeneratedFlashcardPayload,
  QuizQuestion,
  QuizQuestionType,
  StudyCard,
  StudyLibraryState,
  StudyMode,
  StudySessionRecord,
  StudySet,
} from "./types";

export function createStudyId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

const MIN_DISTRACTOR_SCORE = 12;
const DISTRACTOR_TARGET_COUNT = 3;
const GENERIC_THROWAWAY_CHOICES = new Set([
  "all of the above",
  "none of the above",
  "both a and b",
  "both b and c",
  "a and b",
  "b and c",
]);

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
    const promptFront = getCardPromptFront(card, index);
    const distractors = buildDistractorsForCard(card, cards, set).slice(0, 3);
    const mcChoices = buildValidatedMultipleChoiceChoices({
      correctAnswer: card.back.trim(),
      prompt: promptFront,
      topic: card.tags[0] || set.subject,
      baselineChoices: distractors,
    });
    const promptBase = promptFront.endsWith("?") ? promptFront : `What best matches: ${promptFront}?`;

    const questionTypes: QuizQuestion[] = [];

    if (mcChoices.length >= 4) {
      questionTypes.push({
        id: createStudyId("mcq"),
        cardId: card.id,
        type: "multiple_choice",
        prompt: promptBase,
        choices: mcChoices,
        correctAnswer: card.back,
        explanation: `${promptFront} maps to ${card.back}.`,
        difficulty: card.difficulty,
        topic: card.tags[0] || set.subject,
      });
    }

    questionTypes.push(
      {
        id: createStudyId("short"),
        cardId: card.id,
        type: "short_answer",
        prompt: `Type the definition for: ${promptFront}`,
        correctAnswer: card.back,
        acceptedAnswers: [card.back],
        explanation: `${promptFront} should be explained as ${card.back}.`,
        difficulty: card.difficulty,
        topic: card.tags[0] || set.subject,
      },
      {
        id: createStudyId("tf"),
        cardId: card.id,
        type: "true_false",
        prompt: `${promptFront}: ${index % 2 === 0 ? card.back : distractors[0] || card.back}`,
        correctAnswer: index % 2 === 0 ? "true" : "false",
        explanation: index % 2 === 0 ? "This statement is correct." : `The correct answer is ${card.back}.`,
        difficulty: card.difficulty,
        topic: card.tags[0] || set.subject,
      },
      {
        id: createStudyId("blank"),
        cardId: card.id,
        type: "fill_blank",
        prompt: createFillBlankPrompt(card, promptFront),
        correctAnswer: promptFront,
        acceptedAnswers: [promptFront],
        explanation: `The missing term is ${promptFront}.`,
        difficulty: card.difficulty,
        topic: card.tags[0] || set.subject,
      },
    );

    return questionTypes;
  });
}

function buildDistractorsForCard(card: StudyCard, cards: StudyCard[], set: StudySet) {
  const correctAnswer = card.back.trim();
  const synthesized = buildStructuredAnswerDistractors(correctAnswer).map((answer) => ({
    answer,
    score: 100,
  }));
  const ranked = cards
    .filter((candidate) => candidate.id !== card.id)
    .map((candidate) => ({
      answer: candidate.back.trim(),
      score: scoreDistractorCandidate(card, candidate, set),
    }))
    .sort((a, b) => b.score - a.score)
    .filter(({ answer, score }) => score >= MIN_DISTRACTOR_SCORE && isUsableDistractorAnswer(answer, correctAnswer));

  return buildValidatedMultipleChoiceDistractors({
    correctAnswer,
    prompt: card.front,
    topic: card.tags[0] || set.subject,
    baselineChoices: [...synthesized, ...ranked].map(({ answer }) => answer),
  });
}

function scoreDistractorCandidate(card: StudyCard, candidate: StudyCard, set: StudySet) {
  const frontA = normalizeText(card.front);
  const frontB = normalizeText(candidate.front);
  const backA = normalizeText(card.back);
  const backB = normalizeText(candidate.back);

  const frontTokensA = tokenize(card.front);
  const frontTokensB = tokenize(candidate.front);
  const backTokensA = tokenize(card.back);
  const backTokensB = tokenize(candidate.back);

  const sharedFrontTokens = intersectionSize(frontTokensA, frontTokensB);
  const sharedBackTokens = intersectionSize(backTokensA, backTokensB);
  const commonLead = commonLeadLength(frontTokensA, frontTokensB);
  const answerLengthGap = Math.abs(backTokensA.length - backTokensB.length);
  const frontLengthGap = Math.abs(frontTokensA.length - frontTokensB.length);
  const tagOverlap = intersectionSize(card.tags, candidate.tags);
  const sameDifficulty = card.difficulty === candidate.difficulty ? 1 : 0;
  const sameSubjectSignal = card.tags[0] && set.subject && candidate.tags[0] === card.tags[0] ? 1 : 0;

  let score = 0;
  score += commonLead * 8;
  score += sharedFrontTokens * 5;
  score += sharedBackTokens * 2;
  score += tagOverlap * 6;
  score += sameDifficulty * 2;
  score += sameSubjectSignal * 2;
  score -= answerLengthGap * 0.8;
  score -= frontLengthGap * 0.5;

  if (frontA.startsWith("what happens during") && frontB.startsWith("what happens during")) score += 10;
  if (frontA.startsWith("what is the goal of") && frontB.startsWith("what is the goal of")) score += 10;
  if (frontA.startsWith("how does") && frontB.startsWith("how does")) score += 8;
  if (frontA.startsWith("what primers are used") && frontB.startsWith("what primers are used")) score += 8;
  if (frontA.startsWith("direction of") && frontB.startsWith("direction of")) score += 8;
  if (backA.includes("dna") && backB.includes("dna")) score += 4;

  return score;
}

function tokenize(value: string) {
  return normalizeText(value).split(" ").filter(Boolean);
}

function intersectionSize(a: string[], b: string[]) {
  const bSet = new Set(b);
  return Array.from(new Set(a)).filter((token) => bSet.has(token)).length;
}

function commonLeadLength(a: string[], b: string[]) {
  let count = 0;
  const length = Math.min(a.length, b.length);
  while (count < length && a[count] === b[count]) {
    count += 1;
  }
  return count;
}

function isUsableDistractorAnswer(answer: string, correctAnswer: string) {
  const trimmed = answer.trim();
  if (!trimmed) return false;
  if (trimmed === correctAnswer.trim()) return false;

  const normalizedAnswer = normalizeText(trimmed);
  const normalizedCorrect = normalizeText(correctAnswer);
  if (!normalizedAnswer || normalizedAnswer === normalizedCorrect) return false;

  const answerTokens = normalizedAnswer.split(" ").filter(Boolean);
  const correctTokens = normalizedCorrect.split(" ").filter(Boolean);

  if (answerTokens.length === 1 && answerTokens[0].length <= 2) return false;
  if (answerTokens.length === 1 && /^[a-d]$/i.test(answerTokens[0])) return false;

  const genericDirectionalAnswers = new Set(["left side", "right side", "top", "bottom", "inside", "outside"]);
  if (genericDirectionalAnswers.has(normalizedAnswer) && !genericDirectionalAnswers.has(normalizedCorrect)) return false;

  const tokenGap = Math.abs(answerTokens.length - correctTokens.length);
  if (tokenGap > Math.max(3, Math.ceil(correctTokens.length * 0.75))) return false;

  if (/\d/.test(normalizedCorrect) !== /\d/.test(normalizedAnswer)) return false;

  return true;
}

function buildStructuredAnswerDistractors(correctAnswer: string) {
  const distractors: string[] = [];

  const leftRightPattern = /^(Left|Right) ([A-Za-z]+) and (left|right) ([A-Za-z]+) \(([IVX]+) & ([IVX]+)\)$/i;
  const leftRightMatch = correctAnswer.trim().match(leftRightPattern);
  if (leftRightMatch) {
    const [, firstSide, firstNoun, secondSideRaw, secondNoun, firstRoman, secondRoman] = leftRightMatch;
    const secondSide = secondSideRaw[0].toUpperCase() + secondSideRaw.slice(1).toLowerCase();
    const flip = (side: string) => (side.toLowerCase() === "left" ? "Right" : "Left");
    const firstFlipped = flip(firstSide);
    const secondFlipped = flip(secondSide);

    distractors.push(
      `${firstFlipped} ${firstNoun} and ${secondFlipped.toLowerCase()} ${secondNoun} (${swapRomanSide(firstRoman)} & ${swapRomanSide(secondRoman)})`,
      `${firstSide} ${firstNoun} and ${secondFlipped.toLowerCase()} ${secondNoun} (${firstRoman} & ${swapRomanSide(secondRoman)})`,
      `${firstFlipped} ${firstNoun} and ${secondSide.toLowerCase()} ${secondNoun} (${swapRomanSide(firstRoman)} & ${secondRoman})`,
    );
  }

  return distractors.filter((answer) => isUsableDistractorAnswer(answer, correctAnswer));
}

function swapRomanSide(value: string) {
  const map: Record<string, string> = {
    I: "II",
    II: "I",
    III: "IV",
    IV: "III",
  };
  return map[value] || value;
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

export function buildValidatedMultipleChoiceDistractors(input: {
  correctAnswer: string;
  prompt?: string;
  topic?: string;
  baselineChoices?: string[];
  aiChoices?: string[];
  targetCount?: number;
}) {
  const correctAnswer = input.correctAnswer.trim();
  if (!correctAnswer) return [];

  const questionTokens = tokenize(`${input.prompt || ""} ${input.topic || ""}`);
  const shape = describeAnswerShape(correctAnswer);
  const targetCount = input.targetCount ?? DISTRACTOR_TARGET_COUNT;
  const seen = new Set<string>();
  const allCandidates = [...(input.aiChoices ?? []), ...(input.baselineChoices ?? [])];

  const collected = allCandidates
    .map((choice, index) => scoreDistractorChoice({
      choice,
      index,
      correctAnswer,
      shape,
      questionTokens,
      source: index < (input.aiChoices ?? []).length ? "ai" : "baseline",
    }))
    .filter((entry): entry is { choice: string; normalized: string; score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score)
    .filter((entry) => {
      if (seen.has(entry.normalized)) return false;
      seen.add(entry.normalized);
      return true;
    })
    .slice(0, targetCount)
    .map((entry) => entry.choice);

  if (collected.length < targetCount) {
    const relaxed = allCandidates
      .map((choice, index) => scoreRelaxedDistractorChoice({
        choice,
        index,
        correctAnswer,
        shape,
        questionTokens,
      }))
      .filter((entry): entry is { choice: string; normalized: string; score: number } => Boolean(entry))
      .sort((a, b) => b.score - a.score);

    for (const entry of relaxed) {
      if (seen.has(entry.normalized)) continue;
      seen.add(entry.normalized);
      collected.push(entry.choice);
      if (collected.length >= targetCount) break;
    }
  }

  return collected;
}

export function buildValidatedMultipleChoiceChoices(input: {
  correctAnswer: string;
  prompt?: string;
  topic?: string;
  baselineChoices?: string[];
  aiChoices?: string[];
}) {
  const correctAnswer = input.correctAnswer.trim();
  if (!correctAnswer) return [];

  const wrongChoices = buildValidatedMultipleChoiceDistractors(input);
  if (wrongChoices.length < DISTRACTOR_TARGET_COUNT) return [];

  return shuffleArray([correctAnswer, ...wrongChoices]);
}

function scoreDistractorChoice(input: {
  choice: string;
  index: number;
  correctAnswer: string;
  shape: ReturnType<typeof describeAnswerShape>;
  questionTokens: string[];
  source: "ai" | "baseline";
}) {
  const trimmed = input.choice.trim();
  if (!trimmed || !isUsableDistractorAnswer(trimmed, input.correctAnswer)) return null;

  const normalizedChoice = normalizeText(trimmed);
  if (GENERIC_THROWAWAY_CHOICES.has(normalizedChoice)) return null;
  if (isDistractorTooSimilar(trimmed, input.correctAnswer)) return null;
  if (!matchesAnswerShape(trimmed, input.shape)) return null;

  const candidateTokens = tokenize(trimmed);
  const tokenGap = Math.abs(candidateTokens.length - input.shape.tokenCount);
  const charGap = Math.abs(normalizeText(trimmed).length - input.shape.charLength);
  const questionOverlap = intersectionSize(candidateTokens, input.questionTokens);
  const startsWithCapital = /^[A-Z]/.test(trimmed);
  const punctuationPenalty = /[.!?]$/.test(trimmed) !== input.shape.endsWithSentencePunctuation ? 2 : 0;

  let score = 100;
  score -= tokenGap * 8;
  score -= Math.min(18, Math.floor(charGap / 4));
  score += questionOverlap * 5;
  score += input.source === "ai" ? 4 : 0;
  score += startsWithCapital === input.shape.startsWithCapital ? 2 : 0;
  score -= punctuationPenalty;
  score -= input.index * 0.2;

  return {
    choice: trimmed,
    normalized: normalizedChoice,
    score,
  };
}

function scoreRelaxedDistractorChoice(input: {
  choice: string;
  index: number;
  correctAnswer: string;
  shape: ReturnType<typeof describeAnswerShape>;
  questionTokens: string[];
}) {
  const trimmed = input.choice.trim();
  if (!trimmed || !isUsableDistractorAnswer(trimmed, input.correctAnswer)) return null;

  const normalizedChoice = normalizeText(trimmed);
  if (GENERIC_THROWAWAY_CHOICES.has(normalizedChoice)) return null;
  if (isDistractorTooSimilar(trimmed, input.correctAnswer)) return null;

  const candidateTokens = tokenize(trimmed);
  const tokenGap = Math.abs(candidateTokens.length - input.shape.tokenCount);
  const charGap = Math.abs(normalizeText(trimmed).length - input.shape.charLength);
  const questionOverlap = intersectionSize(candidateTokens, input.questionTokens);
  const shapeMatchBonus = matchesAnswerShape(trimmed, input.shape) ? 16 : 0;

  let score = 60;
  score += shapeMatchBonus;
  score += questionOverlap * 4;
  score -= tokenGap * 5;
  score -= Math.min(16, Math.floor(charGap / 5));
  score -= input.index * 0.2;

  return {
    choice: trimmed,
    normalized: normalizedChoice,
    score,
  };
}

function describeAnswerShape(value: string) {
  const normalized = normalizeText(value);
  const tokens = normalized.split(" ").filter(Boolean);
  return {
    tokenCount: tokens.length,
    charLength: normalized.length,
    hasDigits: /\d/.test(value),
    hasParentheses: /[()]/.test(value),
    hasPercent: /%/.test(value),
    isAllCaps: /^[A-Z0-9\s-]+$/.test(value) && /[A-Z]/.test(value),
    startsWithCapital: /^[A-Z]/.test(value),
    endsWithSentencePunctuation: /[.!?]$/.test(value.trim()),
    isLikelySentence: tokens.length >= 6,
  };
}

function matchesAnswerShape(candidate: string, correctShape: ReturnType<typeof describeAnswerShape>) {
  const candidateShape = describeAnswerShape(candidate);
  const tokenGap = Math.abs(candidateShape.tokenCount - correctShape.tokenCount);
  const lowerBound = Math.max(3, Math.floor(correctShape.charLength * 0.5));
  const upperBound = Math.max(8, Math.ceil(correctShape.charLength * 1.8));

  if (candidateShape.hasDigits !== correctShape.hasDigits) return false;
  if (candidateShape.hasPercent !== correctShape.hasPercent) return false;
  if (correctShape.hasParentheses && !candidateShape.hasParentheses) return false;
  if (correctShape.isAllCaps !== candidateShape.isAllCaps && (correctShape.isAllCaps || candidateShape.isAllCaps)) return false;
  if (candidateShape.charLength < lowerBound || candidateShape.charLength > upperBound) return false;
  if (tokenGap > Math.max(2, Math.ceil(correctShape.tokenCount * 0.5))) return false;
  if (correctShape.isLikelySentence !== candidateShape.isLikelySentence && correctShape.tokenCount >= 5) return false;

  return true;
}

function isDistractorTooSimilar(choice: string, correctAnswer: string) {
  const normalizedChoice = normalizeText(choice);
  const normalizedCorrect = normalizeText(correctAnswer);
  if (!normalizedChoice || normalizedChoice === normalizedCorrect) return true;
  if (normalizedChoice.includes(normalizedCorrect) || normalizedCorrect.includes(normalizedChoice)) return true;

  const choiceTokens = normalizedChoice.split(" ").filter(Boolean);
  const correctTokens = normalizedCorrect.split(" ").filter(Boolean);

  if (choiceTokens.length === 1 && correctTokens.length === 1) {
    return levenshteinDistance(normalizedChoice, normalizedCorrect) <= 1;
  }

  return false;
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

function getCardPromptFront(card: StudyCard, index: number) {
  const front = card.front.trim();
  if (front) return front;
  if (card.imageFrontUrl?.trim()) return `this image (${index + 1})`;
  return `this card (${index + 1})`;
}

function createFillBlankPrompt(card: StudyCard, promptFront: string) {
  const words = promptFront.split(" ");
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
