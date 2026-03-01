import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/match/:id
 * Read-only. Full match state and transcript for battle viewer.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      agentA: { select: { id: true, displayName: true } },
      agentB: { select: { id: true, displayName: true } },
      gym: { select: { id: true, name: true } },
    },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  return NextResponse.json({
    matchId: match.id,
    type: match.type,
    status: match.status,
    agentA: match.agentA ? { id: match.agentA.id, displayName: match.agentA.displayName } : null,
    agentB: match.agentB ? { id: match.agentB.id, displayName: match.agentB.displayName } : null,
    gym: match.gym ? { id: match.gym.id, name: match.gym.name } : null,
    state: match.state,
    transcript: match.transcript,
    winnerId: match.winnerId,
    createdAt: match.createdAt,
  });
}
