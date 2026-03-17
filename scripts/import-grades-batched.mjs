import "dotenv/config";
import { resolveInstructorNames } from "./name_resolution.mjs";
import fs from "fs";
import path from "path";
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

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function normalizeHeader(h) {
  return String(h || "").trim().replace(/\s+/g, " ");
}

function parseLine(line, delimiter) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((x) => x.trim());
}

function detectDelimiter(firstLine) {
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return tabs >= commas ? "\t" : ",";
}

function toInt(v) {
  const n = Number(String(v || "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function pick(row, colMap, name) {
  const idx = colMap.get(name);
  if (idx == null) return "";
  return row[idx] ?? "";
}

function sumStats(dst, add) {
  const numericFields = [
    "gradeRegs","a","b","c","d","f",
    "adv","cr","dfr","i","ng","nr","o","pr","s","u","w"
  ];

  for (const k of numericFields) {
    dst[k] = (dst[k] || 0) + (add[k] || 0);
  }

  return dst;
}

async function upsertTerm(code) {
  const termKey = code.slice(4, 6);
  const termName = termKey === "FA" ? "Fall" : termKey === "SP" ? "Spring" : "Summer";
  const name = code.length === 6 ? `${termName} ${code.slice(0, 4)}` : code;

  return prisma.term.upsert({
    where: { code },
    update: { name },
    create: { code, name },
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const term = getArg("term");
  const file = getArg("file");

  if (!term || !file) {
    console.log('Usage: node scripts/import-grades-batched.mjs --term 2025FA --file public/data/fall25.csv');
    process.exit(1);
  }

  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  const text = fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n").trim();
  const lines = text.split("\n").filter(Boolean);
  if (lines.length < 2) throw new Error("File has no data rows");

  const delimiter = detectDelimiter(lines[0]);
  const header = parseLine(lines[0], delimiter).map((h) => normalizeHeader(h.replace(/^"|"$/g, "")));
  const colMap = new Map();
  header.forEach((h, i) => colMap.set(h.replace(/^"|"$/g, ""), i));

  const required = [
    "CRS SUBJ CD","CRS NBR","CRS TITLE","DEPT CD","DEPT NAME",
    "Primary Instructor","Grade Regs",
    "A","B","C","D","F",
    "ADV","CR","DFR","I","NG","NR","O","PR","S","U","W",
  ];
  for (const r of required) if (!colMap.has(r)) throw new Error(`Missing column: ${r}`);

await upsertTerm(term);

const termRow = await prisma.term.findUnique({
  where: { code: term },
});

if (!termRow) {
  throw new Error("Term was not created properly.");
}

  // Aggregate
  const courseMeta = new Map();       // key -> meta
  const courseTotals = new Map();     // key -> stats
  const instructorTotals = new Map(); // key2 -> stats

  for (let i = 1; i < lines.length; i++) {
    const row = parseLine(lines[i], delimiter);

    const subject = String(pick(row, colMap, "CRS SUBJ CD")).trim().toUpperCase();
    const number = String(pick(row, colMap, "CRS NBR")).trim();
    const title = String(pick(row, colMap, "CRS TITLE")).trim();
    const deptCode = String(pick(row, colMap, "DEPT CD")).trim();
    const deptName = String(pick(row, colMap, "DEPT NAME")).trim();
    const instructorName = String(pick(row, colMap, "Primary Instructor")).trim();
    const gradeRegs = toInt(pick(row, colMap, "Grade Regs"));

    if (!subject || !number || !title) continue;

    const key = `${subject}__${number}`;
    courseMeta.set(key, { subject, number, title, deptCode: deptCode || null, deptName: deptName || null });

    const stats = {
      termId: termRow.id,
      gradeRegs,
      a: toInt(pick(row, colMap, "A")),
      b: toInt(pick(row, colMap, "B")),
      c: toInt(pick(row, colMap, "C")),
      d: toInt(pick(row, colMap, "D")),
      f: toInt(pick(row, colMap, "F")),
      adv: toInt(pick(row, colMap, "ADV")),
      cr: toInt(pick(row, colMap, "CR")),
      dfr: toInt(pick(row, colMap, "DFR")),
      i: toInt(pick(row, colMap, "I")),
      ng: toInt(pick(row, colMap, "NG")),
      nr: toInt(pick(row, colMap, "NR")),
      o: toInt(pick(row, colMap, "O")),
      pr: toInt(pick(row, colMap, "PR")),
      s: toInt(pick(row, colMap, "S")),
      u: toInt(pick(row, colMap, "U")),
      w: toInt(pick(row, colMap, "W")),
    };

    if (!courseTotals.has(key)) courseTotals.set(key, { ...stats });
    else sumStats(courseTotals.get(key), stats);

    if (instructorName) {
      const key2 = `${key}__${instructorName}`;
      if (!instructorTotals.has(key2)) instructorTotals.set(key2, { ...stats, instructorName });
      else sumStats(instructorTotals.get(key2), stats);
    }
  }

  console.log(`Aggregated: ${courseMeta.size} courses, ${instructorTotals.size} course+instructor groups`);

  // Upsert courses (still needed, but only once per course)
  const keys = Array.from(courseMeta.keys());
  const courseIdByKey = new Map();

  for (const batch of chunk(keys, 250)) {
    const results = await Promise.all(
      batch.map((key) => {
        const m = courseMeta.get(key);
        return prisma.course.upsert({
          where: { subject_number: { subject: m.subject, number: m.number } },
          update: { title: m.title, deptCode: m.deptCode, deptName: m.deptName },
          create: { subject: m.subject, number: m.number, title: m.title, deptCode: m.deptCode, deptName: m.deptName },
        });
      })
    );
    results.forEach((c, i) => courseIdByKey.set(batch[i], c.id));
    console.log(`Upserted courses: ${courseIdByKey.size}/${keys.length}`);
  }

  // Clear existing stats for this term (so reruns are safe)
  await prisma.courseInstructorTermStats.deleteMany({ where: { termId: termRow.id } });
  await prisma.courseTermStats.deleteMany({ where: { termId: termRow.id } });

  // Build rows for createMany
  const courseRows = [];
  for (const [key, stats] of courseTotals.entries()) {
    courseRows.push({ courseId: courseIdByKey.get(key), ...stats });
  }

  // Build raw instructor rows
  const instructorRows = [];
  for (const [key2, stats] of instructorTotals.entries()) {
    const parts = key2.split("__");
    const courseKey = `${parts[0]}__${parts[1]}`;
    const instructorName = parts.slice(2).join("__");
    instructorRows.push({ courseId: courseIdByKey.get(courseKey), instructorName, ...stats });
  }

  const missingCourseId = courseRows.filter(r => !r.courseId).length;
  if (missingCourseId > 0) {
    console.log(`⚠️  ${missingCourseId} course rows missing courseId`);
  }

  // ── Resolve instructor names to Professor.id ──────────────────────────────
  // Collects all unique raw instructor names from this import, runs the
  // two-stage matching (exact normalized, then middle-stripped), and attaches
  // the resolved professorId to each row before insert.
  const rawNames = instructorRows.map(r => r.instructorName);
  const resolutionMap = await resolveInstructorNames(rawNames);

  const instructorRowsWithFK = instructorRows.map(row => ({
    ...row,
    professorId: resolutionMap.get(row.instructorName) ?? null,
  }));

  const resolvedCount = instructorRowsWithFK.filter(r => r.professorId !== null).length;
  console.log(`\n  professorId linked on ${resolvedCount}/${instructorRowsWithFK.length} instructor rows`);

  // ── Insert in batches ─────────────────────────────────────────────────────
  for (const batch of chunk(courseRows, 100)) {
    await prisma.courseTermStats.createMany({ data: batch });
    console.log(`Inserted course term stats: +${batch.length}`);
  }

  for (const batch of chunk(instructorRowsWithFK, 100)) {
    await prisma.courseInstructorTermStats.createMany({ data: batch });
    console.log(`Inserted instructor stats: +${batch.length}`);
  }

  console.log(`Done. Imported term ${term}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });