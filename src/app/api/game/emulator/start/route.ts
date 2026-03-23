import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";
const MAX_CONCURRENT_SESSIONS = Math.max(0, parseInt(process.env.MAX_CONCURRENT_SESSIONS ?? "10", 10) || 10);
const RATE_LIMIT_START_PER_MINUTE = Math.max(0, parseInt(process.env.RATE_LIMIT_START_PER_MINUTE ?? "10", 10) || 10);

const VALID_STARTERS = ["bulbasaur", "charmander", "squirtle"] as const;
export type StarterChoice = (typeof VALID_STARTERS)[number];

const VALID_MODES = ["new", "load", "restart"] as const;
type StartMode = (typeof VALID_MODES)[number];

/**
 * POST /api/game/emulator/start
 * Start a Pokemon Red emulator session for the authenticated agent.
 * Body:
 *   - {} or { starter?, speed? } → new session (optionally from init state + starter).
 *   - { loadSessionId: string } → load a previously saved game (optional label/speed ignored for payload).
 *   - { mode: "new" | "load" | "restart", ... } → explicit lifecycle control.
 */
export async function POST(req: Request) {
  try {
    if (!EMULATOR_URL || EMULATOR_URL.includes("127.0.0.1")) {
      return NextResponse.json(
        { error: "EMULATOR_URL not set or still default. Set it to the Railway emulator service URL in app Variables." },
        { status: 503 }
      );
    }
    return await handleStart(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[emulator/start]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleStart(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(`start:${agent.id}`, RATE_LIMIT_START_PER_MINUTE)) {
    return NextResponse.json(
      { error: "Too many start requests. Try again in a minute." },
      { status: 429 }
    );
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
  let mode: StartMode | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    const rawMode = (body.mode as string | undefined)?.toLowerCase()?.trim();
    if (rawMode && VALID_MODES.includes(rawMode as StartMode)) {
      mode = rawMode as StartMode;
    }
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

  // Backwards-compatible defaulting:
  // - If caller provided loadSessionId but no mode, interpret as "load".
  // - Otherwise default to "new".
  if (!mode) {
    mode = loadSessionId ? "load" : "new";
  }
  if (mode === "load" && !loadSessionId) {
    return NextResponse.json(
      { error: "mode=load requires loadSessionId" },
      { status: 400 }
    );
  }

  // Enforce global session cap so the server doesn't run out of resources
  if (MAX_CONCURRENT_SESSIONS > 0) {
    try {
      const sessRes = await fetch(`${EMULATOR_URL}/sessions`, { cache: "no-store" });
      const sessData = (await sessRes.json().catch(() => ({}))) as { agent_ids?: string[] };
      const agentIds = sessData.agent_ids ?? [];
      const current = agentIds.length;
      // For restart flows (and same-agent start refresh), don't block on cap.
      // We are not adding an extra concurrent session when the agent already has one.
      const agentAlreadyRunning = agentIds.includes(agent.id);
      if (!agentAlreadyRunning && current >= MAX_CONCURRENT_SESSIONS) {
        return NextResponse.json(
          {
            error: "Server at capacity",
            message: `Maximum ${MAX_CONCURRENT_SESSIONS} concurrent game sessions. Try again later.`,
          },
          { status: 503 }
        );
      }
    } catch {
      // If we can't reach the emulator, we'll fail on start anyway; continue
    }
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
    // restart: best-effort stop the existing session first, then start fresh (or start from loadSessionId if provided)
    if (mode === "restart") {
      try {
        await fetch(`${EMULATOR_URL}/session/${agent.id}/stop`, { method: "POST" });
      } catch {
        // ignore; start may still succeed if session didn't exist
      }
    }

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
    const data = (await res.json().catch(() => ({}))) as { detail?: string; message?: string };
    if (!res.ok) {
      const message = data.detail ?? data.message ?? "Emulator service error";
      // Forward 4xx as-is; treat 5xx from emulator as 502 so client sees "bad gateway" and knows to check emulator
      const status = res.status >= 500 ? 502 : res.status === 404 ? 502 : res.status;
      return NextResponse.json(
        { error: message, emulatorStatus: res.status },
        { status }
      );
    }
    const now = new Date().toISOString();
    await prisma.eventLog.create({
      data: { agentId: agent.id, line: `Session started at ${now}` },
    }).catch(() => {});

    // Always return the agent id used for the session so clients use the correct id for frame/state
    return NextResponse.json({ ...data, agentId: agent.id });
  } catch {
    return NextResponse.json(
      { error: "Emulator service unreachable. Is it running?" },
      { status: 502 }
    );
  }
}
