import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/health
 * Sanity check for deployment: reports env vars and actual DB connectivity.
 * Use this to verify Railway (or any host) has DATABASE_URL and can reach the DB.
 * Redeploy: touching this file triggers app service rebuild on Railway.
 */
export async function GET() {
  const hasDatabase = !!process.env.DATABASE_URL;
  const hasAppUrl = !!process.env.NEXT_PUBLIC_APP_URL;
  const hasEmulatorUrl = !!process.env.EMULATOR_URL;

  let dbStatus: "connected" | "missing" | "error" = hasDatabase ? "connected" : "missing";
  let dbError: string | null = null;
  if (hasDatabase) {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      dbStatus = "error";
      dbError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    ok: true,
    env: {
      DATABASE_URL: hasDatabase ? "set" : "missing",
      NEXT_PUBLIC_APP_URL: hasAppUrl ? "set" : "missing",
      EMULATOR_URL: hasEmulatorUrl ? "set" : "missing",
    },
    db: dbStatus,
    ...(dbError ? { dbError } : {}),
    ready: hasDatabase && hasAppUrl && dbStatus === "connected",
  });
}
