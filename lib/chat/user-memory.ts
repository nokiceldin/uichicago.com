export interface UserMemory {
  major?: string;
  year?: string;
  interests?: string[];
  struggles?: string[];
  goals?: string[];
  knownCourses?: string[];
  completedCourses?: string[];
  knownPrefs?: string[];
  lastTopics?: string[];
}

export function getAccountMemoryKey(userId: string): string {
  return `sparky_account_${userId}`;
}

export function mergeUserMemory(
  accountMemory: UserMemory | null | undefined,
  conversationMemory: UserMemory | null | undefined,
): UserMemory {
  const account = accountMemory ?? {};
  const conversation = conversationMemory ?? {};
  const mergeList = (first?: string[], second?: string[]) =>
    Array.from(new Set([...(first ?? []), ...(second ?? [])])).slice(0, 50);

  return {
    major: conversation.major ?? account.major,
    year: conversation.year ?? account.year,
    interests: mergeList(account.interests, conversation.interests),
    struggles: mergeList(account.struggles, conversation.struggles),
    goals: mergeList(account.goals, conversation.goals),
    knownCourses: mergeList(account.knownCourses, conversation.knownCourses),
    completedCourses: mergeList(account.completedCourses, conversation.completedCourses),
    knownPrefs: mergeList(account.knownPrefs, conversation.knownPrefs),
    lastTopics: mergeList(conversation.lastTopics, account.lastTopics).slice(0, 3),
  };
}
