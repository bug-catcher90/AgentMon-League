import { NextResponse } from "next/server";
import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveTurn } from "@/lib/battle";
import type { BattleState } from "@/lib/battle";

/**
 * POST /api/game/battle/action
 * Body: { matchId, action: { type: "move" | "switch" | "item" | "run" | "capture", moveIndex?, creatureIndex?, itemId? } }
 */
export async function POST(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { matchId?: string; action?: { type: string; moveIndex?: number; creatureIndex?: number; itemId?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { matchId, action } = body;
  if (!matchId || !action?.type) {
    return NextResponse.json({ error: "matchId and action required" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.agentAId !== agent.id) {
    return NextResponse.json({ error: "Not your match" }, { status: 403 });
  }
  if (match.status !== "ACTIVE") {
    return NextResponse.json({ error: "Match already ended" }, { status: 400 });
  }

  const state = match.state as unknown as BattleState;
  if (state.phase !== "active" && state.phase !== "switch") {
    return NextResponse.json({ error: "Battle ended" }, { status: 400 });
  }

  let actionA: { type: "move"; moveIndex: number } | { type: "switch"; creatureIndex: number } | { type: "run" } | { type: "capture"; itemId: string };
  if (action.type === "move" && typeof action.moveIndex === "number") {
    actionA = { type: "move", moveIndex: action.moveIndex };
  } else if (action.type === "switch" && typeof action.creatureIndex === "number") {
    actionA = { type: "switch", creatureIndex: action.creatureIndex };
  } else if (action.type === "run") {
    actionA = { type: "run" };
  } else if (action.type === "capture" && action.itemId) {
    actionA = { type: "capture", itemId: action.itemId };
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Wild battle: opponent doesn't act
  const actionB = state.type === "WILD" ? undefined : { type: "move" as const, moveIndex: 0 };
  const { newState, transcriptLines } = resolveTurn(state, actionA, actionB);

  const updatedTranscript = [...(Array.isArray(match.transcript) ? match.transcript : []), ...transcriptLines];

  await prisma.match.update({
    where: { id: matchId },
    data: {
      state: newState as unknown as object,
      transcript: updatedTranscript,
      status: newState.phase === "ended" || newState.phase === "fainted" ? "COMPLETED" : "ACTIVE",
      winnerId: newState.winnerId ?? match.winnerId,
    },
  });

  for (const line of transcriptLines) {
    await prisma.eventLog.create({
      data: { agentId: agent.id, matchId, line },
    });
  }

  if (newState.phase === "ended" || newState.phase === "fainted") {
    await prisma.agentState.updateMany({
      where: { currentMatchId: matchId },
      data: { currentMatchId: null },
    });
    if (newState.winnerId === agent.id && state.type === "WILD") {
      const caught = transcriptLines.some((l) => l.includes("Caught!"));
      const wildCreature = newState.sides[1].creatures[0];
      if (caught && wildCreature) {
        const agentState = await prisma.agentState.findUnique({ where: { agentId: agent.id } });
        if (agentState) {
          const pokedex = (agentState.pokedex as { seen: string[]; owned: string[] }) || { seen: [], owned: [] };
          const speciesId = wildCreature.speciesId;
          if (!pokedex.seen.includes(speciesId)) pokedex.seen.push(speciesId);
          pokedex.owned.push(speciesId);
          const party = (agentState.party as unknown[]) || [];
          const newCreature = {
            ...wildCreature,
            currentHp: wildCreature.maxHp,
            instanceId: `caught_${Date.now()}`,
          };
          party.push(newCreature);
          if (party.length > 6) party.pop();
          await prisma.agentState.update({
            where: { agentId: agent.id },
            data: { pokedex: pokedex as object, party: party as object },
          });
          const profile = await prisma.agentProfile.findUnique({ where: { agentId: agent.id } });
          if (profile) {
            await prisma.agentProfile.update({
              where: { agentId: agent.id },
              data: {
                pokedexOwnedCount: (profile.pokedexOwnedCount ?? 0) + 1,
                pokedexSeenCount: Math.max(profile.pokedexSeenCount ?? 0, (pokedex.seen?.length ?? 0)),
              },
            });
          }
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    state: newState,
    transcriptLines,
    matchStatus: newState.phase === "ended" || newState.phase === "fainted" ? "COMPLETED" : "ACTIVE",
    winnerId: newState.winnerId ?? undefined,
  });
}
