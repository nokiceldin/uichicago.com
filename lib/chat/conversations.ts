import prisma from "@/lib/prisma";

export type StoredChatAttachment = {
  name: string;
  fileType: "image" | "pdf" | "text";
  preview?: string;
};

export type StoredChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  streaming?: boolean;
  attachment?: StoredChatAttachment;
};

export function normalizeStoredMessages(messages: StoredChatMessage[]): StoredChatMessage[] {
  return messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      error: message.error ?? false,
      streaming: false,
      attachment: message.attachment,
    }));
}

export function buildConversationTitle(messages: StoredChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user" && message.content.trim())?.content.trim();
  if (!firstUserMessage) return "New chat";
  return firstUserMessage.length > 60 ? `${firstUserMessage.slice(0, 60).trimEnd()}...` : firstUserMessage;
}

export function parseConversationMessages(messagesJson: string): StoredChatMessage[] {
  try {
    const parsed = JSON.parse(messagesJson);
    return Array.isArray(parsed) ? normalizeStoredMessages(parsed) : [];
  } catch {
    return [];
  }
}

export async function serializeConversationList(userId: string) {
  const conversations = await prisma.chatConversation.findMany({
    where: { userId },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
  });

  return conversations.map((conversation) => {
    const messages = parseConversationMessages(conversation.messagesJson);
    const preview = [...messages].reverse().find((message) => message.content.trim())?.content ?? "";

    return {
      id: conversation.id,
      title: conversation.title,
      preview,
      messageCount: conversation.messageCount,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      lastMessageAt: conversation.lastMessageAt.toISOString(),
    };
  });
}
