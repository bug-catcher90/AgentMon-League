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
    let emulatorStateSnapshot: Record<string, unknown> | null = null;
    try {
      const stateRes = await fetch(`${EMULATOR_URL}/session/${encodeURIComponent(agent.id)}/state`, { cache: "no-store" });
      if (stateRes.ok) {
        const state = (await stateRes.json().catch(() => ({}))) as Record<string, unknown>;
        emulatorStateSnapshot = state;
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

    const stopRes = await fetch(`${EMULATOR_URL}/session/${agent.id}/stop`, {
      method: "POST",
    });
    if (!stopRes.ok) {
      const text = await stopRes.text().catch(() => "");
      throw new Error(`Emulator stop failed: ${stopRes.status} ${text}`);
    }

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

    // Persist last known game state to AgentState so profile page shows party/inventory when offline
    if (emulatorStateSnapshot) {
      const world = await prisma.world.findFirst();
      if (world) {
        const rawParty = (emulatorStateSnapshot.party as { speciesId?: string | number; level?: number }[]) ?? [];
        const party = rawParty.map((entry) => ({
          speciesId: typeof entry?.speciesId === "number" ? `species-${entry.speciesId}` : (entry?.speciesId ?? undefined),
          level: entry?.level,
        }));
        const invRaw = emulatorStateSnapshot.inventory as { items?: { id?: string; quantity?: number }[] } | undefined;
        const inventory = Array.isArray(invRaw?.items)
          ? invRaw.items.map((item) => ({ itemId: item?.id ?? "unknown", count: typeof item?.quantity === "number" ? item.quantity : 1 }))
          : [];
        const badgeList = Array.from({ length: badgesCount }, (_, i) => `badge_${i + 1}`);
        const mapName = (emulatorStateSnapshot.mapName as string) ?? "";
        const regionId = mapName ? mapName.toLowerCase().replace(/\s+/g, "_") : null;
        const x = typeof emulatorStateSnapshot.x === "number" ? emulatorStateSnapshot.x : 0;
        const y = typeof emulatorStateSnapshot.y === "number" ? emulatorStateSnapshot.y : 0;

        await prisma.agentState.upsert({
          where: { agentId: agent.id },
          create: {
            agentId: agent.id,
            worldId: world.id,
            x,
            y,
            regionId,
            party: party as object,
            inventory: inventory as object,
            badges: badgeList as object,
            pokedex: { seen: [] as string[], owned: [] as string[] },
          },
          update: {
            x,
            y,
            regionId,
            party: party as object,
            inventory: inventory as object,
            badges: badgeList as object,
          },
        }).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Emulator service unreachable" }, { status: 502 });
  }
}
