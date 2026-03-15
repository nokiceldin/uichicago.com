#!/usr/bin/env node
// scripts/import-catalog.mjs
// Run: node --env-file=.env scripts/import-catalog.mjs
// Scrapes catalog.uic.edu/ucat/course-descriptions/ for all course descriptions

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const BASE = "https://catalog.uic.edu";
const INDEX = `${BASE}/ucat/course-descriptions/`;
const DELAY = 400; // ms between requests — be polite to the server
const EMBEDDING_MODEL = "voyage-3";
const BATCH_SIZE = 64;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Embed via Voyage ─────────────────────────────────────────────────────────
async function embedBatch(texts) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, input_type: "document" }),
  });
  if (!res.ok) throw new Error(`Voyage error: ${await res.text()}`);
  const json = await res.json();
  return json.data.map(d => d.embedding);
}

// ─── Upsert chunk ─────────────────────────────────────────────────────────────
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

// ─── Strip HTML tags ──────────────────────────────────────────────────────────
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Get all department links from index page ─────────────────────────────────
async function getDepartmentLinks() {
  console.log("📋 Fetching department list...");
  const res = await fetch(INDEX, { headers: { "User-Agent": "UICSparky/1.0 (educational)" } });
  const html = await res.text();

  const links = [];
  const linkRegex = /href="(\/ucat\/course-descriptions\/[^"]+\/)"/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const path = match[1];
    if (path !== "/ucat/course-descriptions/") {
      links.push(BASE + path);
    }
  }

  // Deduplicate
  const unique = [...new Set(links)];
  console.log(`  Found ${unique.length} departments`);
  return unique;
}

// ─── Parse courses from a department page ────────────────────────────────────
function parseCourses(html, deptUrl) {
  const courses = [];

  // Extract department code from URL
  const deptMatch = deptUrl.match(/\/course-descriptions\/([^/]+)\//);
  const deptCode = deptMatch ? deptMatch[1].toUpperCase() : "UNKNOWN";

  // Extract department name from <h1>
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  const deptName = h1Match ? stripHtml(h1Match[1]) : deptCode;

  // Find all course blocks
  // Pattern: <p><strong>SUBJ NNN. Title. N hours.</strong> description</p>
  // Also handles variations like <p class="...">
  const courseBlockRegex = /<(?:p|dt)[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>([\s\S]*?)(?=<(?:p|dt)[^>]*>\s*<strong|<\/(?:div|section|main)>)/gi;

  let match;
  while ((match = courseBlockRegex.exec(html)) !== null) {
    const headerRaw = stripHtml(match[1]);
    const descRaw = stripHtml(match[2]);

    // Parse "SUBJ NNN. Course Title. N hours."
    const headerMatch = headerRaw.match(/^([A-Z&]{2,8})\s+(\d+[A-Z]?)\.\s+(.+?)\.\s+(\d+(?:\.\d+)?(?:–\d+(?:\.\d+)?)?)\s+hours?\./i);
    if (!headerMatch) continue;

    const subject = headerMatch[1].toUpperCase();
    const number = headerMatch[2].toUpperCase();
    const title = headerMatch[3].trim();
    const hours = headerMatch[4];
    const description = descRaw.trim();

    if (!subject || !number || !title) continue;

    courses.push({
      subject,
      number,
      title,
      hours,
      description,
      deptCode,
      deptName,
    });
  }

  return courses;
}

// ─── Process a single department ─────────────────────────────────────────────
async function processDepartment(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "UICSparky/1.0 (educational)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return parseCourses(html, url);
  } catch (err) {
    console.error(`  ❌ Failed ${url}: ${err.message}`);
    return [];
  }
}

// ─── Update course descriptions in DB ────────────────────────────────────────
async function updateCourseDescriptions(courses) {
  let updated = 0;
  for (const c of courses) {
    try {
      await prisma.course.updateMany({
        where: {
          subject: { equals: c.subject, mode: "insensitive" },
          number: { equals: c.number, mode: "insensitive" },
        },
        data: {
          // Store description in title field if no description field exists
          // We'll add it to KnowledgeChunk for vector search
        },
      });
      updated++;
    } catch { /* course might not be in our DB yet — still embed it */ }
  }
  return updated;
}

// ─── Build embeddings for course descriptions ─────────────────────────────────
async function embedCourseDescriptions(allCourses) {
  console.log(`\n🔢 Building embeddings for ${allCourses.length} course descriptions...`);
  let embedded = 0;

  for (let i = 0; i < allCourses.length; i += BATCH_SIZE) {
    const batch = allCourses.slice(i, i + BATCH_SIZE);

    const texts = batch.map(c =>
      `${c.subject} ${c.number} — ${c.title}. ${c.hours} credit hours. ` +
      `Department: ${c.deptName}. ` +
      (c.description ? `Description: ${c.description.slice(0, 500)}` : "")
    );

    try {
      const embeddings = await embedBatch(texts);
      for (let j = 0; j < batch.length; j++) {
        const c = batch[j];
        await upsertChunk(
          texts[j],
          "course-description",
          `catalog-${c.subject}-${c.number}`,
          { subject: c.subject, number: c.number, title: c.title, hours: c.hours, dept: c.deptName, description: c.description?.slice(0, 300) },
          embeddings[j]
        );
        embedded++;
      }

      if (embedded % 50 === 0) {
        console.log(`  ✅ ${embedded}/${allCourses.length} embedded`);
      }
    } catch (err) {
      console.error(`  ❌ Embedding batch ${i}-${i+BATCH_SIZE}: ${err.message}`);
      await sleep(2000); // wait longer on error
    }

    await sleep(250);
  }

  return embedded;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("📚 UIC Course Catalog Import");
  console.log("Scraping catalog.uic.edu/ucat/course-descriptions/\n");

  const deptLinks = await getDepartmentLinks();
  const allCourses = [];

  for (let i = 0; i < deptLinks.length; i++) {
    const url = deptLinks[i];
    const deptMatch = url.match(/\/([^/]+)\/$/);
    const deptCode = deptMatch ? deptMatch[1].toUpperCase() : url;

    process.stdout.write(`  [${i+1}/${deptLinks.length}] ${deptCode}... `);
    const courses = await processDepartment(url);
    allCourses.push(...courses);
    process.stdout.write(`${courses.length} courses\n`);

    await sleep(DELAY);
  }

  console.log(`\n✅ Scraped ${allCourses.length} total courses from ${deptLinks.length} departments`);

  // Save to a local JSON for reference
  const fs = await import("fs");
  fs.writeFileSync("./scripts/catalog-scraped.json", JSON.stringify(allCourses, null, 2));
  console.log("💾 Saved raw data to scripts/catalog-scraped.json");

  // Build embeddings
  const embedded = await embedCourseDescriptions(allCourses);
  console.log(`\n✅ Done! ${embedded} course descriptions embedded`);

  const total = await prisma.knowledgeChunk.count();
  console.log(`📊 Total knowledge chunks in DB: ${total}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async err => {
  console.error("Fatal:", err);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
