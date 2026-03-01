import { NextResponse } from "next/server";
import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/game/gym/join-waitlist
 * Body: { gymId: string }
 */
export async function POST(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { gymId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { gymId } = body;
  if (!gymId) {
    return NextResponse.json({ error: "gymId required" }, { status: 400 });
  }

  const gym = await prisma.gym.findUnique({ where: { id: gymId } });
  if (!gym) {
    return NextResponse.json({ error: "Gym not found" }, { status: 404 });
  }

  const profile = await prisma.agentProfile.findUnique({ where: { agentId: agent.id } });
  const rankScore = (profile?.wins ?? 0) * 10 + (profile?.level ?? 1);

  await prisma.gymWaitlistEntry.upsert({
    where: {
      gymId_agentId: { gymId, agentId: agent.id },
    },
    update: { rankScore },
    create: {
      gymId,
      agentId: agent.id,
      rankScore,
    },
  });

  return NextResponse.json({
    success: true,
    message: "Joined gym waitlist. Top 24 by rank will enter the next hourly tournament.",
  });
}
