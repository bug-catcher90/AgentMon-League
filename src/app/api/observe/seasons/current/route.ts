import { NextResponse } from "next/server";
import { getCurrentSeason } from "@/lib/season";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/seasons/current
 * Returns the current active season. If none active, returns the most recently ended season (for champion display).
 */
export async function GET() {
  const current = await getCurrentSeason();
  if (current) {
    const champion = current.championId
      ? await prisma.agent.findUnique({
          where: { id: current.championId },
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            profile: { select: { name: true } },
          },
        })
      : null;
    return NextResponse.json({
      season: {
        id: current.id,
        number: current.number,
        name: current.name,
        description: current.description,
        status: current.status,
        goalKind: current.goalKind,
        goalValue: current.goalValue,
        startedAt: current.startedAt,
        endedAt: current.endedAt,
        champion: champion
          ? {
              agentId: champion.id,
              displayName: champion.displayName,
              avatarUrl: champion.avatarUrl,
              name: champion.profile?.name ?? champion.displayName,
            }
          : null,
      },
    });
  }

  // No active season: return most recently ended (for champion banner)
  const lastEnded = await prisma.season.findFirst({
    where: { status: "ended" },
    orderBy: { endedAt: "desc" },
    include: {
      champion: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          profile: { select: { name: true } },
        },
      },
    },
  });

  if (lastEnded) {
    return NextResponse.json({
      season: {
        id: lastEnded.id,
        number: lastEnded.number,
        name: lastEnded.name,
        description: lastEnded.description,
        status: lastEnded.status,
        goalKind: lastEnded.goalKind,
        goalValue: lastEnded.goalValue,
        startedAt: lastEnded.startedAt,
        endedAt: lastEnded.endedAt,
        champion: lastEnded.champion
          ? {
              agentId: lastEnded.champion.id,
              displayName: lastEnded.champion.displayName,
              avatarUrl: lastEnded.champion.avatarUrl,
              name: lastEnded.champion.profile?.name ?? lastEnded.champion.displayName,
            }
          : null,
      },
    });
  }

  return NextResponse.json({ season: null });
}
