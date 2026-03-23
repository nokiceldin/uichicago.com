/**
 * import-salaries.mjs
 *
 * Matches UIC salary data against the Professor table using the same
 * normalization + fuzzy matching from name_resolution.mjs:
 *   1. Exact normalized match  (nameNormalized field)
 *   2. Middle-stripped match   (3-name → 2-name)
 *   3. Nickname first-name match
 *
 * Only salary records with a professor-type title are considered.
 *
 * Usage:
 *   node scripts/import-salaries.mjs            ← live run
 *   node scripts/import-salaries.mjs --dry-run  ← preview only
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { normalizeName } from "./name_resolution.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDryRun = process.argv.includes("--dry-run");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing");
const pool = new Pool({ connectionString, max: 5 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── Nickname map (mirrors name_resolution.mjs) ────────────────────────────────
const NICKNAMES = {
  robert: ["bob","bobby","rob","robbie"], william: ["bill","billy","will","willie","liam"],
  james: ["jim","jimmy","jamie"], michael: ["mike","mick","mickey"],
  thomas: ["tom","tommy"], david: ["dave","davy"],
  richard: ["rick","rich","dick"], joseph: ["joe","joey"],
  charles: ["charlie","chuck"], daniel: ["dan","danny"],
  stephen: ["steve","stevie"], steven: ["steve","stevie"],
  christopher: ["chris"], matthew: ["matt"],
  anthony: ["tony"], andrew: ["andy","drew"],
  benjamin: ["ben","benny"], nicholas: ["nick","nicky"],
  alexander: ["alex"], jonathan: ["jon","johnny"],
  samuel: ["sam"], edward: ["ed","ted","ned"],
  henry: ["hank","harry"], john: ["jack","johnny"],
  patrick: ["pat"], timothy: ["tim","timmy"],
  jeffrey: ["jeff"], gregory: ["greg"],
  donald: ["don"], kenneth: ["ken","kenny"],
  mark: ["marc"], marc: ["mark"],
  katherine: ["kate","katie","kathy","kat"], kathryn: ["kate","katie","kathy"],
  elizabeth: ["liz","beth","betty","lisa"], jennifer: ["jen","jenny"],
  margaret: ["peg","peggy","maggie"], patricia: ["pat","patty","trish"],
  susan: ["sue","suzie"], barbara: ["barb"],
  victoria: ["vicky","vicki"], cynthia: ["cindy"],
  deborah: ["deb","debbie"], jacqueline: ["jackie"],
};
const _nickRev = new Map();
for (const [canonical, nicks] of Object.entries(NICKNAMES)) {
  for (const nick of nicks) {
    if (!_nickRev.has(nick)) _nickRev.set(nick, new Set());
    _nickRev.get(nick).add(canonical);
  }
}
function firstNameVariants(first) {
  const out = new Set([first]);
  if (NICKNAMES[first]) for (const n of NICKNAMES[first]) out.add(n);
  if (_nickRev.has(first)) {
    for (const canonical of _nickRev.get(first)) {
      out.add(canonical);
      if (NICKNAMES[canonical]) for (const n of NICKNAMES[canonical]) out.add(n);
    }
  }
  return out;
}
// Generate all meaningful shortened variants of a normalized name.
// Covers:
//   - Remove each individual middle token (handles 3-name and 4-name salary records)
//     e.g. "gonzalo alejandro bello lander" → "gonzalo bello lander", "gonzalo alejandro lander"
//   - Drop last token (compound last name in salary not fully in DB)
//     e.g. "daniel ayala rodrigues" → "daniel ayala"
//   - Combinations of the above for 4+ token names
function generateNameVariants(norm) {
  const tokens = norm.split(" ");
  const variants = new Set();
  if (tokens.length <= 2) return variants;

  // A) Remove each single middle token (index 1..N-2)
  for (let i = 1; i < tokens.length - 1; i++) {
    variants.add([...tokens.slice(0, i), ...tokens.slice(i + 1)].join(" "));
  }

  // B) Drop the last token entirely (compound last name truncation)
  variants.add(tokens.slice(0, -1).join(" "));

  // C) For 4+ tokens: remove one middle token then also drop the new last token
  if (tokens.length >= 4) {
    for (let i = 1; i < tokens.length - 1; i++) {
      const withoutMiddle = [...tokens.slice(0, i), ...tokens.slice(i + 1)];
      if (withoutMiddle.length >= 3) {
        variants.add(withoutMiddle.slice(0, -1).join(" "));
      }
    }
  }

  return variants;
}

// ── Professor-type title filter ───────────────────────────────────────────────
const PROF_TITLE_RE = /\bPROF\b|LECTURER|INSTRUCTOR|TEACHING|VISITING/i;
function isProfessorTitle(title) {
  return PROF_TITLE_RE.test(title || "");
}

async function main() {
  console.log(isDryRun ? "=== DRY RUN ===" : "=== LIVE RUN ===");

  // Load salary JSON
  const salaryPath = resolve(__dirname, "../public/data/uic-knowledge/uic-salaries.json");
  const salaryData = JSON.parse(readFileSync(salaryPath, "utf-8"));

  // Filter to professor-type records, keep highest-salary position per person
  const profRecords = [];
  for (const person of salaryData) {
    const profPositions = (person.positions || []).filter(p => isProfessorTitle(p.title));
    if (!profPositions.length) continue;
    const best = profPositions.sort((a, b) => (b.positionSalary || 0) - (a.positionSalary || 0))[0];
    profRecords.push({ name: person.name, salary: person.salary, title: best.title });
  }
  console.log(`Found ${profRecords.length} professor-type salary records.\n`);

  // Load all professors with nameNormalized
  const dbProfs = await prisma.professor.findMany({
    select: { id: true, name: true, nameNormalized: true, rmpRatingsCount: true },
  });
  console.log(`Loaded ${dbProfs.length} professors from DB.\n`);

  // Build exact-match map: nameNormalized → prof[]
  const exactMap = new Map();
  // Build first-last map: "first|||last" → prof[] (for DB names that have extra middle tokens)
  const firstLastMap = new Map();
  for (const p of dbProfs) {
    const key = p.nameNormalized || normalizeName(p.name);
    if (!exactMap.has(key)) exactMap.set(key, []);
    exactMap.get(key).push(p);

    const t = key.split(" ");
    if (t.length >= 3) {
      const fl = `${t[0]}|||${t[t.length - 1]}`;
      if (!firstLastMap.has(fl)) firstLastMap.set(fl, []);
      firstLastMap.get(fl).push(p);
    }
  }

  let exact = 0, middle = 0, nickname = 0, reverse = 0, skipped = 0, unmatched = 0;
  const updates = [];

  for (const rec of profRecords) {
    // Salary JSON names are "First [Middle] Last" — normalizeName handles it
    const norm = normalizeName(rec.name);
    if (!norm || norm.length < 3) { skipped++; continue; }

    let match = null;

    // Strategy 1: exact normalized name
    const exactHits = exactMap.get(norm) ?? [];
    if (exactHits.length >= 1) {
      match = exactHits.sort((a, b) => (b.rmpRatingsCount ?? 0) - (a.rmpRatingsCount ?? 0))[0];
      exact++;
    }

    // Strategy 2: name variants — remove each middle token, drop last token, combinations
    if (!match) {
      const variants = generateNameVariants(norm);
      for (const v of variants) {
        if (v.split(" ").length < 2) continue;
        const hits = exactMap.get(v) ?? [];
        if (hits.length >= 1) {
          match = hits.sort((a, b) => (b.rmpRatingsCount ?? 0) - (a.rmpRatingsCount ?? 0))[0];
          middle++;
          break;
        }
      }
    }

    // Strategy 3: nickname first-name — try all last-name candidates (last token and second-to-last)
    if (!match) {
      const tokens = norm.split(" ");
      const normFirst = tokens[0];
      // Candidate last names: actual last token + second-to-last (for compound surnames)
      const lastCandidates = new Set([tokens[tokens.length - 1]]);
      if (tokens.length >= 3) lastCandidates.add(tokens[tokens.length - 2]);

      const firstVariants = firstNameVariants(normFirst);
      firstVariants.delete(normFirst);
      const nickHits = [];
      for (const v of firstVariants) {
        for (const last of lastCandidates) {
          for (const hit of (exactMap.get(`${v} ${last}`) ?? [])) nickHits.push(hit);
        }
      }
      const seen = new Set();
      const unique = nickHits.filter(h => seen.has(h.id) ? false : (seen.add(h.id), true));
      if (unique.length >= 1) {
        match = unique.sort((a, b) => (b.rmpRatingsCount ?? 0) - (a.rmpRatingsCount ?? 0))[0];
        nickname++;
      }
    }

    // Strategy 4: reverse direction — salary name is shorter, DB name has extra middle tokens
    // e.g. salary "william o brien" (3 tokens) → DB "william john o brien" (4 tokens)
    // Match by first + last token pair
    if (!match) {
      const fl = `${tokens[0]}|||${tokens[tokens.length - 1]}`;
      const hits = firstLastMap.get(fl) ?? [];
      if (hits.length >= 1) {
        match = hits.sort((a, b) => (b.rmpRatingsCount ?? 0) - (a.rmpRatingsCount ?? 0))[0];
        reverse++;
      }
    }

    if (!match) { unmatched++; continue; }

    updates.push({ id: match.id, dbName: match.name, recName: rec.name, salary: rec.salary, salaryTitle: rec.title });
    console.log(`  ✓ ${rec.name} → "${match.name}" | $${rec.salary.toLocaleString()} | ${rec.title}`);
  }

  const total = profRecords.length - skipped;
  console.log(`\n─────────────────────────────────────`);
  console.log(`Exact:    ${exact}/${total}`);
  console.log(`Middle:   ${middle}/${total}`);
  console.log(`Nickname: ${nickname}/${total}`);
  console.log(`Reverse:  ${reverse}/${total}`);
  console.log(`Unmatched:${unmatched}/${total}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Total matches: ${updates.length}`);
  console.log(`─────────────────────────────────────\n`);

  if (!isDryRun && updates.length > 0) {
    console.log(`Writing ${updates.length} salary updates...`);
    for (const u of updates) {
      await prisma.professor.update({
        where: { id: u.id },
        data: { salary: u.salary, salaryTitle: u.salaryTitle },
      });
    }
    console.log(`Done.`);
  } else if (isDryRun) {
    console.log("Dry run — nothing written.");
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
