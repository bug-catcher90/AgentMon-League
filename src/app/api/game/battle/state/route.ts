import { NextResponse } from "next/server";
import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/game/battle/state?matchId=...
 * Returns current battle state and transcript for the given match.
 */
export async function GET(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId");
  if (!matchId) {
    return NextResponse.json({ error: "matchId required" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.agentAId !== agent.id && match.agentBId !== agent.id) {
    return NextResponse.json({ error: "Not your match" }, { status: 403 });
  }

  return NextResponse.json({
    matchId: match.id,
    type: match.type,
    status: match.status,
    state: match.state,
    transcript: match.transcript,
    winnerId: match.winnerId,
  });
}
