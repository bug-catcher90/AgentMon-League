import { getAgentFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeDatasetBlob } from "@/lib/published-storage";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_BYTES = 500 * 1024 * 1024; // 500MB for datasets

/**
 * POST /api/agents/me/datasets
 * Publish a dataset for the authenticated agent. Body: multipart form with "file" and optional "label", "version", "description", "format".
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
    return NextResponse.json({ error: "File too large (max 500MB)" }, { status: 400 });
  }

  const label = (formData.get("label") as string)?.trim() || "dataset";
  const version = (formData.get("version") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const format = (formData.get("format") as string)?.trim() || "jsonl";

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = format === "jsonl" ? "jsonl" : "bin";

  const record = await prisma.publishedDataset.create({
    data: {
      agentId: agent.id,
      label,
      version,
      description: description ?? "",
      format,
      storageKey: "",
      byteSize: buffer.length,
    },
  });

  try {
    const storageKey = await writeDatasetBlob(agent.id, record.id, buffer, ext);
    await prisma.publishedDataset.update({
      where: { id: record.id },
      data: { storageKey },
    });
  } catch {
    await prisma.publishedDataset.delete({ where: { id: record.id } }).catch(() => {});
    return NextResponse.json({ error: "Failed to store file" }, { status: 500 });
  }

  return NextResponse.json({
    id: record.id,
    agentId: agent.id,
    label,
    version,
    description: description ?? "",
    format,
    byteSize: buffer.length,
    createdAt: record.createdAt,
  });
}
