export function flashcardGenerationPrompt(input: {
  course?: string;
  topic?: string;
  difficultyTarget?: string;
  sourceMaterial: string;
  desiredCount?: number;
}) {
  return `You are generating academically useful study flashcards.

Return JSON only with this shape:
{
  "setTitle": "",
  "cards": [
    {
      "front": "",
      "back": "",
      "hint": "",
      "difficulty": "easy|medium|hard",
      "tags": []
    }
  ]
}

Rules:
- Use the source material if available.
- Be concise and exam useful.
- Avoid duplicates and filler.
- Prefer terms, processes, definitions, and causal relationships students actually get tested on.
- Generate ${input.desiredCount ?? 12} cards.

Context:
- Course: ${input.course || "Unknown"}
- Topic: ${input.topic || "General"}
- Difficulty target: ${input.difficultyTarget || "mixed"}

Source material:
${input.sourceMaterial}`;
}

export function quizGenerationPrompt(input: {
  course?: string;
  topic?: string;
  desiredCount?: number;
  sourceMaterial: string;
}) {
  return `Create a mixed quiz from the study material below.

Return JSON only with this shape:
{
  "questions": [
    {
      "type": "multiple_choice | true_false | short_answer | fill_blank | matching | written",
      "prompt": "",
      "choices": [],
      "correctAnswer": "",
      "acceptedAnswers": [],
      "pairings": [],
      "explanation": "",
      "difficulty": "easy|medium|hard",
      "topic": ""
    }
  ]
}

Rules:
- Make distractors believable.
- Avoid trick questions.
- Prioritize conceptual and application questions.
- Generate ${input.desiredCount ?? 10} questions.

Context:
- Course: ${input.course || "Unknown"}
- Topic: ${input.topic || "General"}

Source material:
${input.sourceMaterial}`;
}

export function examGenerationPrompt(input: {
  course?: string;
  topic?: string;
  desiredCount?: number;
  sourceMaterial: string;
}) {
  return `Generate a timed practice exam.

Return JSON only with this shape:
{
  "title": "",
  "durationMinutes": 30,
  "questions": [],
  "topicsCovered": [],
  "difficultyMix": {
    "easy": 20,
    "medium": 50,
    "hard": 30
  }
}

Questions should follow the same schema as quiz questions.

Rules:
- Include conceptual and application questions.
- Prefer realistic exam phrasing.
- Avoid generic filler.
- Generate ${input.desiredCount ?? 15} questions.

Context:
- Course: ${input.course || "Unknown"}
- Topic: ${input.topic || "General"}

Source material:
${input.sourceMaterial}`;
}

export function explanationPrompt(input: {
  question: string;
  correctAnswer: string;
  userAnswer: string;
  topic?: string;
}) {
  return `Explain why the correct answer is right and why the student's answer is wrong.

Return JSON only:
{
  "explanation": "",
  "quickFix": ""
}

Question: ${input.question}
Correct answer: ${input.correctAnswer}
Student answer: ${input.userAnswer}
Topic: ${input.topic || "General"}`;
}

export function studyPlanPrompt(input: {
  setTitle: string;
  weakAreas: string[];
  averageAccuracy: number;
}) {
  return `Create a 5 day study plan.

Return JSON only:
{
  "focusAreas": [],
  "recommendedModes": [],
  "schedule": [
    { "dayLabel": "", "activity": "", "durationMinutes": 30 }
  ],
  "summary": ""
}

Set: ${input.setTitle}
Weak areas: ${input.weakAreas.join(", ") || "Unknown"}
Average accuracy: ${input.averageAccuracy}%`;
}

export function structuredNotesPrompt(input: {
  course?: string;
  subject?: string;
  title?: string;
  transcript: string;
}) {
  return `You are turning a lecture transcript into clean, student-loved academic notes.

Return JSON only with this shape:
{
  "title": "",
  "summary": "",
  "sections": [
    {
      "heading": "Key Concepts",
      "items": ["", ""]
    }
  ],
  "keyTerms": [""],
  "questionsToReview": [""],
  "confidenceNotes": [""]
}

Rules:
- Write like a very good student, not a transcript dumper.
- Use short bullets and short sections.
- Prioritize key concepts, definitions, formulas, examples, likely exam material, and review questions.
- Avoid filler and repetition.
- Do not invent facts not supported by the transcript.
- If anything sounds uncertain or low-confidence, place it in confidenceNotes.

Context:
- Course: ${input.course || "Unknown"}
- Subject: ${input.subject || "General"}
- Title: ${input.title || "Lecture"}

Transcript:
${input.transcript}`;
}

export function noteActionPrompt(input: {
  action: string;
  course?: string;
  subject?: string;
  title?: string;
  content: string;
}) {
  const actionInstructions: Record<string, string> = {
    summarize: `Return JSON only:
{
  "action": "summarize",
  "summary": ""
}

Create a concise academic summary with only the most important points.`,
    simplify: `Return JSON only:
{
  "action": "simplify",
  "rewrittenNote": ""
}

Rewrite the note in simpler, clearer student language without losing important content.`,
    extract_terms: `Return JSON only:
{
  "action": "extract_terms",
  "keyTerms": ["", ""]
}

Extract the most important key terms, formulas, and named concepts.`,
    explain_concept: `Return JSON only:
{
  "action": "explain_concept",
  "explanation": ""
}

Identify the hardest concept in the note and explain it clearly in study-friendly language.`,
    review_sheet: `Return JSON only:
{
  "action": "review_sheet",
  "reviewSheet": {
    "title": "",
    "summary": "",
    "sections": [
      { "heading": "", "items": ["", ""] }
    ],
    "keyTerms": [""],
    "questionsToReview": [""],
    "confidenceNotes": [""]
  }
}

Turn the note into a compact review sheet optimized for exam review.`,
    generate_flashcards: `Return JSON only:
{
  "action": "generate_flashcards",
  "flashcards": {
    "setTitle": "",
    "cards": [
      {
        "front": "",
        "back": "",
        "hint": "",
        "difficulty": "easy|medium|hard",
        "tags": []
      }
    ]
  }
}

Generate high-value flashcards from the note. Avoid duplicates and filler.`,
    generate_quiz: `Return JSON only:
{
  "action": "generate_quiz",
  "quizQuestions": [
    {
      "type": "multiple_choice | true_false | short_answer | fill_blank | matching | written",
      "prompt": "",
      "choices": [],
      "correctAnswer": "",
      "acceptedAnswers": [],
      "pairings": [],
      "explanation": "",
      "difficulty": "easy|medium|hard",
      "topic": ""
    }
  ]
}

Generate a short academically useful quiz from the note.`
  };

  return `${actionInstructions[input.action] || actionInstructions.summarize}

Rules:
- Keep output useful and concise.
- Avoid filler.
- Use the source note only.
- If information is weak or uncertain, stay conservative.

Context:
- Course: ${input.course || "Unknown"}
- Subject: ${input.subject || "General"}
- Title: ${input.title || "Note"}

Source note:
${input.content}`;
}
