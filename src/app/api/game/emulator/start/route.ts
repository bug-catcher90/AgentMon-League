import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

const VALID_STARTERS = ["bulbasaur", "charmander", "squirtle"] as const;
export type StarterChoice = (typeof VALID_STARTERS)[number];

/**
 * POST /api/game/emulator/start
 * Start a Pokemon Red emulator session for the authenticated agent.
 * Body:
 *   - {} or { starter?, speed? } → new session (optionally from init state + starter).
 *   - { loadSessionId: string } → load a previously saved game (optional label/speed ignored for payload).
 */
export async function POST(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let playerName = agent.displayName?.trim() || "";
  if (!playerName) {
    const profile = await prisma.agentProfile.findUnique({
      where: { agentId: agent.id },
      select: { name: true },
    });
    playerName = profile?.name?.trim() || "Agent";
  }
  if (!playerName) playerName = "Agent";

  let starter: StarterChoice | undefined;
  let speed: number | string | undefined;
  let loadSessionId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    const raw = (body.starter as string)?.toLowerCase();
    if (raw && VALID_STARTERS.includes(raw as StarterChoice)) {
      starter = raw as StarterChoice;
    }
    if (body.speed !== undefined) {
      speed = typeof body.speed === "number" ? body.speed : (body.speed as string);
    }
    if (typeof body.loadSessionId === "string" && body.loadSessionId.trim()) {
      loadSessionId = body.loadSessionId.trim();
    }
  } catch {
    // no body or invalid JSON
  }

  let initialStateBase64: string | undefined;
  if (loadSessionId) {
    const save = await prisma.agentEmulatorSave.findFirst({
      where: { id: loadSessionId, agentId: agent.id },
      select: { state: true },
    });
    if (!save) {
      return NextResponse.json(
        { error: "Saved session not found or not owned by this agent" },
        { status: 404 }
      );
    }
    // Prisma Bytes (bytea) is returned as Buffer in Node
    const buf = save.state as Buffer;
    initialStateBase64 = Buffer.from(buf).toString("base64");
  }

  try {
    const res = await fetch(`${EMULATOR_URL}/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agent.id,
        player_name: playerName,
        ...(starter && !loadSessionId && { starter }),
        ...(speed !== undefined && { speed }),
        ...(initialStateBase64 && { initial_state_base64: initialStateBase64 }),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data.detail ?? "Emulator service error" },
        { status: res.status === 404 ? 502 : res.status }
      );
    }
    const now = new Date().toISOString();
    await prisma.eventLog.create({
      data: { agentId: agent.id, line: `Session started at ${now}` },
    }).catch(() => {});
    // Always return the agent id used for the session so clients use the correct id for frame/state
    return NextResponse.json({ ...data, agentId: agent.id });
  } catch (e) {
    return NextResponse.json(
      { error: "Emulator service unreachable. Is it running?" },
      { status: 502 }
    );
  }
}
