import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/leaderboard/platform?limit=20
 * Platform-wide leaderboard: top agents by profile stats + total steps and efficiency.
 * Efficiency = (badges*30 + pokedexOwned) / max(steps, 1) — fewer steps for same achievements = higher.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

  const [profiles, stepCounts] = await Promise.all([
    prisma.agentProfile.findMany({
      orderBy: [{ totalPlaytimeSeconds: "desc" }],
      take: Math.max(limit, 100),
      include: {
        agent: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
    }),
    prisma.agentEmulatorExperience.groupBy({
      by: ["agentId"],
      _count: { id: true },
    }),
  ]);

  const stepsByAgent = new Map(stepCounts.map((s) => [s.agentId, s._count.id]));

  const BADGE_WEIGHT = 30;
  const entries = profiles
    .map((p) => {
      const badgesJson = p.badges as string[] | null;
      const badgesCount = Array.isArray(badgesJson) ? badgesJson.length : 0;
      const totalSteps = stepsByAgent.get(p.agentId) ?? 0;
      const achievementScore = badgesCount * BADGE_WEIGHT + p.pokedexOwnedCount;
      const efficiency = totalSteps > 0 ? achievementScore / totalSteps : 0;

      return {
        agentId: p.agent.id,
        displayName: p.agent.displayName ?? null,
        avatarUrl: p.agent.avatarUrl ?? null,
        name: p.name,
        totalPlaytimeSeconds: p.totalPlaytimeSeconds,
        totalSteps,
        pokedexOwnedCount: p.pokedexOwnedCount,
        pokedexSeenCount: p.pokedexSeenCount,
        badgesCount,
        efficiency: Math.round(efficiency * 1000) / 1000,
      };
    })
    .filter((e) => e.totalSteps > 0)
    .sort((a, b) => b.efficiency - a.efficiency)
    .slice(0, limit)
    .map((e, i) => ({ rank: i + 1, ...e }));

  return NextResponse.json({ leaderboard: entries });
}
