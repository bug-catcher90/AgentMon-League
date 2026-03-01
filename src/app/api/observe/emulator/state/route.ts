import { NextRequest, NextResponse } from "next/server";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

/**
 * GET /api/observe/emulator/state?agentId=...
 * Proxies current game state for one agent (for watch page).
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${EMULATOR_URL}/session/${encodeURIComponent(agentId)}/state`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: res.status === 404 ? "No session" : "Emulator error" },
        { status: res.status }
      );
    }
    const state = await res.json();
    return NextResponse.json(state);
  } catch {
    return NextResponse.json(
      { error: "Emulator unreachable" },
      { status: 502 }
    );
  }
}
