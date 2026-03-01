import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveTurn } from "@/lib/battle";
import type { BattleState, BattleSide } from "@/lib/battle";
import { createCreatureInstance } from "@/lib/battle";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/cron/gym-tournament
 * Called every hour (cron). Header: Authorization: Bearer <CRON_SECRET>
 * For each gym: take top 24 from waitlist, run single-elimination (Ro16 -> QF -> SF -> Final), assign badge to winner.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gyms = await prisma.gym.findMany();
  for (const gym of gyms) {
    const entries = await prisma.gymWaitlistEntry.findMany({
      where: { gymId: gym.id },
      orderBy: { rankScore: "desc" },
      take: 24,
      include: { agent: { include: { state: true } } },
    });
    if (entries.length < 2) continue;

    const tournament = await prisma.gymTournament.create({
      data: { gymId: gym.id, status: "in_progress", bracket: {} },
    });

    const agentIds = entries.map((e) => e.agentId);
    let bracket: string[][] = [agentIds];
    while (bracket[0].length > 1) {
      const next: string[][] = [];
      for (const round of bracket) {
        const half = Math.ceil(round.length / 2);
        for (let i = 0; i < half; i++) {
          const a = round[i];
          const b = round[i + half];
          if (!b) {
            next.push([a]);
            continue;
          }
          const winner = await runMatch(a, b, gym.id);
          next.push([winner]);
        }
      }
      bracket = next;
    }

    const winnerId = bracket[0]?.[0];
    if (winnerId) {
      const state = await prisma.agentState.findUnique({ where: { agentId: winnerId } });
      if (state) {
        const badges = (state.badges as string[]) || [];
        if (!badges.includes(gym.badgeId)) {
          badges.push(gym.badgeId);
          await prisma.agentState.update({
            where: { agentId: winnerId },
            data: { badges },
          });
        }
      }
      await prisma.agentProfile.updateMany({
        where: { agentId: winnerId },
        data: { gymWins: { increment: 1 } },
      });
    }

    await prisma.gymTournament.update({
      where: { id: tournament.id },
      data: { status: "completed", winnerId: winnerId ?? undefined, endedAt: new Date(), bracket: { bracket } },
    });
  }

  return NextResponse.json({ success: true, message: "Gym tournaments processed." });
}

async function runMatch(agentAId: string, agentBId: string, gymId: string): Promise<string> {
  const stateA = await prisma.agentState.findUnique({ where: { agentId: agentAId } });
  const stateB = await prisma.agentState.findUnique({ where: { agentId: agentBId } });
  const partyA = (stateA?.party as unknown as BattleSide["creatures"]) ?? [createCreatureInstance("pikachu", 10)];
  const partyB = (stateB?.party as unknown as BattleSide["creatures"]) ?? [createCreatureInstance("pikachu", 10)];

  const sideA: BattleSide = { creatures: partyA.slice(0, 6), activeIndex: 0, agentId: agentAId };
  const sideB: BattleSide = { creatures: partyB.slice(0, 6), activeIndex: 0, agentId: agentBId };

  const match = await prisma.match.create({
    data: {
      type: "GYM",
      agentAId,
      agentBId,
      gymId,
      state: {},
      transcript: [],
    },
  });

  let battleState: BattleState = {
    matchId: match.id,
    type: "GYM",
    turn: 0,
    sides: [sideA, sideB],
    transcript: [],
    phase: "active",
    winnerId: null,
  };

  while (battleState.phase === "active" && battleState.winnerId == null) {
    const moveA = getFirstValidMove(battleState.sides[0]);
    const moveB = getFirstValidMove(battleState.sides[1]);
    const { newState } = resolveTurn(battleState, moveA, moveB);
    battleState = newState;
  }

  await prisma.match.update({
    where: { id: match.id },
    data: {
      state: battleState as unknown as object,
      transcript: battleState.transcript,
      status: "COMPLETED",
      winnerId: battleState.winnerId,
    },
  });

  return battleState.winnerId ?? agentAId;
}

function getFirstValidMove(side: BattleSide): { type: "move"; moveIndex: number } {
  const active = side.creatures[side.activeIndex];
  const idx = active?.moves.findIndex((m) => m.pp > 0) ?? 0;
  return { type: "move", moveIndex: idx >= 0 ? idx : 0 };
}
