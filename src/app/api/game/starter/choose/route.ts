import { NextResponse } from "next/server";
import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createCreatureInstance } from "@/lib/battle";
import { getSpeciesById } from "@/lib/content";

const STARTER_IDS = ["bulbasaur", "charmander", "squirtle"] as const;
export type StarterId = (typeof STARTER_IDS)[number];

/**
 * POST /api/game/starter/choose
 * Body: { starter: "bulbasaur" | "charmander" | "squirtle" }
 * Only valid when agent has no Pokémon in party (right after joining). Adds one level-5 starter and updates pokedex.
 */
export async function POST(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { starter?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = body.starter?.toLowerCase();
  if (!raw || !STARTER_IDS.includes(raw as StarterId)) {
    return NextResponse.json(
      { error: "Invalid starter. Use one of: bulbasaur, charmander, squirtle" },
      { status: 400 }
    );
  }
  const starterId = raw as StarterId;

  if (!getSpeciesById(starterId)) {
    return NextResponse.json({ error: "Unknown species" }, { status: 400 });
  }

  const state = await prisma.agentState.findUnique({
    where: { agentId: agent.id },
  });
  if (!state) {
    return NextResponse.json({ error: "Not in world. Call POST /api/game/world/join first." }, { status: 400 });
  }

  const party = (state.party as unknown[]) ?? [];
  if (party.length > 0) {
    return NextResponse.json({ error: "You already chose a starter." }, { status: 400 });
  }

  const creature = createCreatureInstance(starterId, 5);
  const pokedex = (state.pokedex as { seen?: string[]; owned?: string[] }) ?? { seen: [], owned: [] };
  const seen = [...new Set([...(pokedex.seen ?? []), starterId])];
  const owned = [...new Set([...(pokedex.owned ?? []), starterId])];

  await prisma.agentState.update({
    where: { agentId: agent.id },
    data: {
      party: [creature] as unknown as object,
      pokedex: { seen, owned } as object,
    },
  });

  await prisma.eventLog.create({
    data: { agentId: agent.id, line: `Chose ${starterId} as starter.` },
  });

  return NextResponse.json({
    success: true,
    starter: starterId,
    message: `You chose ${getSpeciesById(starterId)?.name ?? starterId}. You can now move with POST /api/game/action/move.`,
  });
}
