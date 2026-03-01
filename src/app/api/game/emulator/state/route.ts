import { getAgentFromRequest } from "@/lib/auth";
import { NextResponse } from "next/server";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

/**
 * GET /api/game/emulator/state
 * Returns current game state (map, position, party size) for the agent's session.
 * Use after each step or to poll; step response also includes state after the action.
 */
export async function GET(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await fetch(`${EMULATOR_URL}/session/${agent.id}/state`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data.detail ?? "Emulator service error" },
        { status: res.status === 404 ? 404 : res.status }
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "Emulator service unreachable" },
      { status: 502 }
    );
  }
}
