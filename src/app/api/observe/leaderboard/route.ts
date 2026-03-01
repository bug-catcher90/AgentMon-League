import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/leaderboard?limit=10
 * Top agents by level (then by pokedex, then wins). isOnline = has active emulator session.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10) || 10));

  let liveAgentIds: string[] = [];
  try {
    const res = await fetch(`${EMULATOR_URL}/sessions`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ agent_ids: [] }));
    liveAgentIds = data.agent_ids ?? [];
  } catch {
    // Emulator unreachable
  }
  const liveSet = new Set(liveAgentIds);

  const profiles = await prisma.agentProfile.findMany({
    orderBy: [{ level: "desc" }, { pokedexOwnedCount: "desc" }, { wins: "desc" }],
    take: limit,
    include: {
      agent: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
  });

  return NextResponse.json({
    leaderboard: profiles.map((p, i) => ({
      rank: i + 1,
      agentId: p.agent.id,
      name: p.name,
      displayName: p.agent.displayName,
      avatarUrl: p.agent.avatarUrl ?? null,
      level: p.level,
      pokedexOwnedCount: p.pokedexOwnedCount,
      pokedexSeenCount: p.pokedexSeenCount,
      badges: p.badges as string[],
      wins: p.wins,
      losses: p.losses,
      gymWins: p.gymWins,
      isOnline: liveSet.has(p.agentId),
    })),
  });
}
