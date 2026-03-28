import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { buildConversationTitle, normalizeStoredMessages, parseConversationMessages, type StoredChatMessage } from "@/lib/chat/conversations";

async function getOwnedConversation(userId: string, id: string) {
  return prisma.chatConversation.findFirst({
    where: {
      id,
      userId,
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = await getOwnedConversation(session.user.id, id);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: conversation.id,
    title: conversation.title,
    messageCount: conversation.messageCount,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    lastMessageAt: conversation.lastMessageAt.toISOString(),
    messages: parseConversationMessages(conversation.messagesJson),
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getOwnedConversation(session.user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const hasMessages = Array.isArray(body.messages);
  const messages = hasMessages
    ? normalizeStoredMessages(body.messages as StoredChatMessage[])
    : parseConversationMessages(existing.messagesJson);
  const explicitTitle = typeof body.title === "string" ? body.title.trim() : "";
  const title = explicitTitle || buildConversationTitle(messages) || existing.title || "New chat";

  const updated = await prisma.chatConversation.update({
    where: { id: existing.id },
    data: {
      title,
      messagesJson: hasMessages ? JSON.stringify(messages) : existing.messagesJson,
      messageCount: hasMessages ? messages.length : existing.messageCount,
      lastMessageAt: hasMessages && messages.length > 0 ? new Date() : existing.lastMessageAt,
    },
  });

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    messageCount: updated.messageCount,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    lastMessageAt: updated.lastMessageAt.toISOString(),
    messages,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getOwnedConversation(session.user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.chatConversation.delete({
    where: { id: existing.id },
  });

  return NextResponse.json({ ok: true });
}
