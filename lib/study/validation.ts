import type {
  GeneratedExamPayload,
  GeneratedFlashcardPayload,
  GeneratedQuizPayload,
  NoteActionPayload,
  QuizQuestion,
  StructuredLectureNotesPayload,
  StudyDifficulty,
  StudyPlanPayload,
} from "./types";

const difficulties = new Set<StudyDifficulty>(["easy", "medium", "hard"]);
const questionTypes = new Set([
  "multiple_choice",
  "true_false",
  "short_answer",
  "fill_blank",
  "matching",
  "written",
]);

export function validateGeneratedFlashcards(input: unknown): GeneratedFlashcardPayload {
  const payload = input as GeneratedFlashcardPayload;
  if (!payload || typeof payload.setTitle !== "string" || !Array.isArray(payload.cards)) {
    throw new Error("Invalid flashcard payload.");
  }

  return {
    setTitle: payload.setTitle.trim() || "Generated study set",
    cards: payload.cards
      .filter((card) => card && typeof card.front === "string" && typeof card.back === "string")
      .map((card) => ({
        front: card.front.trim(),
        back: card.back.trim(),
        hint: typeof card.hint === "string" ? card.hint.trim() : "",
        difficulty: difficulties.has(card.difficulty) ? card.difficulty : "medium",
        tags: Array.isArray(card.tags) ? card.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim()) : [],
      }))
      .filter((card) => card.front && card.back),
  };
}

export function validateGeneratedQuiz(input: unknown): GeneratedQuizPayload {
  const payload = input as GeneratedQuizPayload;
  if (!payload || !Array.isArray(payload.questions)) {
    throw new Error("Invalid quiz payload.");
  }

  return {
    questions: payload.questions
      .map(validateQuestion)
      .filter(Boolean) as QuizQuestion[],
  };
}

export function validateGeneratedExam(input: unknown): GeneratedExamPayload {
  const payload = input as GeneratedExamPayload;
  if (!payload || !Array.isArray(payload.questions)) {
    throw new Error("Invalid exam payload.");
  }

  const questions = payload.questions.map(validateQuestion).filter(Boolean) as QuizQuestion[];
  return {
    title: typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "Practice exam",
    durationMinutes:
      typeof payload.durationMinutes === "number" && payload.durationMinutes > 0 ? payload.durationMinutes : 30,
    questions,
    topicsCovered: Array.isArray(payload.topicsCovered)
      ? payload.topicsCovered.filter((topic) => typeof topic === "string")
      : [],
    difficultyMix: {
      easy: typeof payload.difficultyMix?.easy === "number" ? payload.difficultyMix.easy : 20,
      medium: typeof payload.difficultyMix?.medium === "number" ? payload.difficultyMix.medium : 50,
      hard: typeof payload.difficultyMix?.hard === "number" ? payload.difficultyMix.hard : 30,
    },
  };
}

export function validateStudyPlan(input: unknown): StudyPlanPayload {
  const payload = input as StudyPlanPayload;
  if (!payload || !Array.isArray(payload.schedule)) {
    throw new Error("Invalid study plan payload.");
  }

  return {
    focusAreas: Array.isArray(payload.focusAreas) ? payload.focusAreas.filter((item) => typeof item === "string") : [],
    recommendedModes: Array.isArray(payload.recommendedModes)
      ? payload.recommendedModes.filter((item) => ["flashcards", "learn", "test", "exam", "match"].includes(item))
      : ["learn", "test"],
    schedule: payload.schedule
      .filter((item) => item && typeof item.dayLabel === "string" && typeof item.activity === "string")
      .map((item) => ({
        dayLabel: item.dayLabel,
        activity: item.activity,
        durationMinutes: typeof item.durationMinutes === "number" ? item.durationMinutes : 30,
      })),
    summary: typeof payload.summary === "string" ? payload.summary : "",
  };
}

export function validateStructuredLectureNotes(input: unknown): StructuredLectureNotesPayload {
  const payload = input as StructuredLectureNotesPayload;
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid structured notes payload.");
  }

  return {
    title: typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "Lecture notes",
    summary: typeof payload.summary === "string" ? payload.summary.trim() : "",
    sections: Array.isArray(payload.sections)
      ? payload.sections
          .filter((section) => section && typeof section.heading === "string" && Array.isArray(section.items))
          .map((section) => ({
            heading: section.heading.trim(),
            items: section.items.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean),
          }))
          .filter((section) => section.heading && section.items.length)
      : [],
    keyTerms: Array.isArray(payload.keyTerms)
      ? payload.keyTerms.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : [],
    questionsToReview: Array.isArray(payload.questionsToReview)
      ? payload.questionsToReview.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : [],
    confidenceNotes: Array.isArray(payload.confidenceNotes)
      ? payload.confidenceNotes.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : [],
  };
}

export function validateNoteAction(input: unknown): NoteActionPayload {
  const payload = input as NoteActionPayload;
  if (!payload || typeof payload !== "object" || typeof payload.action !== "string") {
    throw new Error("Invalid note action payload.");
  }

  return {
    action: payload.action as NoteActionPayload["action"],
    summary: typeof payload.summary === "string" ? payload.summary.trim() : undefined,
    rewrittenNote: typeof payload.rewrittenNote === "string" ? payload.rewrittenNote.trim() : undefined,
    keyTerms: Array.isArray(payload.keyTerms)
      ? payload.keyTerms.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : undefined,
    explanation: typeof payload.explanation === "string" ? payload.explanation.trim() : undefined,
    reviewSheet: payload.reviewSheet ? validateStructuredLectureNotes(payload.reviewSheet) : undefined,
    flashcards: payload.flashcards ? validateGeneratedFlashcards(payload.flashcards) : undefined,
    quizQuestions: Array.isArray(payload.quizQuestions)
      ? payload.quizQuestions.map(validateQuestion).filter(Boolean) as QuizQuestion[]
      : undefined,
  };
}

function validateQuestion(question: any): QuizQuestion | null {
  if (!question || typeof question.prompt !== "string" || !questionTypes.has(question.type)) {
    return null;
  }

  return {
    id: typeof question.id === "string" ? question.id : `generated-${Math.random().toString(36).slice(2, 10)}`,
    type: question.type,
    prompt: question.prompt.trim(),
    choices: Array.isArray(question.choices) ? question.choices.filter((choice: unknown) => typeof choice === "string") : undefined,
    correctAnswer: Array.isArray(question.correctAnswer) || typeof question.correctAnswer === "string"
      ? question.correctAnswer
      : "",
    explanation: typeof question.explanation === "string" ? question.explanation : "",
    difficulty: difficulties.has(question.difficulty) ? question.difficulty : "medium",
    topic: typeof question.topic === "string" ? question.topic : "General",
    acceptedAnswers: Array.isArray(question.acceptedAnswers)
      ? question.acceptedAnswers.filter((answer: unknown) => typeof answer === "string")
      : undefined,
    pairings: Array.isArray(question.pairings)
      ? question.pairings
          .filter((pair: any) => pair && typeof pair.left === "string" && typeof pair.right === "string")
          .map((pair: any) => ({ left: pair.left, right: pair.right }))
      : undefined,
  };
}
