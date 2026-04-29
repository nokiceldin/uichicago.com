export function flashcardGenerationPrompt(input: {
  course?: string;
  topic?: string;
  difficultyTarget?: string;
  sourceMaterial: string;
  desiredCount?: number;
}) {
  return `You are generating academically useful study flashcards from notes, readings, or lecture slides.

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
- If the source already contains explicit flashcard-style question and answer pairs, preserve them as one card per pair instead of merging them into summary cards.
- Make the front short and scannable, usually a term, concept, theorem, process, symbol, or direct study question.
- Make the back a crisp answer a student could memorize, usually 1-3 sentences or a short semicolon-separated list.
- Do not add numbering, markdown, labels like "Front:" or "Back:", or any commentary.
- When the source is slide-like, infer the implied concept being defined instead of copying fragmented bullets verbatim.
- Prefer one concept per card. Split overloaded bullets into separate cards instead of making vague backs.
- If a concept appears multiple times, keep only the clearest version.
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
- For every multiple-choice question, write 3 plausible distractors from the same topic as the correct answer.
- Keep the wrong answers the same answer type as the correct answer: term, definition, process, number, organ, function, formula, date, or concept.
- Make distractors feel like real exam traps: common misconceptions, closely related terms, nearby concepts, or easy-to-confuse processes.
- Keep all answer choices similar in length, grammar, specificity, and wording style.
- Avoid joke answers, random facts, unrelated chapters, and giveaway wording differences.
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
- For every multiple-choice question, write exactly 3 plausible distractors from the same topic as the correct answer.
- Keep the wrong answers the same answer type as the correct answer: term, definition, process, number, organ, function, formula, date, or concept.
- Make distractors feel like real exam traps: common misconceptions, closely related terms, nearby concepts, or easy-to-confuse processes.
- Keep all answer choices similar in length, grammar, specificity, and wording style.
- Avoid joke answers, random facts, unrelated chapters, and giveaway wording differences.
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
  return `Give a short, simple explanation of why the correct answer is right. 2-3 sentences max. No fluff, no mention of the student or their answer — just a clear, direct explanation of the concept.

Return JSON only:
{
  "explanation": "",
  "quickFix": ""
}

Question: ${input.question}
Correct answer: ${input.correctAnswer}
Topic: ${input.topic || "General"}`;
}

export function distractorGenerationPrompt(
  questions: Array<{ id: string; prompt: string; correctAnswer: string; topic: string; existingChoices?: string[] }>,
  options?: { strict?: boolean },
) {
  const strict = options?.strict ?? false;
  const list = questions
    .map((q, i) => {
      const existingChoices = Array.isArray(q.existingChoices) && q.existingChoices.length
        ? ` existing_choices="${q.existingChoices.join(" | ")}"`
        : "";
      return `${i + 1}. id="${q.id}" topic="${q.topic}" question="${q.prompt}" correct="${q.correctAnswer}"${existingChoices}`;
    })
    .join("\n");
  return `You are creating multiple-choice study questions. For each question below, generate exactly 3 plausible but INCORRECT answer choices (distractors).

Rules:
- Distractors must be the same TYPE and FORMAT as the correct answer (numbers near numbers, terms near terms, dates near dates, names near names)
- Distractors should be plausible to someone who hasn't studied, but clearly wrong to someone who has
- Keep distractors in the same conceptual neighborhood as the correct answer, not random facts from the broader subject
- Make the wrong choices feel competitive with each other: similar specificity, similar wording, similar length
- Keep distractors short — similar length and style to the correct answer
- Use this distractor style: common misconceptions, closely related terms, similar processes, nearby concepts from the same topic, or tempting confusions a half-prepared student might pick
- Do NOT repeat the correct answer
- Do NOT invent answers from unrelated topics
- Do NOT use joke answers, "all of the above", "none of the above", or obviously impossible options
${strict ? "- Be extra strict: every distractor must look like it could have come from the same chapter, lecture, or diagram as the correct answer" : ""}
${strict ? "- If the answer is a term, return terms; if it is a definition, return definitions; if it is a process, return processes; if it is a number, return nearby believable numbers with the same units or format" : ""}
${strict ? "- If a distractor would stand out because it is much shorter, broader, sillier, or from a different subtopic, replace it" : ""}

Return JSON only:
{
  "distractors": [
    { "id": "<question id>", "choices": ["wrong1", "wrong2", "wrong3"] }
  ]
}

Questions:
${list}`;
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

export function cardHintPrompt(input: { front: string; back: string }) {
  return `Generate a short study hint for this flashcard. The hint should be a 1–2 sentence memory cue that helps recall the answer without giving it away — think mnemonic, partial clue, or analogy.

Return JSON only: { "hint": "" }

Card front: ${input.front}
Card back: ${input.back}`;
}
