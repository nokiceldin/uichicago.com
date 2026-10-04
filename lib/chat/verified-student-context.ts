export type VerifiedStudentFactSource =
  | "current_message"
  | "conversation_history"
  | "saved_profile";

export type VerifiedStudentFact<T = string> = {
  value: T;
  source: VerifiedStudentFactSource;
};

export interface VerifiedStudentContext {
  major?: VerifiedStudentFact;
  year?: VerifiedStudentFact;
  interests: VerifiedStudentFact[];
  currentCourses: VerifiedStudentFact[];
  completedCourses: VerifiedStudentFact[];
  preferences: VerifiedStudentFact[];
  goals: VerifiedStudentFact[];
}

export interface SavedStudentProfileContext {
  major?: string | null;
  year?: string | null;
  interests?: string[];
  currentCourses?: string[];
  completedCourses?: string[];
  honorsStudent?: boolean;
}

type StudentMessage = { role: string; content: string };

const COURSE_CODE = /\b([A-Z]{2,5})\s*([0-9]{3}[A-Z]?)\b/gi;
const MAJOR_NAME =
  "electrical engineering|mechanical engineering|civil engineering|industrial engineering|computer science|biological sciences|political science|criminal justice|information systems|data science|mathematics|neuroscience|engineering|chemistry|psychology|sociology|criminology|economics|education|philosophy|accounting|marketing|business|finance|biology|physics|nursing|english|history|music|math|art|cs";

const COURSE_STATUS_CUE =
  /(?:\b(?:but|and)\b|,)\s+(?:(?:didn't|did not)\s+(?:finish|complete|pass|take)|failed|never\s+(?:finish|complete|pass|take|finished|completed|passed|taken|took)|(?:haven't|have not|have never)\s+(?:finished|completed|passed|taken)|(?:am\s+)?(?:not|no longer)\s+(?:taking|enrolled in))\b|\b(i\s+haven't\s+(?:finished|completed|passed|taken)|i(?:'ve| have)\s+(?:not|never)\s+(?:finished|completed|passed|taken)|i\s+(?:(?:didn't|did not)\s+(?:finish|complete|pass|take)|failed|never\s+(?:finish|complete|pass|take|finished|completed|passed|taken|took))|i(?:'m| am)\s+(?:not|no longer)\s+(?:taking|enrolled in)|i\s+(?:dropped|withdrew from)|i(?:'ve| have)\s+(?:already\s+)?(?:finished|completed|passed|taken)|i(?:'m| am)\s+done\s+with|i\s+(?:already\s+)?(?:finished|completed|passed|took)|i(?:'m| am)\s+(?:currently\s+)?(?:taking|enrolled in)|(?:and\s+)?am\s+(?:currently\s+)?(?:taking|enrolled in)|i\s+am\s+currently\s+in|currently\s+(?:taking|enrolled in)|enrolled\s+in|registered\s+for)\b/gi;

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function addUnique(
  target: VerifiedStudentFact[],
  value: string,
  source: VerifiedStudentFactSource,
) {
  const normalized = clean(value);
  if (!normalized) return;
  if (target.some((fact) => fact.value.toLowerCase() === normalized.toLowerCase())) return;
  target.push({ value: normalized, source });
}

function removeFact(target: VerifiedStudentFact[], value: string) {
  const key = clean(value).toLowerCase();
  const index = target.findIndex((fact) => fact.value.toLowerCase() === key);
  if (index >= 0) target.splice(index, 1);
}

function setFact(
  target: VerifiedStudentFact[],
  value: string,
  source: VerifiedStudentFactSource,
) {
  removeFact(target, value);
  addUnique(target, value, source);
}

function extractCourseCodes(text: string): string[] {
  return [...text.matchAll(COURSE_CODE)].map(
    (match) => `${match[1].toUpperCase()} ${match[2].toUpperCase()}`,
  );
}

function extractMajorStatements(text: string): Array<{
  denied: boolean;
  index: number;
  value: string;
}> {
  const patterns = [
    new RegExp(
      `\\b(?:my major is(?: now)?|i (?:changed|switched) (?:my )?major to|i(?:'m| am) (?:a |an )?(?:major in|majoring in|studying)|i (?:major in|study))\\s+(${MAJOR_NAME})\\b`,
      "gi",
    ),
    new RegExp(
      `\\b(?:i(?:'m| am) (?:a |an )?)(?:(?:freshman|sophomore|junior|senior|graduate|grad)\\s+)?(${MAJOR_NAME})\\s+(?:major|student)\\b`,
      "gi",
    ),
  ];
  const statements: Array<{ denied: boolean; index: number; value: string }> = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      statements.push({ denied: false, index: match.index ?? -1, value: clean(match[1]) });
    }
  }
  const denialPattern = new RegExp(
    `\\b(?:i(?:'m| am) not|my major (?:isn't|is not))\\s+(?:a |an )?(${MAJOR_NAME})(?:\\s+major)?\\b`,
    "gi",
  );
  for (const match of text.matchAll(denialPattern)) {
    statements.push({ denied: true, index: match.index ?? -1, value: clean(match[1]) });
  }
  return statements.sort((left, right) => left.index - right.index);
}

export function canonicalizeMajorName(value: string): string {
  const normalized = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const aliases: Record<string, string> = {
    cs: "Computer Science",
    "computer science": "Computer Science",
    math: "Mathematics",
    mathematics: "Mathematics",
  };
  return aliases[normalized] ?? clean(value);
}

function sameMajor(left: string, right: string): boolean {
  return canonicalizeMajorName(left).toLowerCase() === canonicalizeMajorName(right).toLowerCase();
}

function extractExplicitYear(text: string): string | null {
  const match = text.match(
    /\b(?:i(?:'m| am) (?:a |an )?|my year is |i am in my )(freshman|first[- ]year|sophomore|second[- ]year|junior|third[- ]year|senior|fourth[- ]year|graduate student|grad student)\b/i,
  );
  return match ? clean(match[1].toLowerCase()) : null;
}

function explicitStatement(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  return match ? clean(match[0]) : null;
}

function applyCourseStatusStatements(
  text: string,
  source: VerifiedStudentFactSource,
  context: VerifiedStudentContext,
) {
  const cues = [...text.matchAll(COURSE_STATUS_CUE)];
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    const cueText = cue[0].toLowerCase();
    const start = (cue.index ?? 0) + cue[0].length;
    const nextCue = cues[index + 1]?.index ?? text.length;
    let clause = text.slice(start, nextCue).split(/[.!?]/, 1)[0];
    clause = clause.split(
      /\b(?:and\s+)?(?:should|could|would|might|may|want(?:ing)? to|plan(?:ning)? to|thinking (?:about|of))\s+(?:i\s+)?take\b/i,
      1,
    )[0];
    const contrastParts = clause.split(/(?:\b(?:but|and)|,)\s+not\b/i, 2);
    const courses = extractCourseCodes(contrastParts[0]);
    const contrastiveDenials = contrastParts[1] ? extractCourseCodes(contrastParts[1]) : [];
    const isNegative = /\b(?:haven't|not|no longer|didn't|did not|failed|never|dropped|withdrew)\b/.test(cueText);
    const isCurrent = /\b(?:taking|enrolled|currently in|registered|dropped|withdrew)\b/.test(cueText);

    for (const course of courses) {
      if (isCurrent) {
        if (isNegative) {
          removeFact(context.currentCourses, course);
        } else {
          removeFact(context.completedCourses, course);
          setFact(context.currentCourses, course, source);
        }
      } else if (isNegative) {
        removeFact(context.completedCourses, course);
        if (/\bfailed\b/.test(cueText)) {
          removeFact(context.currentCourses, course);
        }
      } else {
        removeFact(context.currentCourses, course);
        setFact(context.completedCourses, course, source);
      }
    }

    for (const course of contrastiveDenials) {
      removeFact(isCurrent ? context.currentCourses : context.completedCourses, course);
    }
  }
}

export function buildVerifiedStudentContext(input: {
  messages: StudentMessage[];
  savedProfile?: SavedStudentProfileContext | null;
}): VerifiedStudentContext {
  const context: VerifiedStudentContext = {
    interests: [],
    currentCourses: [],
    completedCourses: [],
    preferences: [],
    goals: [],
  };

  const profile = input.savedProfile;
  if (profile?.major?.trim()) {
    context.major = { value: clean(profile.major), source: "saved_profile" };
  }
  if (profile?.year?.trim()) {
    context.year = { value: clean(profile.year), source: "saved_profile" };
  }
  for (const interest of profile?.interests ?? []) {
    addUnique(context.interests, interest, "saved_profile");
  }
  for (const course of profile?.currentCourses ?? []) {
    addUnique(context.currentCourses, course, "saved_profile");
  }
  for (const course of profile?.completedCourses ?? []) {
    addUnique(context.completedCourses, course, "saved_profile");
  }
  if (profile?.honorsStudent) {
    addUnique(context.preferences, "Honors College student", "saved_profile");
  }

  const userMessages = input.messages.filter((message) => message.role === "user");
  userMessages.forEach((message, index) => {
    const source: VerifiedStudentFactSource =
      index === userMessages.length - 1 ? "current_message" : "conversation_history";
    const text = message.content;

    for (const statement of extractMajorStatements(text)) {
      if (statement.denied) {
        if (context.major && sameMajor(context.major.value, statement.value)) {
          context.major = undefined;
        }
      } else {
        context.major = { value: statement.value, source };
      }
    }

    const year = extractExplicitYear(text);
    if (year) context.year = { value: year, source };

    applyCourseStatusStatements(text, source, context);

    const preference = explicitStatement(
      text,
      /\b(?:i prefer|i care about|i need|my preference is|i want (?!to\b))\b[^.!?]{1,120}/i,
    );
    if (preference) addUnique(context.preferences, preference, source);

    const goal = explicitStatement(
      text,
      /\b(?:my goal is|i plan to|i hope to|i want to become|i am aiming to|i'm aiming to)\b[^.!?]{1,120}/i,
    );
    if (goal) addUnique(context.goals, goal, source);

    const interest = explicitStatement(
      text,
      /\b(?:i'm interested in|i am interested in|my interests? (?:is|are))\b[^.!?]{1,120}/i,
    );
    if (interest) addUnique(context.interests, interest, source);

    const statedConstraint = explicitStatement(
      text,
      /\b(?:i commute|i avoid|i hate|i cannot|i can't|i can only|i work)\b[^.!?]{1,120}/i,
    );
    if (statedConstraint) addUnique(context.preferences, statedConstraint, source);

    if (/\b(?:i(?:'m| am) pre[- ]?med|my track is pre[- ]?med)\b/i.test(text)) {
      addUnique(context.preferences, "pre-med track", source);
    }
  });

  return context;
}

export function buildPlanningStudentContext(context: VerifiedStudentContext): {
  major: string | null;
  completed_courses: string[];
  in_progress_courses: string[];
  constraints: string[];
} {
  return {
    major: context.major?.value ?? null,
    completed_courses: context.completedCourses.map((fact) => fact.value),
    in_progress_courses: context.currentCourses.map((fact) => fact.value),
    constraints: context.preferences.map((fact) => fact.value),
  };
}

export function buildPlanningMajorLookupText(
  rawQuery: string,
  context: VerifiedStudentContext,
): string {
  if (context.major) return canonicalizeMajorName(context.major.value);
  const currentMessageDeniesAMajor = extractMajorStatements(rawQuery).some(
    (statement) => statement.denied,
  );
  return currentMessageDeniesAMajor ? "" : rawQuery;
}

export function formatVerifiedStudentContext(context: VerifiedStudentContext): string {
  const lines: string[] = [];
  const formatFact = (label: string, fact: VerifiedStudentFact) =>
    `${label}: ${fact.value} [source=${fact.source}]`;
  const formatFacts = (label: string, facts: VerifiedStudentFact[]) => {
    if (facts.length) {
      lines.push(`${label}: ${facts.map((fact) => `${fact.value} [source=${fact.source}]`).join("; ")}`);
    }
  };

  if (context.major) lines.push(formatFact("Major", context.major));
  if (context.year) lines.push(formatFact("Year", context.year));
  formatFacts("Interests", context.interests);
  formatFacts("Current courses", context.currentCourses);
  formatFacts("Completed courses", context.completedCourses);
  formatFacts("Preferences", context.preferences);
  formatFacts("Goals", context.goals);

  if (!lines.length) {
    return "=== VERIFIED STUDENT CONTEXT ===\nNo verified personal facts are available for this student.";
  }

  return `=== VERIFIED STUDENT CONTEXT ===\n${lines.join("\n")}`;
}
