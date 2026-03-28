import type { StudyDifficulty, StudyGroup, StudySessionRecord, StudySet, StudyVisibility } from "@/lib/study/types";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

function toUiDifficulty(value: string): StudyDifficulty {
  return value.toLowerCase() as StudyDifficulty;
}

function toUiVisibility(value: string): StudyVisibility {
  return value.toLowerCase() as StudyVisibility;
}

export function toDbDifficulty(value: StudyDifficulty) {
  return value.toUpperCase() as "EASY" | "MEDIUM" | "HARD";
}

export function toDbVisibility(value: StudyVisibility) {
  return value.toUpperCase() as "PRIVATE" | "PUBLIC";
}

type StudySetRecord = Prisma.StudySetGetPayload<{
  include: { flashcards: true };
}>;

type StudySessionRecordDb = Prisma.StudySessionGetPayload<Record<string, never>>;

type StudyGroupRecord = Prisma.StudyGroupGetPayload<{
  include: {
    memberships: {
      include: { user: true };
    };
    linkedSets: true;
  };
}>;

export function serializeStudySet(set: StudySetRecord): StudySet {
  return {
    id: set.id,
    title: set.title,
    description: set.description ?? "",
    folder: set.folder ?? "",
    course: set.course ?? "",
    subject: set.subject ?? "",
    tags: set.tags,
    difficulty: toUiDifficulty(set.difficulty),
    visibility: toUiVisibility(set.visibility),
    createdAt: set.createdAt.toISOString(),
    updatedAt: set.updatedAt.toISOString(),
    cards: set.flashcards
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((card) => ({
        id: card.id,
        front: card.front,
        back: card.back,
        hint: card.hint ?? "",
        mnemonic: card.mnemonic ?? "",
        pronunciation: card.pronunciation ?? "",
        formula: card.formula ?? "",
        example: card.example ?? "",
        imageFrontUrl: card.imageFrontUrl ?? "",
        imageBackUrl: card.imageBackUrl ?? "",
        difficulty: toUiDifficulty(card.difficulty),
        tags: card.tags,
        orderIndex: card.orderIndex,
      })),
  };
}

export function serializeStudySession(session: StudySessionRecordDb): StudySessionRecord {
  return {
    id: session.id,
    setId: session.setId,
    mode: session.mode.toLowerCase() as StudySessionRecord["mode"],
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? session.startedAt.toISOString(),
    durationMs: session.durationMs,
    accuracy: Math.round(session.accuracy ?? 0),
    score: Math.round(session.score ?? 0),
    cardsReviewed: session.cardsReviewed,
  };
}

export function serializeStudyGroup(group: StudyGroupRecord): StudyGroup {
  return {
    id: group.id,
    name: group.name,
    course: group.course ?? "",
    description: group.description ?? "",
    inviteCode: group.inviteCode,
    memberNames: group.memberships.map((membership) => membership.user.displayName || membership.user.email || "UIC Student"),
    setIds: group.linkedSets.map((link) => link.setId),
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

export async function getStudyWorkspacePayload(studyUserId: string) {
  const [sets, sessions, groups] = await Promise.all([
    prisma.studySet.findMany({
      where: { ownerId: studyUserId },
      include: { flashcards: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.studySession.findMany({
      where: { userId: studyUserId },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    prisma.studyGroup.findMany({
      where: {
        memberships: {
          some: {
            userId: studyUserId,
          },
        },
      },
      include: {
        memberships: {
          include: {
            user: true,
          },
          orderBy: {
            joinedAt: "asc",
          },
        },
        linkedSets: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    sets: sets.map((set) => serializeStudySet(set)),
    groups: groups.map((group) => serializeStudyGroup(group)),
    sessions: sessions.map((session) => serializeStudySession(session)),
  };
}
