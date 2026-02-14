import "dotenv/config";
import fs from "fs";

import { PrismaClient } from "@prisma/client";

const { PrismaClient } = pkg;

import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });


function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function toFloat(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  const raw = fs.readFileSync("./public/data/uic_rmp_professors_fixed.json", "utf8");
  const arr = JSON.parse(raw);

  console.log("Loaded JSON:", arr.length);

  let upserts = 0;

  for (const p of arr) {
    const name = String(p.name ?? p.Name ?? "");
    const department = String(p.department ?? p.Department ?? "");
    const school = String(p.school ?? p.School ?? "");

    if (!name || !department) continue;

    const slug = slugify(String(p.slug ?? `${name}-${department}`));

    await prisma.professor.upsert({
      where: { slug },
      update: {
        name,
        department,
        school,
        rmpQuality: toFloat(p.quality ?? p.Quality),
        rmpDifficulty: toFloat(p.difficulty ?? p.Difficulty),
        rmpWouldTakeAgain: toInt(p.wouldTakeAgain ?? p["Would Take Again %"]),
        rmpRatingsCount: toInt(p.ratingsCount ?? p["Ratings Count"]),
        rmpUrl: String(p.url ?? p["Profile URL"] ?? ""),
      },
      create: {
        slug,
        name,
        department,
        school,
        rmpQuality: toFloat(p.quality ?? p.Quality),
        rmpDifficulty: toFloat(p.difficulty ?? p.Difficulty),
        rmpWouldTakeAgain: toInt(p.wouldTakeAgain ?? p["Would Take Again %"]),
        rmpRatingsCount: toInt(p.ratingsCount ?? p["Ratings Count"]),
        rmpUrl: String(p.url ?? p["Profile URL"] ?? ""),
      },
    });

    upserts++;
  }

  console.log("Upserted professors:", upserts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
    .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

