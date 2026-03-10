import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/chat?streamAgentId=xxx&limit=50
 * List recent messages for a stream (agent being watched).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const streamAgentId = searchParams.get("streamAgentId");
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));

  if (!streamAgentId?.trim()) {
    return NextResponse.json({ error: "streamAgentId required" }, { status: 400 });
  }

  const messages = await prisma.watchChatMessage.findMany({
    where: { streamAgentId: streamAgentId.trim() },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      author: m.author,
      message: m.message,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

/**
 * POST /api/observe/chat
 * Body: { streamAgentId: string, author: string, message: string }
 * Send a chat message (no auth; author is display name).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const streamAgentId = typeof body.streamAgentId === "string" ? body.streamAgentId.trim() : "";
    const author = typeof body.author === "string" ? body.author.trim().slice(0, 64) || "Anonymous" : "Anonymous";
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";

    if (!streamAgentId) {
      return NextResponse.json({ error: "streamAgentId required" }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const created = await prisma.watchChatMessage.create({
      data: { streamAgentId, author, message },
    });

    return NextResponse.json({
      id: created.id,
      author: created.author,
      message: created.message,
      createdAt: created.createdAt.toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
