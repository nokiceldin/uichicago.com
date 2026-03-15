import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/app/lib/prisma";

const client = new Anthropic();

// Anthropic's embedding model — 1024 dimensions
const EMBEDDING_MODEL = "voyage-3";

async function callVoyage(input: string | string[], inputType: string): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input, input_type: inputType }),
  });
  const json = await res.json() as any;
  return json.data.map((d: any) => d.embedding);
}

export async function embedText(text: string): Promise<number[]> {
  const results = await callVoyage(text, "query");
  return results[0];
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  return callVoyage(texts, "document");
}

// Search for the most relevant knowledge chunks for a given query
export async function vectorSearch(
  query: string,
  limit = 8,
  sourceTypes?: string[]
): Promise<{ content: string; sourceType: string; metadata: any; similarity: number }[]> {
  try {
    const queryEmbedding = await embedText(query);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    const typeFilter = sourceTypes && sourceTypes.length > 0
      ? `AND "sourceType" = ANY(ARRAY[${sourceTypes.map(t => `'${t}'`).join(",")}])`
      : "";

    const results = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id,
        content,
        "sourceType",
        metadata,
        1 - (embedding <=> $1::vector) as similarity
      FROM "KnowledgeChunk"
      WHERE embedding IS NOT NULL
      ${typeFilter}
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `, embeddingStr, limit);

    return results.map(r => ({
      content: r.content,
      sourceType: r.sourceType,
      metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata,
      similarity: parseFloat(r.similarity),
    }));
  } catch (err) {
    console.error("Vector search failed:", err);
    return [];
  }
}

// Store a knowledge chunk with its embedding
export async function upsertChunk(
  content: string,
  sourceType: string,
  sourceId: string | null,
  metadata: Record<string, any>,
  embedding: number[]
): Promise<void> {
  const embeddingStr = `[${embedding.join(",")}]`;
  const metadataStr = JSON.stringify(metadata);

  // Use raw SQL to handle the vector type
  await prisma.$executeRawUnsafe(`
    INSERT INTO "KnowledgeChunk" (id, content, "sourceType", "sourceId", metadata, embedding, "embeddingUpdatedAt", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::vector, NOW(), NOW(), NOW())
    ON CONFLICT ("sourceId", "sourceType") DO UPDATE SET
      content = EXCLUDED.content,
      metadata = EXCLUDED.metadata,
      embedding = EXCLUDED.embedding,
      "embeddingUpdatedAt" = NOW(),
      "updatedAt" = NOW()
  `, content, sourceType, sourceId ?? "", metadataStr, embeddingStr);
}