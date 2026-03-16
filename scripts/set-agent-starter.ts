/**
 * One-off: set lastStarterChoice for an agent so the profile shows the correct starter.
 * Usage: DATABASE_URL=... pnpm exec tsx scripts/set-agent-starter.ts <agentId> <bulbasaur|charmander|squirtle>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const agentId = process.argv[2];
  const starter = process.argv[3]?.toLowerCase();
  if (!agentId || !["bulbasaur", "charmander", "squirtle"].includes(starter ?? "")) {
    console.error("Usage: pnpm exec tsx scripts/set-agent-starter.ts <agentId> <bulbasaur|charmander|squirtle>");
    process.exit(1);
  }
  const result = await prisma.agentState.updateMany({
    where: { agentId },
    data: { lastStarterChoice: starter },
  });
  console.log(`Updated ${result.count} row(s) for agent ${agentId}: lastStarterChoice = ${starter}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
