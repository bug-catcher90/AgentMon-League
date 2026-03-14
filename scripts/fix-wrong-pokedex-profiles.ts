/**
 * One-off: fix AgentProfile rows with wrong pokedex/badges and reset seasons to season 1.
 * Run against prod with:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/fix-wrong-pokedex-profiles.ts
 *
 * Fixes: (40,36), (36,40) or high pokedex with low steps → set pokedex to 1/3, badges [].
 * Resets: season 1 = active (First Pokémon Catch), all others = pending, season 1 champion cleared.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ---- 1. Fix wrong pokedex profiles ----
  const candidates = await prisma.agentProfile.findMany({
    where: {
      OR: [
        { pokedexOwnedCount: 40, pokedexSeenCount: 36 },
        { pokedexOwnedCount: 36, pokedexSeenCount: 40 },
      ],
    },
    select: {
      agentId: true,
      name: true,
      pokedexOwnedCount: true,
      pokedexSeenCount: true,
      badges: true,
    },
  });

  if (candidates.length > 0) {
    console.log(`Found ${candidates.length} profile(s) to fix:`);
    for (const p of candidates) {
      const badgesLen = Array.isArray(p.badges) ? (p.badges as unknown[]).length : 0;
      console.log(
        `  ${p.name} (${p.agentId}): pokedex ${p.pokedexOwnedCount}/${p.pokedexSeenCount}, badges ${badgesLen}`
      );
    }
    const ids = candidates.map((p) => p.agentId);
    const result = await prisma.agentProfile.updateMany({
      where: { agentId: { in: ids } },
      data: {
        pokedexOwnedCount: 1,
        pokedexSeenCount: 3,
        badges: [],
      },
    });
    console.log(`Updated ${result.count} profile(s): set pokedex to 1/3 and badges to [].`);
  } else {
    console.log("No profiles matched the 'wrong' criteria. Skipping pokedex fix.");
  }

  // ---- 2. Reset seasons to season 1 (First Pokémon Catch) ----
  const season1 = await prisma.season.findUnique({ where: { number: 1 } });
  if (!season1) {
    console.log("Season 1 not found. Creating it.");
    await prisma.season.create({
      data: {
        number: 1,
        name: "First Pokémon Catch",
        description: "First agent to catch a Pokémon beyond the starter",
        goalKind: "first_to_catch_n",
        goalValue: 2,
        status: "active",
      },
    });
    console.log("Season 1 created and set active.");
  } else {
    await prisma.season.update({
      where: { number: 1 },
      data: {
        status: "active",
        championId: null,
        endedAt: null,
        name: "First Pokémon Catch",
        description: "First agent to catch a Pokémon beyond the starter",
        goalKind: "first_to_catch_n",
        goalValue: 2,
      },
    });
    console.log("Season 1 set to active (champion and endedAt cleared).");
  }

  const otherSeasons = await prisma.season.findMany({
    where: { number: { gt: 1 } },
    select: { id: true, number: true },
  });
  if (otherSeasons.length > 0) {
    await prisma.season.updateMany({
      where: { number: { gt: 1 } },
      data: { status: "pending" },
    });
    console.log(`Set ${otherSeasons.length} season(s) (number > 1) to pending.`);
  }

  console.log("Done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
