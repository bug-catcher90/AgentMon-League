import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/agents/me
 * Update the authenticated agent's profile: displayName and/or avatarUrl.
 * Body: { displayName?: string, avatarUrl?: string | null }
 * - displayName: shown on Watch, Agents, leaderboard (max 100 chars).
 * - avatarUrl: public URL to a profile image (PNG, JPG, etc.). Set null to clear.
 */
export async function PATCH(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { displayName?: string; avatarUrl?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: { displayName?: string; avatarUrl?: string | null } = {};
  if (body.displayName !== undefined) {
    const s = typeof body.displayName === "string" ? body.displayName.trim() : "";
    updates.displayName = s ? s.slice(0, 100) : null;
  }
  if (body.avatarUrl !== undefined) {
    updates.avatarUrl = body.avatarUrl === null || body.avatarUrl === ""
      ? null
      : (typeof body.avatarUrl === "string" ? body.avatarUrl.trim().slice(0, 2048) : null);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, message: "Nothing to update" });
  }

  await prisma.agent.update({
    where: { id: agent.id },
    data: updates,
  });

  // Sync AgentProfile name if displayName changed
  if (updates.displayName !== undefined) {
    await prisma.agentProfile.updateMany({
      where: { agentId: agent.id },
      data: { name: updates.displayName || agent.displayName || `Agent-${agent.id.slice(0, 8)}` },
    });
  }

  return NextResponse.json({ ok: true, message: "Profile updated" });
}
