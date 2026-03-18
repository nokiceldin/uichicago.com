/**
 * ingest-instagram-embeddings.mjs
 *
 * Sparky Ingestion Pipeline — Stage 3: Embedding + DB Storage
 *
 * Reads normalized Instagram posts, generates Voyage AI embeddings,
 * and upserts them into the VectorEntry table via Prisma raw SQL.
 *
 * Input:   public/data/instagram-captions-normalized/all_posts.json
 * Output:  VectorEntry rows in Postgres (pgvector)
 *
 * Run: node scripts/ingest-instagram-embeddings.mjs
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");

// ─── LOAD ENV ─────────────────────────────────────────────────────────────────
const envLocalPath = path.join(ROOT, ".env.local");
const envPath      = path.join(ROOT, ".env");

for (const p of [envLocalPath, envPath]) {
  if (fs.existsSync(p)) {
    const lines = fs.readFileSync(p, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const INPUT_FILE   = path.join(ROOT, "public/data/instagram-captions-normalized/all_posts.json");

const VOYAGE_MODEL  = "voyage-3-large";
const BATCH_SIZE    = 64;          // Voyage AI max per request
const BATCH_DELAY_MS = 300;        // ms between batches — rate limit safety
const MAX_RETRIES   = 3;
const RETRY_DELAY_MS = 1500;       // base delay; doubles on each retry

const SOURCE_TYPE   = "instagram_caption";
const TRUST_LEVEL   = "social";    // matches vectorSourceConfidence() in route.ts

// ─── LOAD DATA ────────────────────────────────────────────────────────────────

function loadData(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file not found: ${filePath}`);
  }

  const raw  = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);

  if (!Array.isArray(data.posts)) {
    throw new Error(`Invalid input: expected data.posts to be an array`);
  }

  return data;
}

// ─── FILTER ───────────────────────────────────────────────────────────────────

function filterPosts(posts) {
  const embeddable = [];
  const skippedQuality = [];

  for (const post of posts) {
    if (post.quality?.passes_embedding === true) {
      embeddable.push(post);
    } else {
      skippedQuality.push(post.id ?? "unknown");
    }
  }

  return { embeddable, skippedQuality };
}

// ─── VOYAGE AI EMBEDDING ──────────────────────────────────────────────────────

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call Voyage AI embeddings endpoint for a batch of texts.
 * Retries up to MAX_RETRIES times with exponential backoff.
 * Returns float32 embedding arrays or throws after all retries exhausted.
 */
async function embedBatch(texts, batchIndex) {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY environment variable is not set");

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://api.voyageai.com/v1/embeddings", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: VOYAGE_MODEL,
          input: texts,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "(no body)");
        throw new Error(`Voyage API ${response.status}: ${body}`);
      }

      const result = await response.json();

      // Validate response shape
      if (!Array.isArray(result.data) || result.data.length !== texts.length) {
        throw new Error(
          `Voyage returned ${result.data?.length ?? 0} embeddings for ${texts.length} inputs`
        );
      }

      return result.data.map(d => d.embedding); // number[][]

    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        console.warn(`  ⚠  Batch ${batchIndex} attempt ${attempt} failed — retrying in ${delay}ms: ${err.message}`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`Batch ${batchIndex} failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

// ─── DATABASE HELPERS ─────────────────────────────────────────────────────────

/**
 * Load .env manually and construct PrismaClient.
 * Node scripts don't get Next.js's automatic .env loading,
 * so DATABASE_URL won't be set unless we do this ourselves.
 */
async function getPrismaClient() {
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const { PrismaPg } = await import("@prisma/adapter-pg");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is missing");

  const pool = new Pool({ connectionString, max: 5 });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

/**
 * Fetch the set of IDs that already exist in VectorEntry for sourceType = instagram_caption.
 * Used for deduplication — we skip posts that are already embedded.
 */
async function fetchExistingIds(prisma) {
  const rows = await prisma.$queryRaw`
  SELECT id FROM "KnowledgeChunk"
  WHERE "sourceType" = ${SOURCE_TYPE}
`;
  return new Set(rows.map(r => r.id));
}

/**
 * Upsert a single VectorEntry row.
 * Uses raw SQL so we can write the pgvector `embedding` column directly
 * (Prisma's type system doesn't support vector columns natively).
 *
 * ON CONFLICT (id) DO UPDATE ensures idempotency on re-runs.
 */
async function upsertEntry(prisma, entry) {
  const {
    id, embedding, text, source, entity_type, metadata,
  } = entry;

  // Serialize embedding as Postgres vector literal: '[0.1,0.2,...]'
  const vectorLiteral = `[${embedding.join(",")}]`;
await prisma.$executeRaw`
  INSERT INTO "KnowledgeChunk" (
    id,
    embedding,
    content,
    "sourceType",
    "entityType",
    "trustLevel",
    metadata,
    "createdAt",
    "updatedAt"
  )
  VALUES (
    ${id},
    ${vectorLiteral}::vector,
    ${text},
    ${SOURCE_TYPE},
    ${entity_type},
    ${TRUST_LEVEL},
    ${JSON.stringify(metadata)}::jsonb,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    embedding   = EXCLUDED.embedding,
    content     = EXCLUDED.content,
    metadata    = EXCLUDED.metadata,
    "updatedAt" = NOW()
`;
}

// ─── BATCH EMBED + UPSERT ─────────────────────────────────────────────────────

/**
 * Process posts in batches:
 * 1. Embed batch via Voyage AI
 * 2. Upsert each result into VectorEntry
 *
 * Returns { inserted, failed } counts.
 */
async function batchEmbed(posts, existingIds, prisma) {
  let inserted = 0;
  let skippedExists = 0;
  let failed = 0;

  // Split into batches
  const batches = [];
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    batches.push(posts.slice(i, i + BATCH_SIZE));
  }

  console.log(`\n  Processing ${batches.length} batches (${BATCH_SIZE} posts each)\n`);

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];

    // Per-post deduplication check
    const toEmbed = batch.filter(post => !existingIds.has(post.id));
    const alreadyExist = batch.length - toEmbed.length;
    skippedExists += alreadyExist;

    if (toEmbed.length === 0) {
      console.log(`  Batch ${batchIdx + 1}/${batches.length} — all ${batch.length} already in DB, skipping`);
      continue;
    }

    const texts = toEmbed.map(p => p.text_for_embedding);

    // Embed
    let embeddings;
    try {
      embeddings = await embedBatch(texts, batchIdx + 1);
    } catch (err) {
      console.error(`  ✗ Batch ${batchIdx + 1} embedding failed — skipping ${toEmbed.length} posts: ${err.message}`);
      failed += toEmbed.length;
      continue;
    }

    // Upsert each post
    for (let i = 0; i < toEmbed.length; i++) {
      const post      = toEmbed[i];
      const embedding = embeddings[i];

      const entry = {
        id:          post.id,
        embedding,
        text:        post.text_for_embedding,
        source:      "instagram",
        entity_type: "instagram_post",
        metadata: {
          account:          post.provenance.account,
          account_name:     post.provenance.account_name,
          published_at:     post.temporal.published_at,
          is_time_sensitive: post.temporal.is_likely_time_sensitive,
          hashtags:         post.hashtags_normalized,
          quality_flags:    post.quality.flags,
          passes_retrieval: post.quality.passes_retrieval,
          post_url:         post.provenance.post_url_original,
          fingerprint:      post.fingerprint_sha256,
        },
      };

      try {
        await upsertEntry(prisma, entry);
        existingIds.add(post.id); // prevent re-insert within same run
        inserted++;
      } catch (err) {
        console.error(`  ✗ Failed to upsert ${post.id}: ${err.message}`);
        failed++;
      }
    }

    const pct = (((batchIdx + 1) / batches.length) * 100).toFixed(0);
    console.log(
      `  Batch ${batchIdx + 1}/${batches.length} [${pct}%]` +
      ` — embedded ${toEmbed.length}` +
      (alreadyExist > 0 ? `, skipped ${alreadyExist} existing` : "")
    );

    // Rate limit safety — pause between batches (skip after last)
    if (batchIdx < batches.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return { inserted, skippedExists, failed };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n═════════════════════════════════════════════════════════");
  console.log("  Sparky — Instagram Embedding Ingestion");
  console.log(`  Model: ${VOYAGE_MODEL} | Batch: ${BATCH_SIZE}`);
  console.log("═════════════════════════════════════════════════════════\n");

  // ── Load ──────────────────────────────────────────────────────────────────
  let data;
  try {
    data = loadData(INPUT_FILE);
  } catch (err) {
    console.error(`❌  ${err.message}`);
    process.exit(1);
  }

  const totalLoaded = data.posts.length;
  console.log(`📥  Loaded ${totalLoaded} posts from all_posts.json`);
  console.log(`    (embeddable: ${data._meta?.embeddable_posts ?? "?"}, retrievable: ${data._meta?.retrievable_posts ?? "?"})`);

  // ── Filter ────────────────────────────────────────────────────────────────
  const { embeddable, skippedQuality } = filterPosts(data.posts);
  console.log(`\n🔍  Quality filter:`);
  console.log(`    passes_embedding: ${embeddable.length}`);
  console.log(`    filtered out:     ${skippedQuality.length}`);

  if (embeddable.length === 0) {
    console.log("\n⚠️  No embeddable posts found. Exiting.");
    process.exit(0);
  }

  // ── Connect DB ────────────────────────────────────────────────────────────
  let prisma;
  try {
    prisma = await getPrismaClient();
    await prisma.$connect();
    console.log(`\n🗄   Database connected`);
  } catch (err) {
    console.error(`❌  Database connection failed: ${err.message}`);
    process.exit(1);
  }

  // ── Fetch existing IDs ────────────────────────────────────────────────────
  let existingIds;
  try {
    existingIds = await fetchExistingIds(prisma);
    console.log(`    Existing instagram_caption rows: ${existingIds.size}`);
  } catch (err) {
    console.error(`❌  Could not query existing IDs: ${err.message}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // ── Embed + Upsert ────────────────────────────────────────────────────────
  const startMs = Date.now();
  let results;

  try {
    results = await batchEmbed(embeddable, existingIds, prisma);
  } finally {
    await prisma.$disconnect();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);

  console.log("\n─────────────────────────────────────────────────────────");
  console.log("  RESULTS");
  console.log("─────────────────────────────────────────────────────────");
  console.log(`  Total loaded:         ${totalLoaded}`);
  console.log(`  Filtered (quality):   ${skippedQuality.length}`);
  console.log(`  Skipped (in DB):      ${results.skippedExists}`);
  console.log(`  Inserted/updated:     ${results.inserted}`);
  console.log(`  Failed:               ${results.failed}`);
  console.log(`  Elapsed:              ${elapsedSec}s`);

  if (results.failed > 0) {
    console.log(`\n⚠️  ${results.failed} posts failed — check errors above.`);
    console.log(`   Re-running the script is safe (upsert is idempotent).`);
  } else {
    console.log(`\n✅  Done.`);
  }

  console.log("═════════════════════════════════════════════════════════\n");

  process.exit(results.failed > 0 ? 1 : 0);
}

main();
