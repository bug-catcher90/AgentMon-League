import { prisma } from "@/lib/db";
import { readModelBlob } from "@/lib/published-storage";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/agents/:id/models/:modelId/download
 * Download the model file (public; any agent id).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; modelId: string }> }
) {
  const { id, modelId } = await params;
  const agentId = id === "me" ? null : id;
  if (agentId === null) {
    return NextResponse.json({ error: "Use agent id for download" }, { status: 400 });
  }

  const model = await prisma.publishedModel.findFirst({
    where: { id: modelId, agentId },
  });

  if (!model) {
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  }

  try {
    const buffer = await readModelBlob(model.storageKey);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${model.label.replace(/[^a-zA-Z0-9_-]/g, "_")}.zip"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
