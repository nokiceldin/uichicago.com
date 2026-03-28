import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { buildConversationTitle, normalizeStoredMessages, serializeConversationList, type StoredChatMessage } from "@/lib/chat/conversations";

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      return NextResponse.json({ items: [] });
    }

    const items = await serializeConversationList(session.user.id);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Failed to load chat conversations", error);
    return NextResponse.json({ items: [], error: "Failed to load conversations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const messages = normalizeStoredMessages(Array.isArray(body.messages) ? (body.messages as StoredChatMessage[]) : []);
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : buildConversationTitle(messages);

    const conversation = await prisma.chatConversation.create({
      data: {
        userId: session.user.id,
        title: title || "New chat",
        messagesJson: JSON.stringify(messages),
        messageCount: messages.length,
        lastMessageAt: new Date(),
      },
    });

    return NextResponse.json({
      id: conversation.id,
      title: conversation.title,
      messageCount: conversation.messageCount,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      lastMessageAt: conversation.lastMessageAt.toISOString(),
      messages,
    });
  } catch (error) {
    console.error("Failed to create chat conversation", error);
    return NextResponse.json({ error: "Failed to create conversation." }, { status: 500 });
  }
}
