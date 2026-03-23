import { prisma } from "@/lib/prisma";

export interface SessionState {
  activeCourseId: string | null;
  activeCourseCode: string | null; // e.g. "CS 211"
  activeProfessorId: string | null;
  activeProfessorName: string | null;
  activeHall: string | null;       // e.g. "ARC", "JST" — for housing follow-ups
  activeDomain: string | null;
  lastAnswerType: string | null;
  lastTopics: string[];
}

const DEFAULT_STATE: SessionState = {
  activeCourseId: null,
  activeCourseCode: null,
  activeProfessorId: null,
  activeProfessorName: null,
  activeHall: null,
  activeDomain: null,
  lastAnswerType: null,
  lastTopics: [],
};

export async function getSessionState(sessionId: string): Promise<SessionState> {
  try {
    const session = await prisma.conversationSession.findUnique({
      where: { sessionId },
      select: { memory: true },
    });
    if (!session) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(session.memory);
    return {
      activeCourseId: parsed._activeCourseId ?? null,
      activeCourseCode: parsed._activeCourseCode ?? null,
      activeProfessorId: parsed._activeProfessorId ?? null,
      activeProfessorName: parsed._activeProfessorName ?? null,
      activeHall: parsed._activeHall ?? null,
      activeDomain: parsed._activeDomain ?? null,
      lastAnswerType: parsed._lastAnswerType ?? null,
      lastTopics: parsed._lastTopics ?? [],
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function updateSessionState(
  sessionId: string,
  updates: Partial<SessionState>
): Promise<void> {
  try {
    const session = await prisma.conversationSession.findUnique({
      where: { sessionId },
      select: { memory: true },
    });
    const existing = session ? JSON.parse(session.memory) : {};
    const updated = {
      ...existing,
      _activeCourseId: updates.activeCourseId ?? existing._activeCourseId ?? null,
      _activeCourseCode: updates.activeCourseCode ?? existing._activeCourseCode ?? null,
      _activeProfessorId: updates.activeProfessorId ?? existing._activeProfessorId ?? null,
      _activeProfessorName: updates.activeProfessorName ?? existing._activeProfessorName ?? null,
      _activeHall: updates.activeHall ?? existing._activeHall ?? null,
      _activeDomain: updates.activeDomain ?? existing._activeDomain ?? null,
      _lastAnswerType: updates.lastAnswerType ?? existing._lastAnswerType ?? null,
      _lastTopics: updates.lastTopics ?? existing._lastTopics ?? [],
    };
    await prisma.conversationSession.upsert({
      where: { sessionId },
      create: {
        sessionId,
        memory: JSON.stringify(updated),
        messageCount: 1,
        lastSeenAt: new Date(),
      },
      update: {
        memory: JSON.stringify(updated),
        lastSeenAt: new Date(),
      },
    });
  } catch {
    // fail silently
  }
}

// Hall abbreviations used by UIC housing (matched case-insensitively in query)
const HALL_ABBREVS: Record<string, string> = {
  arc: "ARC", jst: "JST", cmw: "CMW", cms: "CMS", cmn: "CMN",
  mrh: "MRH", tbh: "TBH", ssr: "SSR", psr: "PSR", cty: "CTY",
  "james stukel": "JST", "grant": "ARC", "academic residential": "ARC",
};

export function extractEntitiesFromQuery(
  lastMsg: string,
  intent: any,
  currentState: SessionState
): Partial<SessionState> {
  const updates: Partial<SessionState> = {};
  const lower = lastMsg.toLowerCase();

  // Update active course if a course code was detected
  if (intent.courseCode) {
    updates.activeCourseCode = `${intent.courseCode.subject} ${intent.courseCode.number}`;
  }

  // Update active professor if a professor name was detected
  if (intent.profNameHint) {
    updates.activeProfessorName = intent.profNameHint;
  }

  // Detect active residence hall from the query
  for (const [pattern, abbrev] of Object.entries(HALL_ABBREVS)) {
    if (lower.includes(pattern)) {
      updates.activeHall = abbrev;
      break;
    }
  }

  // Update active domain based on what was retrieved
  if (intent.isAboutProfessors) updates.activeDomain = "professors";
  else if (intent.isAboutCourses) updates.activeDomain = "courses";
  else if (intent.isAboutHousing) updates.activeDomain = "housing";
  else if (intent.isAboutAthletics) updates.activeDomain = "athletics";

  return updates;
}