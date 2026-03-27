export type StudyDifficulty = "easy" | "medium" | "hard";
export type StudyVisibility = "private" | "public";
export type StudyMode = "flashcards" | "learn" | "test" | "exam" | "match";
export type StudySurface = "home" | "flashcards" | "notes";
export type NoteSourceType = "manual" | "audio" | "imported";
export type NoteStatus = "draft" | "processing" | "ready" | "error";
export type NoteActionType =
  | "summarize"
  | "simplify"
  | "extract_terms"
  | "explain_concept"
  | "review_sheet"
  | "generate_flashcards"
  | "generate_quiz";
export type TranscriptStatus = "idle" | "processing" | "ready" | "error";
export type QuizQuestionType =
  | "multiple_choice"
  | "true_false"
  | "short_answer"
  | "fill_blank"
  | "matching"
  | "written";

export interface StudyCard {
  id: string;
  front: string;
  back: string;
  hint?: string;
  mnemonic?: string;
  pronunciation?: string;
  formula?: string;
  example?: string;
  imageFrontUrl?: string;
  imageBackUrl?: string;
  difficulty: StudyDifficulty;
  tags: string[];
  orderIndex: number;
}

export interface StudySet {
  id: string;
  title: string;
  description: string;
  course: string;
  subject: string;
  tags: string[];
  difficulty: StudyDifficulty;
  visibility: StudyVisibility;
  createdAt: string;
  updatedAt: string;
  cards: StudyCard[];
}

export interface StructuredNoteSection {
  heading: string;
  items: string[];
}

export interface StructuredLectureNotes {
  title: string;
  summary: string;
  sections: StructuredNoteSection[];
  keyTerms: string[];
  questionsToReview: string[];
  confidenceNotes: string[];
}

export interface StudyNote {
  id: string;
  title: string;
  course: string;
  noteDate: string;
  subject: string;
  tags: string[];
  rawContent: string;
  structuredContent: StructuredLectureNotes | null;
  transcriptContent: string;
  sourceType: NoteSourceType;
  visibility: StudyVisibility;
  status: NoteStatus;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  pinned: boolean;
  favorite: boolean;
}

export interface NoteAudioSession {
  id: string;
  noteId: string;
  audioRef: string;
  durationMs: number;
  transcriptStatus: TranscriptStatus;
  aiStatus: TranscriptStatus;
  createdAt: string;
}

export interface NoteAiGenerationLog {
  id: string;
  noteId: string;
  action: NoteActionType | "lecture_notes";
  createdAt: string;
  status: "success" | "error";
  detail: string;
}

export interface CardProgress {
  cardId: string;
  masteryScore: number;
  confidenceScore: number;
  timesSeen: number;
  timesCorrect: number;
  timesWrong: number;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  starred: boolean;
  markedDifficult: boolean;
  missedRecently?: boolean;
}

export interface StudySessionRecord {
  id: string;
  setId: string;
  mode: StudyMode;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  accuracy: number;
  score: number;
  cardsReviewed: number;
}

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  choices?: string[];
  correctAnswer: string | string[];
  explanation: string;
  difficulty: StudyDifficulty;
  topic: string;
  acceptedAnswers?: string[];
  pairings?: Array<{ left: string; right: string }>;
}

export interface QuizAttemptAnswer {
  questionId: string;
  answer: string | string[];
  correct: boolean;
  score: number;
}

export interface QuizResult {
  id: string;
  setId: string;
  mode: "test" | "exam";
  startedAt: string;
  endedAt: string;
  durationMs: number;
  percentCorrect: number;
  topicAccuracy: Array<{ topic: string; accuracy: number }>;
  answers: QuizAttemptAnswer[];
}

export interface StudyGroup {
  id: string;
  name: string;
  course: string;
  description: string;
  inviteCode: string;
  memberNames: string[];
  setIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StudyLibraryState {
  sets: StudySet[];
  groups: StudyGroup[];
  notes: StudyNote[];
  noteAudioSessions: NoteAudioSession[];
  noteAiLogs: NoteAiGenerationLog[];
  progress: Record<string, Record<string, CardProgress>>;
  sessions: StudySessionRecord[];
  quizResults: QuizResult[];
}

export interface GeneratedFlashcardPayload {
  setTitle: string;
  cards: Array<{
    front: string;
    back: string;
    hint?: string;
    difficulty: StudyDifficulty;
    tags: string[];
  }>;
}

export interface GeneratedQuizPayload {
  questions: QuizQuestion[];
}

export interface GeneratedExamPayload {
  title: string;
  durationMinutes: number;
  questions: QuizQuestion[];
  topicsCovered: string[];
  difficultyMix: {
    easy: number;
    medium: number;
    hard: number;
  };
}

export interface StudyPlanPayload {
  focusAreas: string[];
  recommendedModes: StudyMode[];
  schedule: Array<{
    dayLabel: string;
    activity: string;
    durationMinutes: number;
  }>;
  summary: string;
}

export interface StructuredLectureNotesPayload extends StructuredLectureNotes {}

export interface NoteActionPayload {
  action: NoteActionType;
  summary?: string;
  rewrittenNote?: string;
  keyTerms?: string[];
  explanation?: string;
  reviewSheet?: StructuredLectureNotes;
  flashcards?: GeneratedFlashcardPayload;
  quizQuestions?: QuizQuestion[];
}
