import "dotenv/config";
import fs from "fs";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

let created = 0;
let updated = 0;
let skipped = 0;

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

// Mirrors the SQL backfill logic in the migration.
// RMP names are "First Last" (no comma), so this just lowercases and strips non-alphanumeric.
function computeNameNormalized(name) {
  if (!name) return null;
  let s = String(name).trim();
  if (s.includes(",")) {
    const commaIdx = s.indexOf(",");
    const last = s.slice(0, commaIdx).trim();
    const first = s.slice(commaIdx + 1).trim();
    s = `${first} ${last}`;
  }
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim() || null;
}

async function main() {
  const raw = fs.readFileSync("./public/data/uic_rmp_professors_fixed.json", "utf8");
  const arr = JSON.parse(raw);

  console.log("Loaded JSON:", arr.length);

  const existingProfessors = await prisma.professor.findMany({
    select: { slug: true },
  });

  const existingSlugs = new Set(existingProfessors.map((p) => p.slug));

  let created = 0;
  let skipped = 0;

  for (const p of arr) {
  const name = String(p.name ?? p.Name ?? "");
  const department = String(p.department ?? p.Department ?? "");
  const school = String(p.school ?? p.School ?? "");

  if (!name || !department) {
    skipped++;
    continue;
  }

  const slug = slugify(String(p.slug ?? `${name}-${department}`));

  const existing = await prisma.professor.findUnique({
    where: { slug }
  });

  if (existing) {
    await prisma.professor.update({
      where: { slug },
      data: {
        name,
        nameNormalized: computeNameNormalized(name),
        department,
        school,
        rmpQuality: toFloat(p.quality ?? p.Quality),
        rmpDifficulty: toFloat(p.difficulty ?? p.Difficulty),
        rmpWouldTakeAgain: toInt(p.wouldTakeAgain ?? p["Would Take Again %"]),
        rmpRatingsCount: toInt(p.ratingsCount ?? p["Ratings Count"]),
        rmpUrl: String(p.url ?? p["Profile URL"] ?? "")
      }
    });

    updated++;
    continue;
  }

  await prisma.professor.create({
    data: {
      slug,
      name,
      nameNormalized: computeNameNormalized(name),
      department,
      school,
      rmpQuality: toFloat(p.quality ?? p.Quality),
      rmpDifficulty: toFloat(p.difficulty ?? p.Difficulty),
      rmpWouldTakeAgain: toInt(p.wouldTakeAgain ?? p["Would Take Again %"]),
      rmpRatingsCount: toInt(p.ratingsCount ?? p["Ratings Count"]),
      rmpUrl: String(p.url ?? p["Profile URL"] ?? "")
    }
  });

  created++;
}

  console.log("Done");
  console.log("Created professors:", created);
  console.log("Skipped existing/invalid:", skipped);
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

console.log("Created:", created);
console.log("Updated:", updated);
console.log("Skipped:", skipped);