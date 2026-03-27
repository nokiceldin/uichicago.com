/**
 * Sparky — Instagram Captions Importer
 *
 * Reads all caption JSON files from public/data/instagram-captions/,
 * cleans the text, groups short posts into chunks, embeds via Voyage AI,
 * and upserts into the KnowledgeChunk table.
 *
 * Usage:
 *   node scripts/seed-instagram-captions.mjs
 *
 * Requirements:
 *   VOYAGE_API_KEY and DATABASE_URL must be set in your .env file.
 *
 * Safe to re-run — uses upsert (ON CONFLICT DO UPDATE).
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync, readdirSync } from "fs";
import { join, basename, dirname } from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAPTIONS_DIR = join(__dirname, "..", "public", "data", "instagram-captions");
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const EMBEDDING_MODEL = "voyage-3-large";
const BATCH_SIZE = 8;

// Posts shorter than this (after cleaning) are grouped together, not embedded alone
const MIN_SOLO_LENGTH = 80;
// Max posts to group together into one chunk
const GROUP_SIZE = 5;

// ── Text cleaning ─────────────────────────────────────────────────────────────

function decodeHtmlEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function cleanCaption(raw) {
  if (!raw) return "";

  let text = decodeHtmlEntities(raw);

  // Strip the leading likes/comments/account header from caption_raw if present
  // e.g. "982 likes, 0 comments - uiccsi October 21, 2025: "
  text = text.replace(/^\d[\d,]* likes?,.*?:\s*/i, "");

  // Remove surrounding quotes added by the scraper
  text = text.replace(/^["']|["']\.?\s*$/g, "").trim();

  // Strip hashtags (keep the word, remove the #)
  text = text.replace(/#(\w+)/g, "$1");

  // Strip URLs
  text = text.replace(/https?:\/\/\S+/g, "").trim();

  // Collapse excessive whitespace/newlines
  text = text.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim();

  return text;
}

function isUseful(text) {
  if (!text || text.length < 20) return false;
  // Skip posts that are purely emoji or hashtags with no real words
  const wordsOnly = text.replace(/[\u{1F000}-\u{1FFFF}]/gu, "").replace(/\s+/g, " ").trim();
  return wordsOnly.length >= 20;
}

// ── Voyage embedding ──────────────────────────────────────────────────────────

async function embedTexts(texts) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      input_type: "document",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Voyage embedding failed: ${errText}`);
  }

  const json = await res.json();
  return json.data.map((d) => d.embedding);
}

// ── DB upsert ─────────────────────────────────────────────────────────────────

async function upsertChunk(content, sourceId, metadata, embedding) {
  const embeddingStr = `[${embedding.join(",")}]`;
  const metadataStr = JSON.stringify(metadata);

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "KnowledgeChunk" (
      id, content, "sourceType", "sourceId", metadata, embedding,
      "chunkType", "entityId", "entityType", "trustLevel", "validUntil",
      "embeddingUpdatedAt", "createdAt", "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text,
      $1, 'instagram', $2, $3, $4::vector,
      'instagram_post', $5, 'instagram_account', 'community', NULL,
      NOW(), NOW(), NOW()
    )
    ON CONFLICT ("sourceId", "sourceType") DO UPDATE SET
      content = EXCLUDED.content,
      metadata = EXCLUDED.metadata,
      embedding = EXCLUDED.embedding,
      "embeddingUpdatedAt" = NOW(),
      "updatedAt" = NOW()
    `,
    content,
    sourceId,
    metadataStr,
    embeddingStr,
    metadata.account
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!VOYAGE_API_KEY) throw new Error("VOYAGE_API_KEY is not set in .env");

  const files = readdirSync(CAPTIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => join(CAPTIONS_DIR, f));

  console.log(`\nSparky — Instagram Captions Importer`);
  console.log(`Found ${files.length} caption files\n`);

  const chunks = []; // { content, sourceId, metadata }
  let totalPosts = 0;
  let skippedPosts = 0;

  for (const filePath of files) {
    const fileBase = basename(filePath, ".json");
    let posts;
    try {
      posts = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      console.warn(`  Skipping ${fileBase}: JSON parse error`);
      continue;
    }

    if (!Array.isArray(posts) || posts.length === 0) continue;

    const account      = posts[0]?.account      ?? fileBase.replace("_captions", "");
    const accountName  = posts[0]?.account_name ?? account;
    const category     = posts[0]?.category     ?? "community";

    // Clean all captions for this account
    const cleaned = posts.map((p) => ({
      text: cleanCaption(p.caption || p.caption_raw || ""),
      url:  p.post_url ?? null,
      publishedAt: p.published_at ?? null,
    }));

    totalPosts += posts.length;

    // Separate into solo-worthy (long enough) and short posts
    const solo  = cleaned.filter((c) => isUseful(c.text) && c.text.length >= MIN_SOLO_LENGTH);
    const short = cleaned.filter((c) => isUseful(c.text) && c.text.length < MIN_SOLO_LENGTH);

    skippedPosts += posts.length - solo.length - short.length;

    // Each long post becomes its own chunk
    solo.forEach((c, i) => {
      const content = `[UIC Instagram — @${account} (${accountName})]\n${c.text}`;
      chunks.push({
        content,
        sourceId: `instagram:${account}:solo:${i}`,
        metadata: { account, accountName, category, postUrl: c.url },
      });
    });

    // Group short posts together (GROUP_SIZE per chunk)
    for (let i = 0; i < short.length; i += GROUP_SIZE) {
      const group = short.slice(i, i + GROUP_SIZE);
      const combined = group.map((c) => c.text).join("\n---\n");
      const content = `[UIC Instagram — @${account} (${accountName})]\n${combined}`;
      chunks.push({
        content,
        sourceId: `instagram:${account}:group:${Math.floor(i / GROUP_SIZE)}`,
        metadata: { account, accountName, category },
      });
    }
  }

  console.log(`Total posts across all files: ${totalPosts}`);
  console.log(`Posts skipped (too short/empty): ${skippedPosts}`);
  console.log(`Chunks to embed: ${chunks.length}\n`);

  let upserted = 0;
  const totalBatches = Math.ceil(chunks.length / BATCH_SIZE);

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batch.length} chunks)... `);

    let embeddings;
    try {
      embeddings = await embedTexts(batch.map((c) => c.content));
    } catch (err) {
      console.error(`\n  ERROR on batch ${batchNum}: ${err.message}`);
      console.error("  Retrying once after 5s...");
      await new Promise((r) => setTimeout(r, 5000));
      embeddings = await embedTexts(batch.map((c) => c.content));
    }

    for (let j = 0; j < batch.length; j++) {
      await upsertChunk(
        batch[j].content,
        batch[j].sourceId,
        batch[j].metadata,
        embeddings[j]
      );
      upserted++;
    }

    console.log("done");
  }

  console.log(`\n✅ Done. ${upserted} chunks upserted into KnowledgeChunk.\n`);
}

main()
  .catch((err) => { console.error("\nImport failed:", err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
