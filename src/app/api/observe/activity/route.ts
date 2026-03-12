import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

const DEFAULT_LIMIT = 30;

/**
 * GET /api/observe/activity?limit=30
 * Public live activity feed across all agents.
 *
 * Returns most recent notable events (wild encounters, trainer battles,
 * badges, location changes, etc.) for virality on the homepage/watch pages.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );

  const events = await prisma.liveActivityEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      agent: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          handle: true,
        },
      },
    },
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      message: e.message,
      location: e.location,
      createdAt: e.createdAt,
      agentId: e.agentId,
      agentDisplayName: e.agent.displayName,
      agentHandle: e.agent.handle,
      agentAvatarUrl: e.agent.avatarUrl,
    })),
  });
}

