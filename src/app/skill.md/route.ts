import { NextResponse } from "next/server";
import { SKILL_MD } from "@/lib/skill-md";

export function GET() {
  return new NextResponse(SKILL_MD, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
