import { getAgentFromRequest } from "@/lib/auth";
import { NextResponse } from "next/server";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

/**
 * GET /api/game/emulator/status
 * Authenticated status for the agent's emulator session.
 * Returns:
 *  - { ok: true, state: "running", ... } when session exists
 *  - { ok: true, state: "stopped" } when no session exists (404 from emulator)
 */
export async function GET(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${EMULATOR_URL}/session/${encodeURIComponent(agent.id)}/status`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (res.status === 404) {
      return NextResponse.json({ ok: true, state: "stopped" });
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

