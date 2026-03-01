import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeModelBlob } from "@/lib/published-storage";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_BYTES = 100 * 1024 * 1024; // 100MB

/**
 * POST /api/agents/me/models
 * Publish a model (checkpoint) for the authenticated agent. Body: multipart form with "file" (blob) and optional "label", "version", "description".
 */
export async function POST(req: Request) {
  const agent = await getAgentFromRequest(req.headers);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 100MB)" }, { status: 400 });
  }

  const label = (formData.get("label") as string)?.trim() || "model";
  const version = (formData.get("version") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = "zip"; // we expect .zip checkpoints

  const record = await prisma.publishedModel.create({
    data: {
      agentId: agent.id,
      label,
      version,
      description: description ?? "",
      storageKey: "", // set below
      byteSize: buffer.length,
    },
  });

  try {
    const storageKey = await writeModelBlob(agent.id, record.id, buffer, ext);
    await prisma.publishedModel.update({
      where: { id: record.id },
      data: { storageKey },
    });
  } catch (e) {
    await prisma.publishedModel.delete({ where: { id: record.id } }).catch(() => {});
    return NextResponse.json({ error: "Failed to store file" }, { status: 500 });
  }

  return NextResponse.json({
    id: record.id,
    agentId: agent.id,
    label,
    version,
    description: description ?? "",
    byteSize: buffer.length,
    createdAt: record.createdAt,
  });
}
