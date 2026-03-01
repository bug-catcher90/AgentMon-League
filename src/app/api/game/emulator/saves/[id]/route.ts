import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * DELETE /api/game/emulator/saves/:id
 * Delete a saved game session. Only the owning agent can delete it.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const agent = await getAgentFromRequest(_req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await prisma.agentEmulatorSave.deleteMany({
    where: { id, agentId: agent.id },
  });

  if (deleted.count === 0) {
    return NextResponse.json(
      { error: "Saved session not found or not owned by this agent" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
