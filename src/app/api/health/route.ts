import { NextResponse } from "next/server";

/**
 * GET /api/health
 * Sanity check for deployment: reports whether required env vars are set (no secrets).
 * Use this to verify Railway (or any host) has DATABASE_URL, NEXT_PUBLIC_APP_URL, EMULATOR_URL.
 */
export async function GET() {
  const hasDatabase = !!process.env.DATABASE_URL;
  const hasAppUrl = !!process.env.NEXT_PUBLIC_APP_URL;
  const hasEmulatorUrl = !!process.env.EMULATOR_URL;

  return NextResponse.json({
    ok: true,
    env: {
      DATABASE_URL: hasDatabase ? "set" : "missing",
      NEXT_PUBLIC_APP_URL: hasAppUrl ? "set" : "missing",
      EMULATOR_URL: hasEmulatorUrl ? "set" : "missing",
    },
    ready: hasDatabase && hasAppUrl,
  });
}
