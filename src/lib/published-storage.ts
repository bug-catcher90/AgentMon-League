/**
 * Storage for published models and datasets.
 * MVP: filesystem under data/published/. Later: swap to S3/R2 by implementing same interface.
 */

import { mkdir, readFile, writeFile, stat, unlink } from "fs/promises";
import path from "path";

const ROOT = process.env.PUBLISHED_STORAGE_ROOT ?? path.join(process.cwd(), "data", "published");

function modelPath(agentId: string, id: string, ext = "zip"): string {
  return path.join(ROOT, "agents", agentId, "models", `${id}.${ext}`);
}

function datasetPath(agentId: string, id: string, ext = "jsonl"): string {
  return path.join(ROOT, "agents", agentId, "datasets", `${id}.${ext}`);
}

/** Relative key for DB (portable; forward slashes for S3 later). */
export function modelStorageKey(agentId: string, id: string, ext = "zip"): string {
  return path.posix.join("agents", agentId, "models", `${id}.${ext}`);
}

export function datasetStorageKey(agentId: string, id: string, ext = "jsonl"): string {
  return path.posix.join("agents", agentId, "datasets", `${id}.${ext}`);
}

export async function writeModelBlob(agentId: string, id: string, buffer: Buffer, ext = "zip"): Promise<string> {
  const fullPath = modelPath(agentId, id, ext);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
  return modelStorageKey(agentId, id, ext);
}

export async function readModelBlob(storageKey: string): Promise<Buffer> {
  const fullPath = path.join(ROOT, storageKey);
  return readFile(fullPath);
}

export async function writeDatasetBlob(agentId: string, id: string, buffer: Buffer, ext = "jsonl"): Promise<string> {
  const fullPath = datasetPath(agentId, id, ext);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
  return datasetStorageKey(agentId, id, ext);
}

export async function readDatasetBlob(storageKey: string): Promise<Buffer> {
  const fullPath = path.join(ROOT, storageKey);
  return readFile(fullPath);
}

export async function getBlobSize(storageKey: string): Promise<number> {
  const fullPath = path.join(ROOT, storageKey);
  const s = await stat(fullPath);
  return s.size;
}

export async function deleteBlob(storageKey: string): Promise<void> {
  const fullPath = path.join(ROOT, storageKey);
  await unlink(fullPath).catch(() => {});
}
