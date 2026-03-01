import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/gym/:id
 * Read-only. Gym info, current/last tournament bracket, live matches.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const gym = await prisma.gym.findUnique({
    where: { id },
    include: {
      waitlist: { orderBy: { rankScore: "desc" }, take: 30, include: { agent: { select: { displayName: true } } } },
      tournaments: { orderBy: { startedAt: "desc" }, take: 1, include: { matches: { include: { match: true } } } },
    },
  });
  if (!gym) {
    return NextResponse.json({ error: "Gym not found" }, { status: 404 });
  }

  const latestTournament = gym.tournaments[0];
  const bracket = latestTournament?.bracket as Record<string, unknown> | undefined;
  const liveMatches = latestTournament?.matches?.filter((gm) => gm.match.status === "ACTIVE") ?? [];

  return NextResponse.json({
    gymId: gym.id,
    name: gym.name,
    cityName: gym.cityName,
    badgeId: gym.badgeId,
    x: gym.x,
    y: gym.y,
    waitlist: gym.waitlist.map((e) => ({
      agentId: e.agentId,
      displayName: e.agent.displayName,
      rankScore: e.rankScore,
    })),
    latestTournament: latestTournament
      ? {
          id: latestTournament.id,
          status: latestTournament.status,
          startedAt: latestTournament.startedAt,
          winnerId: latestTournament.winnerId,
          bracket,
        }
      : null,
    liveMatches: liveMatches.map((gm) => ({
      matchId: gm.matchId,
      round: gm.round,
      slot: gm.slot,
      state: gm.match.state,
      transcript: gm.match.transcript,
    })),
  });
}
