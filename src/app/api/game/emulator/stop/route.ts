import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateSeasonStatsAndCheckGoal } from "@/lib/season";
import { NextResponse } from "next/server";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

/**
 * POST /api/game/emulator/stop
 * End the authenticated agent's emulator session. Adds this session's playtime to profile.totalPlaytimeSeconds.
 */
export async function POST(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let sessionTimeSeconds = 0;
    let pokedexOwned = 0;
    let pokedexSeen = 0;
    let badgesCount = 0;
    let maxLevel = 1;
    try {
      const stateRes = await fetch(`${EMULATOR_URL}/session/${encodeURIComponent(agent.id)}/state`, { cache: "no-store" });
      if (stateRes.ok) {
        const state = (await stateRes.json().catch(() => ({}))) as Record<string, unknown>;
        sessionTimeSeconds = (state.sessionTimeSeconds as number) ?? 0;
        pokedexOwned = (state.pokedexOwned as number) ?? 0;
        pokedexSeen = (state.pokedexSeen as number) ?? 0;
        badgesCount = typeof state.badges === "number" ? state.badges : (Array.isArray(state.badges) ? (state.badges as unknown[]).length : 0);
        const levels = (state.levels as number[]) ?? [];
        maxLevel = levels.length > 0 ? Math.max(1, ...levels) : 1;
      }
    } catch {
      // ignore
    }

    await fetch(`${EMULATOR_URL}/session/${agent.id}/stop`, {
      method: "POST",
    });

    const now = new Date().toISOString();
    await prisma.eventLog.create({
      data: { agentId: agent.id, line: `Session ended at ${now}` },
    }).catch(() => {});

    const existing = await prisma.agentProfile.findUnique({
      where: { agentId: agent.id },
      select: { pokedexOwnedCount: true, pokedexSeenCount: true, level: true, badges: true },
    });

    const maxBadges = Math.max(
      Array.isArray(existing?.badges) ? (existing.badges as unknown[]).length : 0,
      badgesCount
    );
    const badges = Array.from({ length: maxBadges }, (_, i) => `badge_${i + 1}`);

    await prisma.agentProfile.upsert({
      where: { agentId: agent.id },
      create: {
        agentId: agent.id,
        name: agent.displayName ?? "Agent",
        totalPlaytimeSeconds: sessionTimeSeconds,
        pokedexOwnedCount: pokedexOwned,
        pokedexSeenCount: pokedexSeen,
        badges,
        level: maxLevel,
      },
      update: {
        totalPlaytimeSeconds: { increment: sessionTimeSeconds },
        pokedexOwnedCount: { set: Math.max(existing?.pokedexOwnedCount ?? 0, pokedexOwned) },
        pokedexSeenCount: { set: Math.max(existing?.pokedexSeenCount ?? 0, pokedexSeen) },
        badges: { set: badges },
        level: { set: Math.max(existing?.level ?? 1, maxLevel) },
      },
    });

    // Session summary for Agent of the Week (last 7 days)
    if (sessionTimeSeconds > 0 || pokedexOwned > 0 || pokedexSeen > 0) {
      await prisma.sessionSummary.create({
        data: {
          agentId: agent.id,
          endedAt: new Date(),
          playtimeSeconds: sessionTimeSeconds,
          pokedexOwned,
          pokedexSeen,
          badgesCount,
        },
      }).catch(() => {});
    }

    // Update season stats and check if goal is met (crown champion, advance to next season)
    await updateSeasonStatsAndCheckGoal(agent.id, {
      pokedexOwned,
      pokedexSeen,
      level: maxLevel,
      badgesCount,
      playtimeSeconds: sessionTimeSeconds,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: true, message: "Service unreachable" });
  }
}
