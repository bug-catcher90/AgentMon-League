/**
 * Season logic: get current season, update agent stats on session end, check goal, crown champion, auto-advance.
 */

import { prisma } from "@/lib/db";

export async function getCurrentSeason() {
  return prisma.season.findFirst({
    where: { status: "active" },
    orderBy: { number: "asc" },
  });
}

export async function updateSeasonStatsAndCheckGoal(
  agentId: string,
  data: { pokedexOwned: number; pokedexSeen: number; level: number; badgesCount: number; playtimeSeconds: number }
) {
  const season = await getCurrentSeason();
  if (!season) return;

  const existing = await prisma.seasonAgentStat.findUnique({
    where: { seasonId_agentId: { seasonId: season.id, agentId } },
  });

  const newPokedexOwned = Math.max(existing?.pokedexOwned ?? 0, data.pokedexOwned);
  const newPokedexSeen = Math.max(existing?.pokedexSeen ?? 0, data.pokedexSeen);
  const newLevel = Math.max(existing?.level ?? 1, data.level);
  const newBadgesCount = Math.max(existing?.badgesCount ?? 0, data.badgesCount);
  const newPlaytime = (existing?.playtimeSeconds ?? 0) + data.playtimeSeconds;

  await prisma.seasonAgentStat.upsert({
    where: { seasonId_agentId: { seasonId: season.id, agentId } },
    create: {
      seasonId: season.id,
      agentId,
      pokedexOwned: newPokedexOwned,
      pokedexSeen: newPokedexSeen,
      level: newLevel,
      badgesCount: newBadgesCount,
      playtimeSeconds: newPlaytime,
    },
    update: {
      pokedexOwned: newPokedexOwned,
      pokedexSeen: newPokedexSeen,
      level: newLevel,
      badgesCount: newBadgesCount,
      playtimeSeconds: newPlaytime,
    },
  });

  // Check if this agent just met the goal
  const met = checkGoalMet(season.goalKind, season.goalValue, newPokedexOwned, newBadgesCount, newLevel);
  if (met) {
    await prisma.season.update({
      where: { id: season.id },
      data: { status: "ended", championId: agentId, endedAt: new Date() },
    });
    // Auto-advance: activate next season
    const next = await prisma.season.findFirst({
      where: { number: season.number + 1 },
    });
    if (next) {
      await prisma.season.update({
        where: { id: next.id },
        data: { status: "active" },
      });
    }
  }
}

function checkGoalMet(goalKind: string, goalValue: number, pokedexOwned: number, badgesCount: number, level: number): boolean {
  if (goalKind === "first_to_catch_n") return pokedexOwned >= goalValue;
  if (goalKind === "first_to_badges_n") return badgesCount >= goalValue;
  if (goalKind === "first_to_level_n") return level >= goalValue;
  return false;
}
