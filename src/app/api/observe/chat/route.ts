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

/** Min gap between messages from the same author in the same stream (ms). */
const STREAM_RATE_WINDOW_MS = 2000; // 1 message per 2 seconds per stream
/** Max messages from same author across all streams in this window. */
const GLOBAL_RATE_LIMIT_COUNT = 5;
const GLOBAL_RATE_WINDOW_MS = 10_000;
/** Same message by same user or same IP (session) in this stream within 60s → reject. */
const DUPLICATE_MESSAGE_WINDOW_MS = 60_000;

function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

/** Normalize for duplicate check: trim, collapse whitespace, lowercase. */
function normalizeMessageForDedup(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * POST /api/observe/chat
 * Body: { streamAgentId: string, author: string, message: string }
 * Send a chat message (no auth; author is display name).
 * Rate limited + duplicate blocked: same text by same user or same IP in 60s = reject.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const streamAgentId = typeof body.streamAgentId === "string" ? body.streamAgentId.trim() : "";
    const author = typeof body.author === "string" ? body.author.trim().slice(0, 64) || "Anonymous" : "Anonymous";
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
    const clientIp = getClientIp(req);

    if (!streamAgentId) {
      return NextResponse.json({ error: "streamAgentId required" }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const now = new Date();
    const streamWindowStart = new Date(now.getTime() - STREAM_RATE_WINDOW_MS);
    const globalWindowStart = new Date(now.getTime() - GLOBAL_RATE_WINDOW_MS);
    const duplicateWindowStart = new Date(now.getTime() - DUPLICATE_MESSAGE_WINDOW_MS);
    const normalizedMessage = normalizeMessageForDedup(message);

    // 1) Duplicate check first: same message in last 60s by same author OR same IP (stops scripts that change name)
    const recentInStreamForDedup = await prisma.watchChatMessage.findMany({
      where: {
        streamAgentId,
        createdAt: { gte: duplicateWindowStart },
        OR: [
          { author },
          ...(clientIp ? [{ clientIp }] : []),
        ],
      },
      select: { message: true },
      take: 50,
    });
    const isDuplicate = recentInStreamForDedup.some(
      (m) => normalizeMessageForDedup(m.message) === normalizedMessage
    );
    if (isDuplicate) {
      return NextResponse.json(
        { error: "That message was already sent in the last 60 seconds (by you or this session). Say something different or wait." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    // 2) Same author, same stream: at most 1 message per 2 seconds
    const recentInStream = await prisma.watchChatMessage.findFirst({
      where: {
        streamAgentId,
        author,
        createdAt: { gte: streamWindowStart },
      },
      select: { id: true },
    });
    if (recentInStream) {
      return NextResponse.json(
        { error: "Slow down — one message every 2 seconds in this stream." },
        { status: 429, headers: { "Retry-After": "2" } }
      );
    }

    // 3) Same author, any stream: cap at 5 messages per 10 seconds
    const recentGlobalCount = await prisma.watchChatMessage.count({
      where: {
        author,
        createdAt: { gte: globalWindowStart },
      },
    });
    if (recentGlobalCount >= GLOBAL_RATE_LIMIT_COUNT) {
      return NextResponse.json(
        { error: "Slow down — too many messages across streams. Try again in a few seconds." },
        { status: 429, headers: { "Retry-After": "10" } }
      );
    }

    const created = await prisma.watchChatMessage.create({
      data: { streamAgentId, author, message, clientIp },
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
