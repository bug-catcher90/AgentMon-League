/**
 * One-off: print the AgentMon Genesis (template) agent id for .env.
 * Run: npx tsx scripts/get-template-agent-id.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const agent = await prisma.agent.findFirst({
    where: { displayName: "AgentMon Genesis" },
    select: { id: true },
  });
  if (!agent) {
    console.error("No agent with displayName 'AgentMon Genesis' found. Run: pnpm run db:seed");
    process.exit(1);
  }
  console.log(agent.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
