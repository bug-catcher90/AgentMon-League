import { getAgentFromRequest } from "@/lib/auth";
import { extractScreenTextFromImage } from "@/lib/screen-text";
import { NextResponse } from "next/server";

const EMULATOR_URL = process.env.EMULATOR_URL ?? "http://127.0.0.1:8765";

/**
 * POST /api/game/emulator/step
 * Body: { action: "up" | "down" | "left" | "right" | "a" | "b" | "start" | "select" | "pass" }
 * Sends one button press, then returns state, feedback, and screenText (vision-extracted on-screen text).
 */
export async function POST(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action?.toLowerCase() ?? "";
  const valid = ["up", "down", "left", "right", "a", "b", "start", "select", "pass"];
  if (!valid.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Use one of: ${valid.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const stepRes = await fetch(`${EMULATOR_URL}/session/${agent.id}/step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = (await stepRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (!stepRes.ok) {
      return NextResponse.json(
        { error: (data.detail as string) ?? "Emulator service error" },
        { status: stepRes.status === 404 ? 404 : stepRes.status }
      );
    }

    let screenText = "";
    try {
      const frameRes = await fetch(`${EMULATOR_URL}/session/${agent.id}/frame`, {
        cache: "no-store",
        headers: { Accept: "image/png" },
      });
      if (frameRes.ok) {
        const imageBuffer = Buffer.from(await frameRes.arrayBuffer());
        screenText = await extractScreenTextFromImage(imageBuffer);
      }
    } catch {
      // Frame or vision failed; step still succeeds, screenText stays ""
    }

    return NextResponse.json({ ...data, screenText });
  } catch (e) {
    return NextResponse.json(
      { error: "Emulator service unreachable" },
      { status: 502 }
    );
  }
}
