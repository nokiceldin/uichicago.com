import Anthropic from "@anthropic-ai/sdk";
import { buildExam, buildQuestionBank, materializeGeneratedStudySet } from "./engine";
import { cardHintPrompt, distractorGenerationPrompt, examGenerationPrompt, explanationPrompt, flashcardGenerationPrompt, noteActionPrompt, quizGenerationPrompt, structuredNotesPrompt, studyPlanPrompt } from "./ai-prompts";
import { estimateFlashcardCountFromText, parseExplicitFlashcardsFromText } from "./flashcard-parser";
import { validateGeneratedExam, validateGeneratedFlashcards, validateGeneratedQuiz, validateNoteAction, validateStructuredLectureNotes, validateStudyPlan } from "./validation";
import type { GeneratedExamPayload, GeneratedFlashcardPayload, GeneratedQuizPayload, NoteActionPayload, StructuredLectureNotesPayload, StudyPlanPayload, StudySet } from "./types";

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

async function requestJson(prompt: string) {
  if (!anthropic) return null;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2200,
    temperature: 0.4,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .map((block) => ("text" in block ? block.text : ""))
    .join("")
    .trim();

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("AI did not return valid JSON.");
  }

  return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
}

export async function generateFlashcardsFromText(input: {
  sourceMaterial: string;
  course?: string;
  topic?: string;
  desiredCount?: number;
  difficultyTarget?: string;
}): Promise<GeneratedFlashcardPayload> {
  const trimmed = input.sourceMaterial.trim();
  if (!trimmed) {
    throw new Error("Source material is required.");
  }

  const parsedCards = parseExplicitFlashcardsFromText(trimmed);
  if (parsedCards.length) {
    return validateGeneratedFlashcards({
      setTitle: input.topic || input.course || "",
      cards: parsedCards.map((card, index) => ({
        front: card.front,
        back: card.back,
        hint: "",
        difficulty: index % 3 === 0 ? "easy" : index % 3 === 1 ? "medium" : "hard",
        tags: input.topic ? [input.topic] : [],
      })),
    });
  }

  const desiredCount = Math.max(12, input.desiredCount ?? estimateFlashcardCountFromText(trimmed));

  if (anthropic) {
    const raw = await requestJson(
      flashcardGenerationPrompt({
        ...input,
        desiredCount,
      }),
    );
    return validateGeneratedFlashcards(raw);
  }

  const lines = trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, desiredCount);

  return validateGeneratedFlashcards({
    setTitle: input.topic || input.course || "",
    cards: lines.map((line, index) => {
      const [front, ...rest] = line.split(/[:\-–]/);
      return {
        front: front.trim(),
        back: rest.join(" ").trim() || `Explain ${front.trim()} in your own words.`,
        hint: "",
        difficulty: index % 3 === 0 ? "easy" : index % 3 === 1 ? "medium" : "hard",
        tags: input.topic ? [input.topic] : [],
      };
    }),
  });
}

export async function generateQuizFromSet(set: StudySet, desiredCount = 10): Promise<GeneratedQuizPayload> {
  if (anthropic) {
    const sourceMaterial = set.cards.map((card) => `${card.front}: ${card.back}`).join("\n");
    const raw = await requestJson(
      quizGenerationPrompt({
        course: set.course,
        topic: set.subject,
        desiredCount,
        sourceMaterial,
      }),
    );
    return validateGeneratedQuiz(raw);
  }

  return validateGeneratedQuiz({
    questions: buildQuestionBank(set).slice(0, desiredCount),
  });
}

export async function generateExamFromSet(set: StudySet, desiredCount = 15): Promise<GeneratedExamPayload> {
  if (anthropic) {
    const sourceMaterial = set.cards.map((card) => `${card.front}: ${card.back}`).join("\n");
    const raw = await requestJson(
      examGenerationPrompt({
        course: set.course,
        topic: set.subject,
        desiredCount,
        sourceMaterial,
      }),
    );
    return validateGeneratedExam(raw);
  }

  return buildExam(set, desiredCount);
}

export async function generateDistractors(
  questions: Array<{ id: string; prompt: string; correctAnswer: string; topic: string }>,
): Promise<Array<{ id: string; choices: string[] }>> {
  if (!anthropic || questions.length === 0) return [];
  try {
    const raw = await requestJson(distractorGenerationPrompt(questions));
    if (!Array.isArray(raw?.distractors)) return [];
    return raw.distractors.filter(
      (item: unknown) =>
        item != null &&
        typeof (item as Record<string, unknown>).id === "string" &&
        Array.isArray((item as Record<string, unknown>).choices),
    );
  } catch {
    return [];
  }
}

export async function generateAnswerExplanation(input: {
  question: string;
  correctAnswer: string;
  userAnswer: string;
  topic?: string;
}): Promise<{ explanation: string; quickFix: string }> {
  if (anthropic) {
    const raw = await requestJson(explanationPrompt(input));
    return {
      explanation: typeof raw?.explanation === "string" ? raw.explanation : "The correct answer is better supported by the source material.",
      quickFix: typeof raw?.quickFix === "string" ? raw.quickFix : "Review the core concept and retry one similar question.",
    };
  }

  return {
    explanation: `The correct answer is "${input.correctAnswer}" because it best matches the concept being tested.`,
    quickFix: "Restate the concept in one sentence, then quiz yourself again in 10 minutes.",
  };
}

export async function generateStudyPlan(input: {
  setTitle: string;
  weakAreas: string[];
  averageAccuracy: number;
}): Promise<StudyPlanPayload> {
  if (anthropic) {
    const raw = await requestJson(studyPlanPrompt(input));
    return validateStudyPlan(raw);
  }

  return validateStudyPlan({
    focusAreas: input.weakAreas,
    recommendedModes: ["learn", "test", "exam"],
    schedule: [
      { dayLabel: "Today", activity: "Review your weakest cards in Learn mode", durationMinutes: 25 },
      { dayLabel: "Tomorrow", activity: "Run a mixed quiz and review mistakes", durationMinutes: 30 },
      { dayLabel: "Day 3", activity: "Flashcard sprint on starred and difficult cards", durationMinutes: 20 },
      { dayLabel: "Day 4", activity: "Take a timed practice exam", durationMinutes: 35 },
      { dayLabel: "Day 5", activity: "Revisit missed questions and summarize weak topics", durationMinutes: 25 },
    ],
    summary: `Focus on ${input.weakAreas.join(", ") || "your weakest topics"} and push accuracy above ${Math.max(
      85,
      input.averageAccuracy + 8,
    )}%.`,
  });
}

export async function normalizeTranscript(input: {
  transcriptText?: string;
  title?: string;
}) {
  const transcript = (input.transcriptText || "").trim();
  if (!transcript) {
    throw new Error("Transcript text is required.");
  }

  return {
    title: input.title?.trim() || "Lecture capture",
    transcript,
  };
}

export async function generateStructuredLectureNotes(input: {
  transcript: string;
  course?: string;
  subject?: string;
  title?: string;
}): Promise<StructuredLectureNotesPayload> {
  const transcript = input.transcript.trim();
  if (!transcript) {
    throw new Error("Transcript is required.");
  }

  if (anthropic) {
    const raw = await requestJson(structuredNotesPrompt(input));
    return validateStructuredLectureNotes(raw);
  }

  const lines = transcript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 18);

  const keyConcepts = lines.slice(0, 5);
  const supporting = lines.slice(5, 10);

  return validateStructuredLectureNotes({
    title: input.title || input.course || "Lecture notes",
    summary: lines[0] || "Structured notes generated from your lecture transcript.",
    sections: [
      { heading: "Key Concepts", items: keyConcepts.length ? keyConcepts : ["Review the core points from this lecture."] },
      { heading: "Important Details", items: supporting.length ? supporting : lines.slice(0, 4) },
      { heading: "Possible Exam Focus", items: lines.slice(10, 14).length ? lines.slice(10, 14) : ["Review definitions, repeated ideas, and worked examples."] },
    ],
    keyTerms: keyConcepts.map((item) => item.split(":")[0]?.trim() || item).slice(0, 6),
    questionsToReview: [
      "What are the two or three ideas from this lecture most likely to show up on an exam?",
      "Which concept from these notes still feels unclear?",
    ],
    confidenceNotes: [],
  });
}

export async function runNoteAction(input: {
  action: NoteActionPayload["action"];
  content: string;
  course?: string;
  subject?: string;
  title?: string;
}): Promise<NoteActionPayload> {
  const content = input.content.trim();
  if (!content) {
    throw new Error("Note content is required.");
  }

  if (anthropic) {
    const raw = await requestJson(
      noteActionPrompt({
        action: input.action,
        course: input.course,
        subject: input.subject,
        title: input.title,
        content,
      }),
    );
    return validateNoteAction(raw);
  }

  if (input.action === "generate_flashcards") {
    return validateNoteAction({
      action: "generate_flashcards",
      flashcards: await generateFlashcardsFromText({
        sourceMaterial: content,
        course: input.course,
        topic: input.subject,
        desiredCount: 12,
      }),
    });
  }

  if (input.action === "generate_quiz") {
    const generatedSet = toStudySetFromGenerated(
      await generateFlashcardsFromText({
        sourceMaterial: content,
        course: input.course,
        topic: input.subject,
        desiredCount: 10,
      }),
      { course: input.course, subject: input.subject },
    );
    const quiz = await generateQuizFromSet(generatedSet, 8);
    return validateNoteAction({
      action: "generate_quiz",
      quizQuestions: quiz.questions,
    });
  }

  if (input.action === "review_sheet") {
    return validateNoteAction({
      action: "review_sheet",
      reviewSheet: await generateStructuredLectureNotes({
        transcript: content,
        course: input.course,
        subject: input.subject,
        title: input.title ? `${input.title} Review Sheet` : "Review Sheet",
      }),
    });
  }

  if (input.action === "extract_terms") {
    const keyTerms = Array.from(
      new Set(
        content
          .split(/\n+/)
          .flatMap((line) => line.split(/[:,-]/))
          .map((part) => part.trim())
          .filter((part) => part.length > 3)
          .slice(0, 10),
      ),
    );

    return validateNoteAction({
      action: "extract_terms",
      keyTerms,
    });
  }

  if (input.action === "simplify") {
    return validateNoteAction({
      action: "simplify",
      rewrittenNote: content
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 10)
        .join("\n"),
    });
  }

  if (input.action === "explain_concept") {
    return validateNoteAction({
      action: "explain_concept",
      explanation: "Focus on the hardest repeated concept in the note, reduce it to one simple definition, then connect it to one concrete example from class.",
    });
  }

  return validateNoteAction({
    action: "summarize",
    summary: content
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 4)
      .join(" "),
  });
}

export async function generateCardHint(input: { front: string; back: string }): Promise<{ hint: string }> {
  if (anthropic) {
    const raw = await requestJson(cardHintPrompt(input));
    return {
      hint: typeof raw?.hint === "string" ? raw.hint : `Think about the relationship between "${input.front}" and its key concept.`,
    };
  }
  return { hint: `Think about the relationship between "${input.front}" and its key concept.` };
}

export function toStudySetFromGenerated(payload: GeneratedFlashcardPayload, input: {
  course?: string;
  subject?: string;
  difficulty?: "easy" | "medium" | "hard";
}) {
  return materializeGeneratedStudySet(payload, {
    course: input.course,
    subject: input.subject,
    difficulty: input.difficulty,
    description: "AI-generated study set",
  });
}
