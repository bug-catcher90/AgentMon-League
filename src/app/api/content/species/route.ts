import { NextResponse } from "next/server";
import { getSpecies } from "@/lib/content";

export const dynamic = "force-dynamic";

/**
 * GET /api/content/species
 * Returns all species with id, name, sprites for frontend (battle/party UI).
 */
export async function GET() {
  const species = getSpecies();
  const list = species.map((s, index) => ({
    id: s.id,
    name: s.name,
    types: s.types,
    spriteFront: s.spriteFront ?? null,
    spriteBack: s.spriteBack ?? null,
    dexNumber: index + 1,
  }));
  return NextResponse.json(list);
}
