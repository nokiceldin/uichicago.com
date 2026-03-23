import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const client = new Anthropic();

export interface UserMemory {
  major?: string;
  year?: string; // freshman, sophomore, junior, senior, grad
  interests?: string[];
  struggles?: string[];
  goals?: string[];
  knownCourses?: string[];
  knownPrefs?: string[]; // e.g. "prefers easy graders", "pre-med"
  lastTopics?: string[];
}

// Extract facts about the user from their messages
async function extractMemoryUpdate(
  messages: { role: string; content: string }[],
  existingMemory: UserMemory
): Promise<UserMemory | null> {
  try {
    const recentMessages = messages.slice(-6).map(m => `${m.role}: ${m.content}`).join("\n");

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Extract facts about this UIC student from their conversation. Only include things clearly stated or strongly implied. Return JSON only, no explanation.

Existing memory: ${JSON.stringify(existingMemory)}

Recent messages:
${recentMessages}

Return updated JSON with only these fields (omit if unknown):
{
  "major": "string or null",
  "year": "freshman|sophomore|junior|senior|grad or null",
  "interests": ["array of academic/career interests"],
  "struggles": ["courses or topics they're struggling with"],
  "goals": ["career goals, transfer plans, etc"],
  "knownCourses": ["courses they've mentioned taking or planning"],
  "knownPrefs": ["preferences like pre-med, wants easy grades, commuter, etc"],
  "lastTopics": ["last 3 topics discussed"]
}

If nothing new to add, return the existing memory unchanged. Return valid JSON only.`
      }],
    });

    const text = (response.content[0] as any)?.text?.trim() ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

// Get or create session memory
export async function getMemory(sessionId: string): Promise<UserMemory> {
  try {
    const session = await prisma.conversationSession.findUnique({
      where: { sessionId },
    });
    if (!session) return {};
    return JSON.parse(session.memory) as UserMemory;
  } catch {
    return {};
  }
}

// Update memory after each conversation turn
export async function updateMemory(
  sessionId: string,
  messages: { role: string; content: string }[],
  currentMemory: UserMemory
): Promise<UserMemory> {
  // Only update memory every 3 messages to save cost
  const session = await prisma.conversationSession.findUnique({
    where: { sessionId },
    select: { messageCount: true },
  });

  const count = session?.messageCount ?? 0;
  const shouldUpdate = count % 3 === 0 || count < 3;

  let newMemory = currentMemory;

  if (shouldUpdate && messages.length > 0) {
    const extracted = await extractMemoryUpdate(messages, currentMemory);
    if (extracted) newMemory = extracted;
  }

  // Upsert session
  await prisma.conversationSession.upsert({
    where: { sessionId },
    create: {
      sessionId,
      memory: JSON.stringify(newMemory),
      messageCount: 1,
      lastSeenAt: new Date(),
    },
    update: {
      memory: JSON.stringify(newMemory),
      messageCount: { increment: 1 },
      lastSeenAt: new Date(),
    },
  });

  return newMemory;
}

// Format memory into a context string for the system prompt
export function formatMemoryForPrompt(memory: UserMemory): string {
  if (!memory || Object.keys(memory).length === 0) return "";

  const parts: string[] = [];
  if (memory.major) parts.push(`Major: ${memory.major}`);
  if (memory.year) parts.push(`Year: ${memory.year}`);
  if (memory.interests?.length) parts.push(`Interests: ${memory.interests.join(", ")}`);
  if (memory.struggles?.length) parts.push(`Struggling with: ${memory.struggles.join(", ")}`);
  if (memory.goals?.length) parts.push(`Goals: ${memory.goals.join(", ")}`);
  if (memory.knownCourses?.length) parts.push(`Courses mentioned: ${memory.knownCourses.join(", ")}`);
  if (memory.knownPrefs?.length) parts.push(`Preferences: ${memory.knownPrefs.join(", ")}`);

  if (parts.length === 0) return "";

  return `=== WHAT I KNOW ABOUT THIS STUDENT ===\n${parts.join("\n")}\n(Use this to personalize your response — don't repeat these facts back robotically, just factor them in naturally)`;
}