// scripts/name_resolution.mjs
//
// Resolves CSV instructor names (format: "Last, First Middle") to Professor.id
// by matching against Professor.nameNormalized (format: "first last", lowercase).
//
// Matching strategy (in order, stops at first success):
//   1. Exact normalized match — "jonathan bonham" == "jonathan bonham"
//   2. Middle-stripped match  — "jason victor chen" -> "jason chen" (only if exactly 1 result)
//   3. Null                   — ambiguous or not in RMP at all
//
// Non-professor names that always resolve to null:
//   "Grad Asst", "Staff", "TBA", anything under 3 chars
//
// Outputs:
//   prof_imports/raw/unmatched_instructors_<timestamp>.txt  — names with no RMP entry
//   prof_imports/raw/ambiguous_instructors_<timestamp>.txt  — names with multiple candidates

import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ── Nickname map ──────────────────────────────────────────────────────────────
// Maps canonical first names to common nicknames (and vice versa via reverse map).
// Keeps false-positive risk low — only well-known academic name pairs.
const NICKNAMES = {
  robert:      ["bob", "bobby", "rob", "robbie"],
  william:     ["bill", "billy", "will", "willie", "liam"],
  james:       ["jim", "jimmy", "jamie"],
  michael:     ["mike", "mick", "mickey"],
  thomas:      ["tom", "tommy"],
  david:       ["dave", "davy"],
  richard:     ["rick", "rich", "dick"],
  joseph:      ["joe", "joey"],
  charles:     ["charlie", "chuck"],
  daniel:      ["dan", "danny"],
  stephen:     ["steve", "stevie"],
  steven:      ["steve", "stevie"],
  christopher: ["chris"],
  matthew:     ["matt"],
  anthony:     ["tony"],
  andrew:      ["andy", "drew"],
  benjamin:    ["ben", "benny"],
  nicholas:    ["nick", "nicky"],
  alexander:   ["alex"],
  jonathan:    ["jon", "johnny"],
  samuel:      ["sam"],
  edward:      ["ed", "ted", "ned"],
  henry:       ["hank", "harry"],
  john:        ["jack", "johnny"],
  patrick:     ["pat"],
  timothy:     ["tim", "timmy"],
  jeffrey:     ["jeff"],
  gregory:     ["greg"],
  donald:      ["don"],
  kenneth:     ["ken", "kenny"],
  mark:        ["marc"],
  marc:        ["mark"],
  katherine:   ["kate", "katie", "kathy", "kat"],
  kathryn:     ["kate", "katie", "kathy"],
  elizabeth:   ["liz", "beth", "betty", "lisa"],
  jennifer:    ["jen", "jenny"],
  margaret:    ["peg", "peggy", "maggie"],
  patricia:    ["pat", "patty", "trish"],
  susan:       ["sue", "suzie"],
  barbara:     ["barb"],
  victoria:    ["vicky", "vicki"],
  cynthia:     ["cindy"],
  deborah:     ["deb", "debbie"],
  jacqueline:  ["jackie"],
};

// Build reverse lookup: nickname → Set of canonical names it expands to
const _nickRev = new Map();
for (const [canonical, nicks] of Object.entries(NICKNAMES)) {
  for (const nick of nicks) {
    if (!_nickRev.has(nick)) _nickRev.set(nick, new Set());
    _nickRev.get(nick).add(canonical);
  }
}

// Returns all first-name variants for a given normalized first token.
// E.g. "bob" → ["bob","robert","bobby","rob","robbie"]
function firstNameVariants(first) {
  const out = new Set([first]);
  // If it's a canonical name, add its nicknames
  if (NICKNAMES[first]) {
    for (const n of NICKNAMES[first]) out.add(n);
  }
  // If it's a nickname, add the canonical(s) and their nicknames
  if (_nickRev.has(first)) {
    for (const canonical of _nickRev.get(first)) {
      out.add(canonical);
      if (NICKNAMES[canonical]) {
        for (const n of NICKNAMES[canonical]) out.add(n);
      }
    }
  }
  return out;
}

// Names that are never professors — skip immediately, resolve to null.
const NON_PROFESSOR_NAMES = new Set([
  "grad asst", "staff", "tba", "to be announced", "to be determined",
  "tbd", "visiting lecturer", "visiting instructor",
]);

// ── Normalization ─────────────────────────────────────────────────────────────
// Converts a raw CSV instructor name to the same form stored in
// Professor.nameNormalized.
//
// CSV format:  "Last, First Middle"  e.g. "Chen, Jason Victor"
// RMP format:  "First Last"          e.g. "Jason Chen"
// Normalized:  "first last"          e.g. "jason chen"
//
// The SQL backfill that populated nameNormalized used:
//   lower(regexp_replace(trim(CASE WHEN name LIKE '%,%' THEN ...swap... ELSE name END), '[^a-z0-9 ]','','g'))
// This JS function must produce identical output.

export function normalizeName(raw) {
  if (!raw || typeof raw !== "string") return "";
  const s = raw.trim();
  if (!s) return "";

  let combined;
  if (s.includes(",")) {
    // "Last, First Middle" → "First Middle Last"
    const commaIdx = s.indexOf(",");
    const last  = s.slice(0, commaIdx).trim();
    const first = s.slice(commaIdx + 1).trim();
    combined = `${first} ${last}`;
  } else {
    combined = s;
  }

  // Lowercase, strip everything except a-z 0-9 space, collapse whitespace
  return combined
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Strips middle names/initials from a normalized name.
// "jason victor chen" → "jason chen"
// "spencer g mcneil"  → "spencer mcneil"
// "george scully"     → "george scully"  (unchanged, already 2 tokens)
function stripMiddle(norm) {
  const tokens = norm.split(" ");
  if (tokens.length <= 2) return norm;
  return `${tokens[0]} ${tokens[tokens.length - 1]}`;
}

// ── Main resolution function ──────────────────────────────────────────────────
// Takes a deduplicated array of raw instructor name strings.
// Returns a Map<rawName, professorId|null>.
//
// Also writes two log files:
//   - unmatched: names not found in Professor table at all
//   - ambiguous: names where middle-strip produced multiple candidates

export async function resolveInstructorNames(rawNames) {
  const resolutionMap = new Map(); // rawName -> professorId | null
  const unmatched  = [];
  const ambiguous  = [];

  const unique = [...new Set(rawNames.map(n => String(n || "").trim()))];

  console.log(`  Resolving ${unique.length} unique instructor names...`);

  // Load ALL professors with nameNormalized into memory.
  // This avoids N+1 queries — one DB round trip total.
  const allProfessors = await prisma.professor.findMany({
    select: { id: true, name: true, nameNormalized: true, rmpRatingsCount: true },
  });

  // Build lookup maps
  // exactMap: normalized name -> Professor[] (usually length 1)
  const exactMap = new Map();
  for (const prof of allProfessors) {
    if (!prof.nameNormalized) continue;
    const key = prof.nameNormalized;
    if (!exactMap.has(key)) exactMap.set(key, []);
    exactMap.get(key).push(prof);
  }

  let exactMatches    = 0;
  let middleMatches   = 0;
  let nicknameMatches = 0;
  let ambiguousCount  = 0;
  let unmatchedCount  = 0;
  let skippedCount    = 0;

  for (const raw of unique) {
    // ── Skip non-professor entries ──────────────────────────────────────────
    const lowRaw = raw.toLowerCase();
    if (
      raw.length < 3 ||
      NON_PROFESSOR_NAMES.has(lowRaw) ||
      /^\d+$/.test(raw) // pure numbers
    ) {
      resolutionMap.set(raw, null);
      skippedCount++;
      continue;
    }

    const norm = normalizeName(raw);
    if (!norm || norm.length < 3) {
      resolutionMap.set(raw, null);
      skippedCount++;
      continue;
    }

    // ── Strategy 1: exact normalized match ─────────────────────────────────
    const exactHits = exactMap.get(norm) ?? [];
    if (exactHits.length === 1) {
      resolutionMap.set(raw, exactHits[0].id);
      exactMatches++;
      continue;
    }
    if (exactHits.length > 1) {
      // Exact name collision in RMP (e.g. two "Jason Chen" entries).
      // Pick the one with the most ratings — deterministic tiebreak.
      const best = exactHits.sort((a, b) => (b.rmpRatingsCount ?? 0) - (a.rmpRatingsCount ?? 0))[0];
      resolutionMap.set(raw, best.id);
      exactMatches++;
      continue;
    }

    // ── Strategy 2: middle-stripped match ──────────────────────────────────
    // Only attempt if the normalized name has 3+ tokens (has a middle name/initial).
    const tokens = norm.split(" ");
    if (tokens.length >= 3) {
      const short = stripMiddle(norm);
      const shortHits = exactMap.get(short) ?? [];

      if (shortHits.length === 1) {
        // Exactly one candidate after stripping — safe to link.
        resolutionMap.set(raw, shortHits[0].id);
        middleMatches++;
        continue;
      }

      if (shortHits.length > 1) {
        // Multiple candidates — different people share first+last name.
        // Do NOT guess. Leave null. Log for manual review.
        resolutionMap.set(raw, null);
        ambiguousCount++;
        ambiguous.push({ raw, norm, shortNorm: short, candidates: shortHits.map(p => `${p.name} (${p.id})`) });
        continue;
      }
    }

    // ── Strategy 3: nickname first-name match ──────────────────────────────
    // Try every variant of the first name (e.g. "robert" → also try "bob").
    // Only use the last token as last-name to avoid middle-name noise.
    const normTokens = norm.split(" ");
    const normFirst = normTokens[0];
    const normLast  = normTokens[normTokens.length - 1];
    if (normFirst !== normLast) {
      const variants = firstNameVariants(normFirst);
      variants.delete(normFirst); // already tried above
      const nickHits = [];
      for (const v of variants) {
        for (const hit of (exactMap.get(`${v} ${normLast}`) ?? [])) {
          nickHits.push(hit);
        }
      }
      // Deduplicate by id
      const seenIds = new Set();
      const uniqueNickHits = nickHits.filter(h => seenIds.has(h.id) ? false : (seenIds.add(h.id), true));

      if (uniqueNickHits.length >= 1) {
        const best = uniqueNickHits.sort((a, b) => (b.rmpRatingsCount ?? 0) - (a.rmpRatingsCount ?? 0))[0];
        resolutionMap.set(raw, best.id);
        nicknameMatches++;
        continue;
      }
    }

    // ── No match ────────────────────────────────────────────────────────────
    resolutionMap.set(raw, null);
    unmatchedCount++;
    unmatched.push(raw);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = unique.length - skippedCount;
  console.log(`  ✅ Exact match:         ${exactMatches}/${total}`);
  console.log(`  ✅ Middle-strip match:  ${middleMatches}/${total}`);
  console.log(`  ✅ Nickname match:      ${nicknameMatches}/${total}`);
  console.log(`  ⚠️  Ambiguous (null):   ${ambiguousCount}/${total}`);
  console.log(`  ℹ️  No RMP entry (null): ${unmatchedCount}/${total}`);
  console.log(`  ⏭️  Skipped (non-prof):  ${skippedCount}`);

  // ── Write log files ────────────────────────────────────────────────────────
  const ts = Date.now();
  const logDir = path.join(process.cwd(), "prof_imports", "raw");
  fs.mkdirSync(logDir, { recursive: true });

  if (unmatched.length > 0) {
    const unmatchedPath = path.join(logDir, `unmatched_instructors_${ts}.txt`);
    fs.writeFileSync(unmatchedPath, [...new Set(unmatched)].sort().join("\n"), "utf8");
    console.log(`  📄 Unmatched names written to: ${unmatchedPath}`);
  }

  if (ambiguous.length > 0) {
    const ambiguousPath = path.join(logDir, `ambiguous_instructors_${ts}.txt`);
    const lines = ambiguous.map(a =>
      `RAW: ${a.raw}\nNORMALIZED: ${a.norm}\nSHORT: ${a.shortNorm}\nCANDIDATES:\n${a.candidates.map(c => `  - ${c}`).join("\n")}\n`
    );
    fs.writeFileSync(ambiguousPath, lines.join("\n---\n"), "utf8");
    console.log(`  📄 Ambiguous names written to: ${ambiguousPath}`);
  }

  return resolutionMap;
}

// ── Standalone backfill mode ──────────────────────────────────────────────────
// Run directly to backfill professorId on ALL existing CourseInstructorTermStats rows.
// Usage: node --env-file=.env scripts/name_resolution.mjs --backfill

async function backfill() {
  console.log("\n🔗 Starting professorId backfill on CourseInstructorTermStats...\n");

  // Load all distinct instructor names from the stats table
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT "instructorName"
    FROM "CourseInstructorTermStats"
    WHERE "professorId" IS NULL
  `;

  const rawNames = rows.map(r => r.instructorName);
  console.log(`  Found ${rawNames.length} unresolved unique instructor names in DB\n`);

  if (rawNames.length === 0) {
    console.log("  Nothing to backfill.");
    return;
  }

  const resolutionMap = await resolveInstructorNames(rawNames);

  // Apply updates in batches — only update rows where we found a match
  let updated = 0;
  const toUpdate = [...resolutionMap.entries()].filter(([, id]) => id !== null);

  console.log(`\n  Updating ${toUpdate.length} instructor names with resolved professorId...`);

  for (let i = 0; i < toUpdate.length; i += 50) {
    const batch = toUpdate.slice(i, i + 50);
    await Promise.all(
      batch.map(([instructorName, professorId]) =>
        prisma.courseInstructorTermStats.updateMany({
          where: { instructorName, professorId: null },
          data:  { professorId },
        })
      )
    );
    updated += batch.length;
    process.stdout.write(`\r  Updated ${updated}/${toUpdate.length}`);
  }

  console.log(`\n\n  ✅ Backfill complete. ${toUpdate.length} instructor names linked to Professor rows.`);
}

// Run backfill if called directly with --backfill flag
if (process.argv.includes("--backfill")) {
  backfill()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); await pool.end(); });
}