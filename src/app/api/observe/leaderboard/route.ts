import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSeason } from "@/lib/season";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/leaderboard?limit=10&season=current|all
 * season=current (default): top agents for the active season (SeasonAgentStat).
 * season=all: top agents by profile (level, pokedex, wins) — all-time.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10) || 10));
  const seasonMode = searchParams.get("season") === "all" ? "all" : "current";

  let liveAgentIds: string[] = [];
  try {
    const res = await fetch(`${EMULATOR_URL}/sessions`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ agent_ids: [] }));
    liveAgentIds = data.agent_ids ?? [];
  } catch {
    // Emulator unreachable
  }
  const liveSet = new Set(liveAgentIds);

  if (seasonMode === "current") {
    const currentSeason = await getCurrentSeason();
    if (currentSeason) {
      const stats = await prisma.seasonAgentStat.findMany({
        where: { seasonId: currentSeason.id },
        orderBy: [
          { pokedexOwned: "desc" },
          { pokedexSeen: "desc" },
          { badgesCount: "desc" },
          { playtimeSeconds: "desc" },
        ],
        take: limit,
        include: {
          agent: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
              profile: { select: { name: true } },
            },
          },
        },
      });

      return NextResponse.json({
        season: { number: currentSeason.number, name: currentSeason.name, status: currentSeason.status },
        leaderboard: stats.map((s, i) => ({
          rank: i + 1,
          agentId: s.agent.id,
          name: (s.agent.profile?.name ?? s.agent.displayName) || "Agent",
          displayName: s.agent.displayName,
          avatarUrl: s.agent.avatarUrl ?? null,
          level: s.level,
          pokedexOwnedCount: s.pokedexOwned,
          pokedexSeenCount: s.pokedexSeen,
          badges: Array.from({ length: s.badgesCount }, (_, j) => `badge_${j + 1}`),
          wins: 0,
          losses: 0,
          gymWins: 0,
          isOnline: liveSet.has(s.agentId),
        })),
      });
    }
  }

  // Fallback: all-time leaderboard from profile
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
    season: null,
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
