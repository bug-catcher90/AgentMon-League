/**
 * One-off: delete all watch chat messages (clean slate after anti-spam fix).
 * Run against prod with:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/clear-all-chat-messages.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.watchChatMessage.deleteMany({});
  console.log(`Deleted ${result.count} chat message(s). Chat history is now empty.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
