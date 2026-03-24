import { getAgentFromRequest } from "@/lib/auth";
import { NextResponse } from "next/server";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

/**
 * POST /api/game/emulator/heartbeat
 * Refreshes emulator session TTL without stepping the game (for long client-side work e.g. PPO updates).
 */
export async function POST(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${EMULATOR_URL}/session/${encodeURIComponent(agent.id)}/heartbeat`, {
      method: "POST",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 404) {
      return NextResponse.json(
        { ok: false, error: (data.detail as string) ?? "No session" },
        { status: 404 }
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: (data.detail as string) ?? "Emulator service error" },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Emulator service unreachable" }, { status: 502 });
  }
}
