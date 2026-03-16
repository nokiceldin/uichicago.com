#!/usr/bin/env node
// scripts/build-embeddings.mjs
// Run: node --env-file=.env scripts/build-embeddings.mjs
// This converts all courses, professors, and news into searchable vectors

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const BATCH_SIZE = 64;
const EMBEDDING_MODEL = "voyage-3-large";

// ─── Embed a batch of texts via Voyage AI ─────────────────────────────────────
async function embedBatch(texts) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, input_type: "document" }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Voyage API error: ${err}`);
  }
  const json = await res.json();
  return json.data.map(d => d.embedding);
}

// ─── Upsert a chunk with embedding ───────────────────────────────────────────
async function upsertChunk(content, sourceType, sourceId, metadata, embedding) {
  const embeddingStr = `[${embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(`
    INSERT INTO "KnowledgeChunk" (id, content, "sourceType", "sourceId", metadata, embedding, "embeddingUpdatedAt", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::vector, NOW(), NOW(), NOW())
    ON CONFLICT ("sourceId", "sourceType") DO UPDATE SET
      content = EXCLUDED.content,
      metadata = EXCLUDED.metadata,
      embedding = EXCLUDED.embedding,
      "embeddingUpdatedAt" = NOW(),
      "updatedAt" = NOW()
  `, content, sourceType, sourceId, JSON.stringify(metadata), embeddingStr);
}

function diffLabel(score) {
  if (score == null) return "No data";
  if (score >= 4.5) return "Very Easy";
  if (score >= 3.5) return "Easy";
  if (score >= 2.5) return "Medium";
  if (score >= 1.5) return "Hard";
  return "Very Hard";
}

// ─── Build course chunks ──────────────────────────────────────────────────────
async function buildCourseChunks() {
  console.log("\n📚 Building course embeddings...");
  const courses = await prisma.course.findMany({
    where: { avgGpa: { not: null } },
    select: {
      id: true, subject: true, number: true, title: true,
      deptName: true, avgGpa: true, difficultyScore: true,
      totalRegsAllTime: true, isGenEd: true, genEdCategory: true,
      termStats: { select: { a: true, b: true, c: true, d: true, f: true, gradeRegs: true } },
      instructorStats: { select: { instructorName: true, gradeRegs: true } },
    },
    orderBy: { totalRegsAllTime: "desc" },
  });

  console.log(`  Found ${courses.length} courses`);
  let processed = 0;

  for (let i = 0; i < courses.length; i += BATCH_SIZE) {
    const batch = courses.slice(i, i + BATCH_SIZE);

    const allTexts = [];
    const allMeta = [];

    for (const c of batch) {
      const topProfs = c.instructorStats
        ?.sort((a, b) => b.gradeRegs - a.gradeRegs)
        ?.slice(0, 3)
        ?.map(i => i.instructorName)
        ?.join(", ") ?? "";

      const gradeInfo = c.termStats?.length ? (() => {
        const totals = c.termStats.reduce((acc, t) => ({
          a: acc.a + t.a, b: acc.b + t.b, c: acc.c + t.c,
          d: acc.d + t.d, f: acc.f + t.f, total: acc.total + t.gradeRegs
        }), { a: 0, b: 0, c: 0, d: 0, f: 0, total: 0 });
        if (totals.total === 0) return "";
        const pct = x => ((x / totals.total) * 100).toFixed(0);
        return `${pct(totals.a)}% A, ${pct(totals.b)}% B, ${pct(totals.c)}% C, ${pct(totals.d)}% D, ${pct(totals.f)}% F`;
      })() : "";

      // 1. Catalog chunk — what is this course
      const catalogText = `${c.subject} ${c.number} — ${c.title}. ` +
        `Department: ${c.deptName ?? "N/A"}. ` +
        `Total enrollments: ${c.totalRegsAllTime?.toLocaleString() ?? "N/A"}. ` +
        (c.isGenEd ? `This is a Gen Ed course. Category: ${c.genEdCategory ?? "N/A"}. ` : "") +
        (topProfs ? `Common instructors: ${topProfs}. ` : "") +
        `[UIC Course Catalog | ${c.deptName ?? c.subject} | 2025-2026]`;
      allTexts.push(catalogText);
      allMeta.push({ type: "catalog", subject: c.subject, number: c.number, title: c.title, dept: c.deptName, isGenEd: c.isGenEd, courseId: c.id });

      // 2. Grade chunk — how easy/hard is this course
      const gradeText = `${c.subject} ${c.number} (${c.title}) grade data. ` +
        `Average GPA: ${c.avgGpa?.toFixed(2) ?? "N/A"}. ` +
        `Difficulty: ${diffLabel(c.difficultyScore)} (${c.difficultyScore?.toFixed(1) ?? "N/A"}/5). ` +
        (gradeInfo ? `Grade distribution: ${gradeInfo}. ` : "") +
        `[UIC Course Grade Data | ${c.deptName ?? c.subject} | Source: grade distribution database]`;
      allTexts.push(gradeText);
      allMeta.push({ type: "grades", subject: c.subject, number: c.number, gpa: c.avgGpa, difficulty: c.difficultyScore, courseId: c.id });
    }

    try {
      const embeddings = await embedBatch(allTexts);
      for (let j = 0; j < allTexts.length; j++) {
        const meta = allMeta[j];
        await upsertChunk(
          allTexts[j],
          "course",
          `${meta.courseId}_${meta.type}`,
          meta,
          embeddings[j]
        );
        if (meta.type === "catalog") processed++;
      }
      console.log(`  ✅ Courses: ${processed}/${courses.length}`);
    } catch (err) {
      console.error(`  ❌ Batch ${i}-${i+BATCH_SIZE} failed:`, err.message);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`  → Done: ${processed} courses (${processed * 2} total chunks)`);
}

// ─── Build professor chunks ───────────────────────────────────────────────────
async function buildProfessorChunks() {
  console.log("\n👨‍🏫 Building professor embeddings...");
  const professors = await prisma.professor.findMany({
    where: { rmpRatingsCount: { gt: 0 } },
    select: {
      id: true, name: true, department: true, school: true,
      rmpQuality: true, rmpDifficulty: true, rmpRatingsCount: true,
      rmpWouldTakeAgain: true, aiSummary: true, slug: true,
    },
    orderBy: { rmpRatingsCount: "desc" },
  });

  console.log(`  Found ${professors.length} professors`);
  let processed = 0;

  for (let i = 0; i < professors.length; i += BATCH_SIZE) {
    const batch = professors.slice(i, i + BATCH_SIZE);

    // Build multiple representations per professor
    const allTexts = [];
    const allMeta = [];

    for (const p of batch) {
      // 1. Profile chunk — who is this professor
      const profileText = `Professor ${p.name}. Department: ${p.department}. ` +
        `Overall RMP rating: ${p.rmpQuality?.toFixed(1) ?? "N/A"}/5 from ${p.rmpRatingsCount ?? 0} student reviews. ` +
        `Would take again: ${p.rmpWouldTakeAgain ?? "N/A"}%. ` +
        `[UIC Professor Profile | ${p.department} | Source: RateMyProfessors]`;
      allTexts.push(profileText);
      allMeta.push({ type: "profile", name: p.name, dept: p.department, quality: p.rmpQuality, slug: p.slug, profId: p.id });

      // 2. Difficulty/grading chunk — is this professor easy or hard
      const diffText = `Professor ${p.name} (${p.department}) difficulty and grading. ` +
        `RMP difficulty: ${p.rmpDifficulty?.toFixed(1) ?? "N/A"}/5 (1=easy, 5=hard). ` +
        `Overall quality: ${p.rmpQuality?.toFixed(1) ?? "N/A"}/5. ` +
        `Would take again: ${p.rmpWouldTakeAgain ?? "N/A"}%. ` +
        `Based on ${p.rmpRatingsCount ?? 0} reviews. ` +
        `[UIC Professor Difficulty Data | ${p.department} | Source: RateMyProfessors]`;
      allTexts.push(diffText);
      allMeta.push({ type: "difficulty", name: p.name, dept: p.department, difficulty: p.rmpDifficulty, slug: p.slug, profId: p.id });

      // 3. Student consensus chunk — what do students say
      if (p.aiSummary) {
        const reviewText = `Student reviews for Professor ${p.name} (${p.department}): ${p.aiSummary} ` +
          `[UIC Professor Student Reviews | ${p.department} | Source: RateMyProfessors student consensus]`;
        allTexts.push(reviewText);
        allMeta.push({ type: "reviews", name: p.name, dept: p.department, quality: p.rmpQuality, slug: p.slug, profId: p.id });
      }
    }

    try {
      const embeddings = await embedBatch(allTexts);
      for (let j = 0; j < allTexts.length; j++) {
        const meta = allMeta[j];
        // Use compound sourceId so each chunk type gets its own row
        await upsertChunk(
          allTexts[j],
          "professor",
          `${meta.profId}_${meta.type}`,
          meta,
          embeddings[j]
        );
        if (meta.type === "profile") processed++;
      }
      console.log(`  ✅ Professors: ${processed}/${professors.length}`);
    } catch (err) {
      console.error(`  ❌ Batch ${i}-${i+BATCH_SIZE} failed:`, err.message);
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`  → Done: ${processed} professors (${processed * 2}-${processed * 3} total chunks)`);
}

// ─── Build news/knowledge chunks ─────────────────────────────────────────────
async function buildNewsChunks() {
  console.log("\n📰 Building news embeddings...");
  const news = await prisma.newsItem.findMany({
    where: {
      publishedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }, // last 90 days
    },
    select: { id: true, title: true, aiSummary: true, source: true, category: true, publishedAt: true },
    orderBy: { publishedAt: "desc" },
  });

  console.log(`  Found ${news.length} news items`);
  let processed = 0;

  for (let i = 0; i < news.length; i += BATCH_SIZE) {
    const batch = news.slice(i, i + BATCH_SIZE);

    const texts = batch.map(n =>
      `[${n.publishedAt.toLocaleDateString()}] ${n.title}. ` +
      (n.aiSummary ? n.aiSummary : "") +
      ` Source: ${n.source}. Category: ${n.category ?? "general"}.`
    );

    try {
      const embeddings = await embedBatch(texts);
      for (let j = 0; j < batch.length; j++) {
        const n = batch[j];
        await upsertChunk(
          texts[j],
          "news",
          n.id,
          { title: n.title, source: n.source, category: n.category, date: n.publishedAt },
          embeddings[j]
        );
        processed++;
      }
    } catch (err) {
      console.error(`  ❌ Batch ${i}-${i+BATCH_SIZE} failed:`, err.message);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`  → Done: ${processed} news embeddings`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔢 Building UIC knowledge embeddings...");
  console.log("This will take a while for courses (2,696) and professors (1,275).\n");

  // First make sure the vector column exists
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS embedding vector(1024);
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS knowledge_chunk_embedding_idx
      ON "KnowledgeChunk" USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    `);
    console.log("✅ Vector column and index ready");
  } catch (err) {
    console.log("Vector column setup:", err.message);
  }

  const args = process.argv.slice(2);
  const runAll = args.length === 0;

  if (runAll || args.includes("--news")) await buildNewsChunks();
  if (runAll || args.includes("--professors")) await buildProfessorChunks();
  if (runAll || args.includes("--courses")) await buildCourseChunks();

  const total = await prisma.knowledgeChunk.count();
  console.log(`\n✅ Done! Total knowledge chunks: ${total}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async err => {
  console.error("Fatal:", err);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
