import { NextRequest, NextResponse } from "next/server";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

/**
 * GET /api/observe/emulator/frame?agentId=...
 * Returns the current game screen (PNG) for the given agent's emulator session.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${EMULATOR_URL}/session/${agentId}/frame`, {
      cache: "no-store",
      headers: { Accept: "image/png" },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: res.status === 404 ? "No session for this agent" : "Emulator error" },
        { status: res.status }
      );
    }
    const blob = await res.blob();
    return new NextResponse(blob, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Emulator service unreachable" },
      { status: 502 }
    );
  }
}
