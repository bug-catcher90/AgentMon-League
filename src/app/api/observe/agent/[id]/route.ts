import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getGen1IndexToSpeciesIdMap, getGen1RomOffsetToSpeciesIdMap } from "@/lib/content";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

export const dynamic = "force-dynamic";

/**
 * GET /api/observe/agent/:id
 * Read-only. Public agent profile and recent transcript.
 * Enriches with session playtime and region (mapName) when agent has an active emulator session.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = await prisma.agent.findUnique({
    where: { id },
    include: { profile: true, state: true },
  });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const logs = await prisma.eventLog.findMany({
    where: { agentId: id },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  let sessionPlaytimeSeconds: number | null = null;
  let sessionRegion: string | null = null;
  let emulatorState: {
    party?: unknown[];
    mapName?: string;
    pokedexOwned?: number;
    pokedexSeen?: number;
    inventory?: { count?: number; items?: { id: string; quantity: number }[] };
  } | null = null;
  let recentActions: { step: number; mapName: string; action: string; ts: number }[] = [];
  try {
    const sessRes = await fetch(`${EMULATOR_URL}/sessions`, { cache: "no-store" });
    const sessData = await sessRes.json().catch(() => ({ agent_ids: [] }));
    const agentIds: string[] = sessData.agent_ids ?? [];
    if (agentIds.includes(id)) {
      const [stateRes, actionsRes] = await Promise.all([
        fetch(`${EMULATOR_URL}/session/${encodeURIComponent(id)}/state`, { cache: "no-store" }),
        fetch(`${EMULATOR_URL}/session/${encodeURIComponent(id)}/recent_actions`, { cache: "no-store" }),
      ]);
      if (stateRes.ok) {
        const s = await stateRes.json().catch(() => ({}));
        sessionPlaytimeSeconds = s.sessionTimeSeconds ?? 0;
        sessionRegion = s.mapName ?? null;
        emulatorState = s;
      }
      if (actionsRes.ok) {
        const a = await actionsRes.json().catch(() => ({ recent_actions: [] }));
        recentActions = Array.isArray(a.recent_actions) ? a.recent_actions : [];
      }
    }
  } catch {
    // Emulator unreachable
  }

  const logEntries = logs.map((l) => ({ line: l.line, createdAt: l.createdAt.toISOString() }));
  const actionEntries = recentActions.map((a) => ({
    line: `Steps: ${a.step} | ${a.mapName || "?"} | last: ${a.action}`,
    createdAt: new Date((a.ts || 0) * 1000).toISOString(),
  }));
  const allEntries = [...logEntries, ...actionEntries].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const recentTranscript = allEntries.slice(-30);

  const baseState = agent.state
    ? {
        x: agent.state.x,
        y: agent.state.y,
        level: agent.state.level,
        gold: agent.state.gold,
        party: agent.state.party,
        badges: agent.state.badges,
        inventory: agent.state.inventory,
        regionId: agent.state.regionId ?? null,
      }
    : null;

  // Party: live emulator when session active, else last snapshot from DB (saved on session stop). Resolve species from ROM byte (177=Squirtle, 176=Charmander, 153=Bulbasaur).
  const rawPartySource =
    emulatorState != null &&
    Array.isArray(emulatorState.party) &&
    emulatorState.party.length > 0
      ? emulatorState.party
      : baseState?.party;
  const partyFromLiveEmulator = rawPartySource === (emulatorState?.party ?? undefined);
  const rawParty = (Array.isArray(rawPartySource) ? rawPartySource : []) as {
    speciesId?: string | number;
    level?: number;
  }[];
  const gen1Map = getGen1IndexToSpeciesIdMap();
  const romOffsetMap = getGen1RomOffsetToSpeciesIdMap();
  // Legacy: old emulator wrote wrong bytes 1/4/7 instead of 153/176/177; map those when party is from DB.
  const LEGACY_STARTER_BYTE_TO_SPECIES: Record<number, string> = {
    1: "bulbasaur",
    4: "squirtle",
    7: "squirtle",
  };
  const emulatorParty = rawParty.map((entry) => {
    let speciesId: string | undefined =
      typeof entry?.speciesId === "string" ? entry.speciesId : undefined;
    const rawNum =
      typeof entry?.speciesId === "number"
        ? entry.speciesId
        : speciesId?.match(/^species-(\d+)$/)?.[1];
    if (rawNum !== undefined) {
      const n = typeof rawNum === "string" ? parseInt(rawNum, 10) : rawNum;
      if (!partyFromLiveEmulator && LEGACY_STARTER_BYTE_TO_SPECIES[n] !== undefined) {
        speciesId = LEGACY_STARTER_BYTE_TO_SPECIES[n];
      } else {
        speciesId = romOffsetMap[n] ?? gen1Map[n] ?? speciesId;
      }
    }
    return { ...entry, speciesId: speciesId ?? (entry?.speciesId != null ? String(entry.speciesId) : undefined) };
  });
  const emulatorInventoryRaw = emulatorState?.inventory;
  const emulatorInventorySlots: { itemId: string; count: number }[] = Array.isArray(emulatorInventoryRaw?.items)
    ? emulatorInventoryRaw.items.map((item: { id: string; quantity: number }) => ({
        itemId: item.id ?? "unknown",
        count: typeof item.quantity === "number" ? item.quantity : 1,
      }))
    : [];
  const emulatorInventory =
    emulatorInventorySlots.length > 0 ? emulatorInventorySlots : (baseState?.inventory as { itemId: string; count: number }[] | undefined) ?? [];
  const sessionPokedexOwned = typeof emulatorState?.pokedexOwned === "number" ? emulatorState.pokedexOwned : undefined;
  const sessionPokedexSeen = typeof emulatorState?.pokedexSeen === "number" ? emulatorState.pokedexSeen : undefined;

  // When no active session, use pokedex from last saved session (SessionSummary) so counts match real last play
  let lastSessionPokedex: { pokedexOwned: number; pokedexSeen: number } | null = null;
  if (emulatorState == null) {
    const lastSummary = await prisma.sessionSummary.findFirst({
      where: { agentId: id },
      orderBy: { endedAt: "desc" },
      select: { pokedexOwned: true, pokedexSeen: true },
    });
    if (lastSummary) {
      lastSessionPokedex = {
        pokedexOwned: lastSummary.pokedexOwned,
        pokedexSeen: lastSummary.pokedexSeen,
      };
    }
  }

  const hasSessionState = emulatorState != null;
  const state = hasSessionState
    ? {
        ...(baseState ?? {
          x: 0,
          y: 0,
          level: 1,
          gold: 0,
          party: [],
          badges: [],
          inventory: [],
          regionId: null,
        }),
        party: emulatorParty,
        inventory: emulatorInventory,
        regionId: sessionRegion ?? baseState?.regionId ?? null,
        ...(sessionPokedexOwned !== undefined && { pokedexOwned: sessionPokedexOwned }),
        ...(sessionPokedexSeen !== undefined && { pokedexSeen: sessionPokedexSeen }),
      }
    : baseState
      ? {
          ...baseState,
          party: emulatorParty.length > 0 ? emulatorParty : baseState.party,
          regionId: sessionRegion ?? baseState.regionId,
        }
      : null;

  const profilePokedexOwned = lastSessionPokedex?.pokedexOwned ?? agent.profile?.pokedexOwnedCount ?? 0;
  const profilePokedexSeen = lastSessionPokedex?.pokedexSeen ?? agent.profile?.pokedexSeenCount ?? 0;

  return NextResponse.json({
    id: agent.id,
    displayName: agent.displayName,
    handle: agent.handle,
    avatarUrl: agent.avatarUrl,
    profile: agent.profile
      ? {
          name: agent.profile.name,
          level: agent.profile.level,
          badges: agent.profile.badges,
          pokedexSeenCount: profilePokedexSeen,
          pokedexOwnedCount: profilePokedexOwned,
          wins: agent.profile.wins,
          losses: agent.profile.losses,
          gymWins: agent.profile.gymWins,
          leagueWins: agent.profile.leagueWins,
          totalPlaytimeSeconds: agent.profile.totalPlaytimeSeconds ?? 0,
        }
      : null,
    state,
    sessionPlaytimeSeconds,
    sessionRegion,
    recentTranscript,
  });
}
