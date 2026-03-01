import { NextResponse } from "next/server";
import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/game/gym/status?gymId=...
 */
export async function GET(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const gymId = searchParams.get("gymId");
  if (!gymId) {
    return NextResponse.json({ error: "gymId required" }, { status: 400 });
  }

  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    include: { waitlist: { orderBy: { rankScore: "desc" }, take: 30 } },
  });
  if (!gym) {
    return NextResponse.json({ error: "Gym not found" }, { status: 404 });
  }

  const nextTournament = new Date();
  nextTournament.setHours(nextTournament.getHours() + 1);
  nextTournament.setMinutes(0, 0, 0);

  const entry = await prisma.gymWaitlistEntry.findUnique({
    where: { gymId_agentId: { gymId, agentId: agent.id } },
  });

  return NextResponse.json({
    gymId: gym.id,
    name: gym.name,
    cityName: gym.cityName,
    badgeId: gym.badgeId,
    waitlistCount: gym.waitlist.length,
    nextTournamentTime: nextTournament.toISOString(),
    youAreOnWaitlist: !!entry,
    yourRankScore: entry?.rankScore ?? null,
  });
}
