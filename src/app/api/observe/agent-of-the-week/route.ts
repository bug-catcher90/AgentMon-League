import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Weights: playtime (seconds), pokedexSeen * 10, pokedexOwned * 50, badgesCount * 500
const WEIGHT_PLAYTIME = 1;
const WEIGHT_SEEN = 10;
const WEIGHT_OWNED = 50;
const WEIGHT_BADGES = 500;

/**
 * GET /api/observe/agent-of-the-week
 * Top agent in the last 7 days by: playtimeSeconds + pokedexSeen*10 + pokedexOwned*50 + badgesCount*500
 */
export async function GET() {
  const since = new Date(Date.now() - WEEK_MS);

  const summaries = await prisma.sessionSummary.findMany({
    where: { endedAt: { gte: since } },
  });

  const byAgent = new Map<
    string,
    { playtimeSeconds: number; pokedexSeen: number; pokedexOwned: number; badgesCount: number }
  >();

  for (const s of summaries) {
    const cur = byAgent.get(s.agentId) ?? {
      playtimeSeconds: 0,
      pokedexSeen: 0,
      pokedexOwned: 0,
      badgesCount: 0,
    };
    cur.playtimeSeconds += s.playtimeSeconds;
    cur.pokedexSeen = Math.max(cur.pokedexSeen, s.pokedexSeen);
    cur.pokedexOwned = Math.max(cur.pokedexOwned, s.pokedexOwned);
    cur.badgesCount = Math.max(cur.badgesCount, s.badgesCount);
    byAgent.set(s.agentId, cur);
  }

  if (byAgent.size === 0) {
    return NextResponse.json({ agent: null });
  }

  const scored = Array.from(byAgent.entries())
    .map(([agentId, stats]) => ({
      agentId,
      ...stats,
      score:
        stats.playtimeSeconds * WEIGHT_PLAYTIME +
        stats.pokedexSeen * WEIGHT_SEEN +
        stats.pokedexOwned * WEIGHT_OWNED +
        stats.badgesCount * WEIGHT_BADGES,
    }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0]!;
  const agent = await prisma.agent.findUnique({
    where: { id: top.agentId },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      profile: { select: { name: true } },
    },
  });

  if (!agent) return NextResponse.json({ agent: null });

  return NextResponse.json({
    agent: {
      agentId: agent.id,
      displayName: agent.displayName,
      avatarUrl: agent.avatarUrl,
      name: agent.profile?.name ?? agent.displayName ?? "Agent",
      playtimeSeconds: top.playtimeSeconds,
      pokedexSeen: top.pokedexSeen,
      pokedexOwned: top.pokedexOwned,
      badgesCount: top.badgesCount,
      score: top.score,
    },
  });
}
