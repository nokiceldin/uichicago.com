import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing");
}

const pool = new Pool({
  connectionString,
  max: 5,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});

function round1(n) {
  return Math.round(n * 10) / 10;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

async function main() {
  const MIN_REGS_FOR_RANK = 30;

  const courses = await prisma.course.findMany({
    include: {
      termStats: true,
    },
  });

  const rows = [];

  for (const course of courses) {
    let totalA = 0;
    let totalB = 0;
    let totalC = 0;
    let totalD = 0;
    let totalF = 0;
    let totalRegs = 0;

    for (const t of course.termStats) {
      totalA += t.a;
      totalB += t.b;
      totalC += t.c;
      totalD += t.d;
      totalF += t.f;
      totalRegs += t.gradeRegs;
    }

    if (totalRegs === 0) {
      rows.push({
        id: course.id,
        gpa: null,
        totalRegs: 0,
        rankable: false,
      });
      continue;
    }

    const gpa =
      (4 * totalA +
        3 * totalB +
        2 * totalC +
        1 * totalD +
        0 * totalF) /
      totalRegs;

    const cleanGpa = Number.isFinite(gpa) ? gpa : null;

    const rankable =
      cleanGpa != null &&
      cleanGpa > 0.0001 &&         // filters 0.00 GPA classes
      cleanGpa <= 4.0001 &&
      totalRegs >= MIN_REGS_FOR_RANK;

    rows.push({
      id: course.id,
      gpa: cleanGpa,
      totalRegs,
      rankable,
    });
  }

  const rankables = rows
    .filter(r => r.rankable && r.gpa != null)
    .map(r => ({ id: r.id, gpa: r.gpa, totalRegs: r.totalRegs }));

  if (rankables.length === 0) {
    console.log("No rankable course data found.");
    return;
  }

  rankables.sort((a, b) => a.gpa - b.gpa);

  console.log("Rankable courses:", rankables.length);
  console.log("Min rankable GPA:", rankables[0].gpa);
  console.log("Max rankable GPA:", rankables[rankables.length - 1].gpa);
  console.log("Min regs to rank:", MIN_REGS_FOR_RANK);

  const n = rankables.length;

  // percentile map: id -> percentile in [0, 1]
  const pctById = new Map();
  for (let i = 0; i < n; i++) {
    const pct = n === 1 ? 0.5 : i / (n - 1);
    pctById.set(rankables[i].id, pct);
  }

  const updates = [];

  for (const r of rows) {
    const avgGpa =
      r.gpa != null && r.gpa > 0.0001
        ? r.gpa
        : null;

    let difficultyScore = null;

    if (r.rankable && r.gpa != null) {
  const score = 1 + 4 * ((r.gpa - 2.3) / 1.7);
  difficultyScore = round1(clamp(score, 1, 5));
}

    updates.push(
      prisma.course.update({
        where: { id: r.id },
        data: {
          avgGpa,
          difficultyScore,
          totalRegsAllTime: r.totalRegs,
        },
      })
    );
  }

  const batchSize = 200;

  for (let i = 0; i < updates.length; i += batchSize) {
    const slice = updates.slice(i, i + batchSize);
    await Promise.all(slice);
    console.log(`Updated ${Math.min(i + batchSize, updates.length)} / ${updates.length}`);
  }

  console.log("Done. Ranked:", rankables.length, "Unranked:", rows.length - rankables.length);
}

main()
  .catch(console.error)
  .finally(async () => {
  await prisma.$disconnect();
  await pool.end();
});