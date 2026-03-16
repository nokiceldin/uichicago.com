import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/app/lib/prisma";

const client = new Anthropic();

// Anthropic's embedding model — 1024 dimensions
const EMBEDDING_MODEL = "voyage-3-large";

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

export async function rerankChunks(
  query: string,
  chunks: any[],
  topK = 8
): Promise<any[]> {
  if (chunks.length <= topK) return chunks;

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: `You are a retrieval ranker for a university AI assistant. Your job is to select the most useful chunks for answering a student's question.

Query: "${query}"

For each chunk below, classify it and return structured JSON.

Chunks:
${chunks.slice(0, 25).map((c, i) => `[${i}] ${c.content.slice(0, 250)}`).join("\n\n")}

Return ONLY a JSON array like this:
[
  {"index": 0, "relevance": "direct_answer", "entity_match": "exact", "use": true},
  {"index": 1, "relevance": "strong_support", "entity_match": "partial", "use": true},
  {"index": 2, "relevance": "irrelevant", "entity_match": "none", "use": false}
]

relevance options: direct_answer | strong_support | weak_support | background | irrelevant
entity_match options: exact | partial | none
use: true if this chunk should be included in the final answer, false if not

Rules:
- Mark as direct_answer only if it directly answers the question
- Prioritize exact entity matches (specific course code, professor name)
- Deprioritize broad background chunks when specific data exists
- Remove near-duplicates (keep only the best version)
- Keep at most 2 chunks from the same source facet
- Return JSON only, no explanation`
      }]
    });

    const text = (response.content[0] as any)?.text ?? "[]";
    const clean = text.replace(/```json|```/g, "").trim();
    const rankings: { index: number; relevance: string; entity_match: string; use: boolean }[] = JSON.parse(clean);

    // Score by relevance tier
    const relevanceScore: Record<string, number> = {
      direct_answer: 4,
      strong_support: 3,
      weak_support: 2,
      background: 1,
      irrelevant: 0,
    };
    const entityScore: Record<string, number> = {
      exact: 2,
      partial: 1,
      none: 0,
    };

    return rankings
      .filter(r => r.use)
      .sort((a, b) => {
        const scoreA = (relevanceScore[a.relevance] ?? 0) * 3 + (entityScore[a.entity_match] ?? 0);
        const scoreB = (relevanceScore[b.relevance] ?? 0) * 3 + (entityScore[b.entity_match] ?? 0);
        return scoreB - scoreA;
      })
      .slice(0, topK)
      .map(r => chunks[r.index])
      .filter(Boolean);
  } catch {
    // Fallback to original scoring
    return chunks
      .sort((a, b) => (b.relevanceScore * b.sourceConfidence) - (a.relevanceScore * a.sourceConfidence))
      .slice(0, topK);
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