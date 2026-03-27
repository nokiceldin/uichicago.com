/**
 * Sparky — Campus Knowledge Seeder
 *
 * Reads every top-level JSON file in public/data/uic-knowledge/,
 * chunks each file by its top-level keys, embeds via Voyage AI,
 * and upserts into the KnowledgeChunk table.
 *
 * Usage:
 *   VOYAGE_API_KEY=... DATABASE_URL=... node scripts/seed-campus-knowledge.mjs
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "public", "data", "uic-knowledge");
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const EMBEDDING_MODEL = "voyage-3-large";
const BATCH_SIZE = 8; // Voyage allows up to 128; keep small to avoid timeouts

const prisma = new PrismaClient({ adapter });

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Recursively flatten a JSON value into readable "key: value" lines. */
function flattenToText(value, prefix = "") {
  if (value === null || value === undefined) return "";

  if (typeof value !== "object") {
    return prefix ? `${prefix}: ${value}` : String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item, i) => flattenToText(item, prefix ? `${prefix}[${i}]` : `[${i}]`))
      .filter(Boolean)
      .join("\n");
  }

  return Object.entries(value)
    .map(([k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "object" && v !== null) {
        return flattenToText(v, key);
      }
      return `${key}: ${v}`;
    })
    .filter(Boolean)
    .join("\n");
}

/** Call Voyage AI embeddings endpoint for a batch of texts (document mode). */
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
    throw new Error(`Voyage embedding request failed: ${errText}`);
  }

  const json = await res.json();
  return json.data.map((d) => d.embedding);
}

/** Upsert a single KnowledgeChunk row (mirrors the pattern in lib/chat/vectors.ts). */
async function upsertChunk(content, sourceType, sourceId, metadata, embedding) {
  const embeddingStr = `[${embedding.join(",")}]`;
  const metadataStr = JSON.stringify(metadata);
  const chunkType = metadata.chunkType ?? null;
  const entityId = metadata.entityId ?? null;
  const entityType = metadata.entityType ?? null;
  const trustLevel = metadata.trustLevel ?? "curated";
  const validUntil = metadata.validUntil ? new Date(metadata.validUntil) : null;

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "KnowledgeChunk" (
      id,
      content,
      "sourceType",
      "sourceId",
      metadata,
      embedding,
      "chunkType",
      "entityId",
      "entityType",
      "trustLevel",
      "validUntil",
      "embeddingUpdatedAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text,
      $1, $2, $3, $4, $5::vector, $6, $7, $8, $9, $10, NOW(), NOW(), NOW()
    )
    ON CONFLICT ("sourceId", "sourceType") DO UPDATE SET
      content = EXCLUDED.content,
      metadata = EXCLUDED.metadata,
      embedding = EXCLUDED.embedding,
      "chunkType" = EXCLUDED."chunkType",
      "entityId" = EXCLUDED."entityId",
      "entityType" = EXCLUDED."entityType",
      "trustLevel" = EXCLUDED."trustLevel",
      "validUntil" = EXCLUDED."validUntil",
      "embeddingUpdatedAt" = NOW(),
      "updatedAt" = NOW()
    `,
    content,
    sourceType,
    sourceId,
    metadataStr,
    embeddingStr,
    chunkType,
    entityId,
    entityType,
    trustLevel,
    validUntil
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY environment variable is not set");
  }

  // Collect only top-level JSON files (skip subdirectories like /majors)
  const files = readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => join(DATA_DIR, e.name));

  console.log(`Found ${files.length} JSON files in ${DATA_DIR}`);

  // Build all chunks across all files before batching embeddings
  const chunks = []; // { content, sourceId, fileBase, sectionKey }

  for (const filePath of files) {
    const fileBase = basename(filePath, ".json");
    let json;
    try {
      json = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch (err) {
      console.warn(`  Skipping ${fileBase}: JSON parse error — ${err.message}`);
      continue;
    }

    // Each top-level key becomes one chunk
    const topLevelKeys = Object.keys(json);
    for (const key of topLevelKeys) {
      const sectionValue = json[key];
      const text = flattenToText(sectionValue, key);
      if (!text.trim()) continue;

      // Prepend file context so the chunk is self-contained
      const content = `[source: ${fileBase}]\n${text}`;
      const sourceId = `campus:${fileBase}:${key}`;

      chunks.push({ content, sourceId, fileBase, sectionKey: key });
    }
  }

  console.log(`Total chunks to embed: ${chunks.length}`);

  // Embed in batches and upsert
  let upserted = 0;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.content);

    process.stdout.write(
      `  Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} (chunks ${i + 1}-${i + batch.length})... `
    );

    const embeddings = await embedTexts(texts);

    for (let j = 0; j < batch.length; j++) {
      const { content, sourceId, fileBase, sectionKey } = batch[j];
      const metadata = {
        chunkType: "campus_section",
        entityType: "campus",
        trustLevel: "curated",
        file: fileBase,
        section: sectionKey,
      };

      await upsertChunk(content, "campus_knowledge", sourceId, metadata, embeddings[j]);
      upserted++;
    }

    console.log("done");
  }

  console.log(`\nSeeded ${upserted} campus knowledge chunks successfully.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
