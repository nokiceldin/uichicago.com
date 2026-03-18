/**
 * normalize-instagram-captions.mjs
 *
 * Sparky Ingestion Pipeline — Stage 2: Normalization
 *
 * Transforms raw Instagram posts into canonical, auditable,
 * trust-aware records suitable for embedding and retrieval.
 *
 * Input:   public/data/instagram-captions-good/<account>_captions.json
 * Output:  public/data/instagram-captions-normalized/all_posts.json
 *          public/data/instagram-captions-normalized/rejected_posts.json
 *
 * Run: node scripts/normalize-instagram-captions.mjs
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");

const INPUT_DIR      = path.join(ROOT, "public/data/instagram-captions-good");
const OUTPUT_DIR     = path.join(ROOT, "public/data/instagram-captions-normalized");
const OUTPUT_FILE    = path.join(OUTPUT_DIR, "all_posts.json");
const REJECTED_FILE  = path.join(OUTPUT_DIR, "rejected_posts.json");

// ─── THRESHOLDS ───────────────────────────────────────────────────────────────

// Hard minimum to be stored at all
const MIN_LENGTH_STORAGE   = 8;
// Minimum to be embedded (retrieval-quality)
const MIN_LENGTH_EMBEDDING = 25;
// Minimum to be surfaced in retrieval results
const MIN_LENGTH_RETRIEVAL = 60;

// ─── TIME-SENSITIVE SIGNAL PATTERNS ──────────────────────────────────────────

const TIME_SENSITIVE_PATTERNS = [
  /\btoday\b/i,
  /\btomorrow\b/i,
  /\bthis (week|weekend|month|semester|year)\b/i,
  /\bdeadline\b/i,
  /\bapply by\b/i,
  /\bregister (by|now|today)\b/i,
  /\blast (day|chance|call)\b/i,
  /\blimited (spots?|seats?|space)\b/i,
  /\bevent\b/i,
  /\bcoming (up|soon)\b/i,
  /\bjoin us\b/i,
  /\bdon't miss\b/i,
  /\bfree (food|admission|entry)\b/i,
  /\bthis (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}\b/i,
];

// ─── SPAM / LOW-QUALITY PATTERN FLAGS ────────────────────────────────────────

// Maps flag name → detection pattern
const FLAG_DETECTORS = {
  empty:          (t) => !t || t.trim().length === 0,
  too_short:      (t) => t.trim().length < MIN_LENGTH_STORAGE,
  only_hashtags:  (t) => /^(\s*#[a-zA-Z0-9_]+\s*)+$/.test(t.trim()),
  only_emoji:     (t) => /^[\s\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]+$/u.test(t.trim()),
  cta_heavy:      (t) => {
    const ctaCount = (t.match(/\b(link in bio|swipe up|click|tap|follow|like|subscribe|dm us|message us|visit our|sign up|register now)\b/gi) ?? []).length;
    return ctaCount >= 2 || /^(link in bio|swipe (left|right|up)|tap (the link|to see|for more))\.?$/i.test(t.trim());
  },
  low_context:    (t) => {
    const wordCount = t.replace(/#[a-zA-Z0-9_]+/g, "").trim().split(/\s+/).filter(w => w.length > 2).length;
    return wordCount < 5;
  },
  spam_pattern:   (t) => /^(🔥+|❤️+|👏+|💯+)\s*$/.test(t.trim()),
  html_residue:   (t) => /&[a-z]+;|&#\d+;/i.test(t),
  truncated:      (t) => /…$|\.\.\.$/.test(t.trim()) && t.trim().length < 80,
};

// ─── HTML ENTITY DECODING ─────────────────────────────────────────────────────

function decodeHtmlEntities(text) {
  return text
    .replace(/&quot;/g,  '"')
    .replace(/&#39;/g,   "'")
    .replace(/&apos;/g,  "'")
    .replace(/&amp;/g,   "&")
    .replace(/&lt;/g,    "<")
    .replace(/&gt;/g,    ">")
    .replace(/&nbsp;/g,  " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

// ─── CAPTION SOURCE RESOLUTION ───────────────────────────────────────────────

/**
 * caption_raw from scraper contains a metadata prefix:
 * "14 likes, 0 comments – account January 26, 2016: <actual caption>"
 * Strip it and return just the caption body.
 */
function stripCaptionRawPrefix(raw) {
  const match = raw.match(/^\d+\s+likes.*?\d{4}:\s*(.+)$/s);
  return match ? match[1].trim() : raw.trim();
}

/**
 * Prefer `caption` (clean from scraper).
 * Fall back to stripped `caption_raw` if caption is empty.
 */
function resolveCaptionSource(post) {
  const caption    = (post.caption    ?? "").trim();
  const captionRaw = (post.caption_raw ?? "").trim();

  if (caption.length > 0) return caption;
  if (captionRaw.length > 0) return stripCaptionRawPrefix(captionRaw);
  return "";
}

// ─── TEXT CLEANING ────────────────────────────────────────────────────────────

/**
 * Collapse runs of 3+ identical emoji down to 1.
 * Keeps tone without drowning semantic content.
 */
function reduceEmojiRuns(text) {
  return text.replace(/([\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}])\1{2,}/gu, "$1");
}

/**
 * Normalize a raw caption string into a clean, storage-ready form.
 *
 * Preserves paragraph structure (double newlines → single blank line).
 * Does NOT fully flatten — line breaks carry meaning in Instagram captions.
 */
function cleanCaption(raw) {
  if (!raw || typeof raw !== "string") return "";

  let text = raw;

  // 1. Decode HTML entities
  text = decodeHtmlEntities(text);

  // 2. Normalize CRLF and other exotic line-ending variants to \n
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 3. Collapse 3+ consecutive newlines into a paragraph break (2 newlines)
  text = text.replace(/\n{3,}/g, "\n\n");

  // 4. Normalize tabs and non-breaking spaces to regular space
  text = text.replace(/[\t\u00A0\u2028\u2029]/g, " ");

  // 5. Reduce emoji runs
  text = reduceEmojiRuns(text);

  // 6. Collapse repeated spaces (within a line only — don't touch newlines)
  text = text.replace(/[ ]{2,}/g, " ");

  // 7. Remove zero-width and invisible characters
  text = text.replace(/[\u200B-\u200F\uFEFF\u00AD]/g, "");

  // 8. Trim leading/trailing whitespace
  text = text.trim();

  return text;
}

// ─── HASHTAG EXTRACTION ───────────────────────────────────────────────────────

function extractHashtagsRaw(text) {
  if (!text) return [];
  const matches = text.match(/#([a-zA-Z0-9_]+)/g) ?? [];
  return [...new Set(matches.map(t => t.slice(1)))]; // deduplicated, original casing
}

/**
 * Convert camelCase / PascalCase hashtag to spaced words.
 * "#UICAdmissions" → "uic admissions"
 * "#GoFlames"      → "go flames"
 */
function normalizeHashtag(tag) {
  return tag
    .replace(/([a-z])([A-Z])/g, "$1 $2")   // camelCase split
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // ACRONYMWord split
    .replace(/_/g, " ")                     // snake_case → spaces
    .toLowerCase()
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── ID GENERATION ────────────────────────────────────────────────────────────

/**
 * Generate a stable post ID.
 * Primary: last URL segment (e.g. instagram.com/p/CxK8f3 → "ig_account_CxK8f3")
 * Fallback: SHA-256 hash of account + url + published_at + caption prefix
 *
 * Returns { id, strategy }
 */
function generatePostId(post, captionClean) {
  const account = (post.account ?? "unknown").replace(/[^a-zA-Z0-9_]/g, "");

  if (post.post_url) {
    const urlId = post.post_url
      .replace(/\/$/, "")
      .split("/")
      .filter(Boolean)
      .pop() ?? "";

    const safeId = urlId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
    if (safeId.length >= 4) {
      return { id: `ig_${account}_${safeId}`, strategy: "url" };
    }
  }

  const fingerprint = [
    account,
    post.post_url   ?? "",
    post.published_at ?? "",
    captionClean.slice(0, 60),
  ].join("|");

  const hash = crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 10);
  return { id: `ig_${account}_${hash}`, strategy: "hash" };
}

// ─── FINGERPRINT ─────────────────────────────────────────────────────────────

/**
 * Content-addressable fingerprint for deduplication and auditing.
 * Stable across re-runs as long as source data doesn't change.
 */
function buildFingerprint(post, captionClean) {
  const input = [
    post.account   ?? "",
    post.post_url  ?? "",
    post.published_at ?? "",
    captionClean,
  ].join("|");

  return crypto.createHash("sha256").update(input).digest("hex");
}

// ─── URL CANONICALIZATION ─────────────────────────────────────────────────────

/**
 * Normalize a URL for deduplication:
 * - lowercase the host
 * - strip query params and fragments
 * - strip trailing slash
 */
function canonicalizeUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    const canonical = `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname}`.replace(/\/$/, "");
    return canonical;
  } catch {
    // Not a valid URL — return trimmed original
    return rawUrl.trim().toLowerCase().replace(/\/$/, "");
  }
}

// ─── QUALITY ASSESSMENT ───────────────────────────────────────────────────────

/**
 * Compute structured quality object.
 *
 * passes_storage:   worth keeping in the DB at all
 * passes_embedding: worth generating a vector embedding
 * passes_retrieval: worth surfacing in Sparky search results
 */
function assessQuality(captionClean) {
  const flags = [];

  for (const [flagName, detector] of Object.entries(FLAG_DETECTORS)) {
    if (detector(captionClean)) flags.push(flagName);
  }

  const length = captionClean.length;

  const passes_storage   = length >= MIN_LENGTH_STORAGE
    && !flags.includes("empty")
    && !flags.includes("too_short")
    && !flags.includes("only_emoji")
    && !flags.includes("html_residue");

  const passes_embedding = passes_storage
    && length >= MIN_LENGTH_EMBEDDING
    && !flags.includes("only_hashtags")
    && !flags.includes("spam_pattern");

  const passes_retrieval = passes_embedding
    && length >= MIN_LENGTH_RETRIEVAL
    && !flags.includes("low_context")
    && !flags.includes("cta_heavy");

  return { passes_storage, passes_embedding, passes_retrieval, length, flags };
}

// ─── TEMPORAL SIGNALS ─────────────────────────────────────────────────────────

function assessTemporal(post, captionClean) {
  const is_likely_time_sensitive = TIME_SENSITIVE_PATTERNS.some(p => p.test(captionClean));

  return {
    published_at: post.published_at ?? null,
    is_likely_time_sensitive,
  };
}

// ─── EMBEDDING TEXT ───────────────────────────────────────────────────────────

/**
 * Build retrieval-optimized embedding text.
 *
 * Design principles:
 * - Caption body is primary signal — leads the text
 * - Context (account/org) is secondary — added only if it adds meaning
 * - Hashtags as plain semantic words — not #tags
 * - No boilerplate-heavy templates that pollute every embedding
 */
function buildTextForEmbedding(post, captionClean, hashtagsNormalized) {
  const parts = [];

  // 1. Main caption body — strip hashtags, normalize whitespace
  const captionBody = captionClean
    .replace(/#[a-zA-Z0-9_]+/g, "")     // remove inline hashtags
    .replace(/[ ]{2,}/g, " ")           // collapse spaces left by removal
    .replace(/\n{3,}/g, "\n\n")         // keep paragraph breaks, collapse excess
    .trim();

  if (captionBody.length >= MIN_LENGTH_EMBEDDING) {
    parts.push(captionBody);
  }

  // 2. Short context line — account name adds signal for named-entity retrieval
  const accountName = post.account_name ?? post.account ?? null;
  if (accountName) {
    parts.push(`Account: ${accountName}.`);
  }

  // 3. Hashtag topics — only if they add semantic content beyond the caption
  if (hashtagsNormalized.length > 0) {
    // Filter out generic noise tags
    const meaningfulTags = hashtagsNormalized.filter(t =>
      t.length > 3 &&
      !["uic", "uicchicago", "repost", "tbt", "fbf"].includes(t)
    );
    if (meaningfulTags.length > 0) {
      parts.push(`Topics: ${meaningfulTags.slice(0, 8).join(", ")}.`);
    }
  }

  return parts.join("\n");
}

// ─── CORE NORMALIZER ─────────────────────────────────────────────────────────

/**
 * Transform a single raw post into a normalized record.
 * Returns { record, rejected: false } or { rejected: true, rejectedEntry }
 */
function normalizePost(raw, sourceFile, normalizedAt) {
  const captionSource = resolveCaptionSource(raw);
  const captionClean  = cleanCaption(captionSource);
  const quality       = assessQuality(captionClean);

  // Hard reject: not worth storing at all
  if (!quality.passes_storage) {
    return {
      rejected: true,
      rejectedEntry: {
        raw,
        caption_clean: captionClean || null,
        rejection_reason: quality.flags[0] ?? "quality_fail",
        quality_flags: quality.flags,
        source_file: sourceFile,
        normalized_at: normalizedAt,
      },
    };
  }

  const hashtagsRaw        = extractHashtagsRaw(captionSource);
  const hashtagsNormalized = [...new Set(hashtagsRaw.map(normalizeHashtag))];
  const { id, strategy }   = generatePostId(raw, captionClean);
  const fingerprint        = buildFingerprint(raw, captionClean);
  const textForEmbedding   = buildTextForEmbedding(raw, captionClean, hashtagsNormalized);
  const temporal           = assessTemporal(raw, captionClean);
  const canonicalUrl       = canonicalizeUrl(raw.post_url ?? null);

  const record = {
    id,
    fingerprint_sha256: fingerprint,

    // ── Core content ──────────────────────────────────────────────────────
    caption_raw:   captionSource,   // preserved original (decoded from scraper field)
    caption_clean: captionClean,    // normalized, paragraph-preserving

    // ── Structured metadata ───────────────────────────────────────────────
    hashtags_raw:        hashtagsRaw,
    hashtags_normalized: hashtagsNormalized,
    text_for_embedding:  textForEmbedding,

    // ── Quality tier ──────────────────────────────────────────────────────
    quality,

    // ── Temporal signals ──────────────────────────────────────────────────
    temporal,

    // ── Provenance ────────────────────────────────────────────────────────
    provenance: {
      source:             "instagram",
      source_file:        sourceFile,
      account:            raw.account     ?? null,
      account_name:       raw.account_name ?? raw.account ?? null,
      category:           raw.category    ?? "unverified",
      confirmed:          raw.confirmed   ?? false,
      post_url_original:  raw.post_url    ?? null,
      post_url_canonical: canonicalUrl,
      scraped_at:         raw.published_at ?? null,  // best proxy we have
      normalized_at:      normalizedAt,
      id_strategy:        strategy,
    },
  };

  return { rejected: false, record };
}

// ─── DEDUPLICATION ────────────────────────────────────────────────────────────

/**
 * Deduplicate by canonical URL first, then by fingerprint.
 * First occurrence wins — earlier files in the directory sort take precedence.
 * Returns { unique, dupes } where dupes is an array of removed records.
 */
function deduplicate(records) {
  const seenUrls         = new Map(); // canonicalUrl → id
  const seenFingerprints = new Map(); // fingerprint  → id
  const unique = [];
  const dupes  = [];

  for (const record of records) {
    const url         = record.provenance.post_url_canonical;
    const fingerprint = record.fingerprint_sha256;

    if (url && seenUrls.has(url)) {
      dupes.push({ id: record.id, duplicate_of: seenUrls.get(url), reason: "duplicate_url" });
      continue;
    }
    if (seenFingerprints.has(fingerprint)) {
      dupes.push({ id: record.id, duplicate_of: seenFingerprints.get(fingerprint), reason: "duplicate_fingerprint" });
      continue;
    }

    if (url) seenUrls.set(url, record.id);
    seenFingerprints.set(fingerprint, record.id);
    unique.push(record);
  }

  return { unique, dupes };
}

// ─── FILE I/O ─────────────────────────────────────────────────────────────────

function readJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`  ⚠  Could not parse ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function loadAllInputFiles(inputDir) {
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory not found: ${inputDir}`);
  }

  const files = fs.readdirSync(inputDir)
    .filter(f => f.endsWith(".json"))
    .sort(); // deterministic ordering

  if (files.length === 0) {
    throw new Error(`No JSON files found in: ${inputDir}`);
  }

  console.log(`📂  Found ${files.length} input files\n`);

  const entries = []; // { raw, sourceFile }

  for (const file of files) {
    const filePath = path.join(inputDir, file);
    const data     = readJsonFile(filePath);
    if (!data) continue;

    const posts = Array.isArray(data) ? data : [data];
    for (const post of posts) {
      entries.push({ raw: post, sourceFile: file });
    }
  }

  return entries;
}

// ─── STATS REPORTING ─────────────────────────────────────────────────────────

function printStats(records, rejected, dupes) {
  const embeddable = records.filter(r => r.quality.passes_embedding).length;
  const retrievable = records.filter(r => r.quality.passes_retrieval).length;
  const timeSensitive = records.filter(r => r.temporal.is_likely_time_sensitive).length;

  console.log("─────────────────────────────────────────────────────");
  console.log("  PIPELINE RESULTS");
  console.log("─────────────────────────────────────────────────────");
  console.log(`  Stored (passes_storage):    ${records.length}`);
  console.log(`  Embeddable (passes_embedding): ${embeddable}`);
  console.log(`  Retrievable (passes_retrieval): ${retrievable}`);
  console.log(`  Time-sensitive posts:       ${timeSensitive}`);
  console.log(`  Rejected (not stored):      ${rejected.length}`);
  console.log(`  Duplicates removed:         ${dupes.length}`);

  if (rejected.length > 0) {
    const reasonCounts = {};
    for (const r of rejected) {
      reasonCounts[r.rejection_reason] = (reasonCounts[r.rejection_reason] ?? 0) + 1;
    }
    console.log("\n  Rejection breakdown:");
    for (const [reason, count] of Object.entries(reasonCounts)) {
      console.log(`    · ${reason}: ${count}`);
    }
  }

  // Top accounts
  const accountCounts = {};
  for (const r of records) {
    const acc = r.provenance.account ?? "unknown";
    accountCounts[acc] = (accountCounts[acc] ?? 0) + 1;
  }
  const top = Object.entries(accountCounts).sort(([, a], [, b]) => b - a).slice(0, 8);
  console.log("\n  Top accounts by post count:");
  for (const [acc, count] of top) {
    console.log(`    @${acc}: ${count}`);
  }

  // Sample record
  const sample = records.find(r => r.quality.passes_retrieval);
  if (sample) {
    console.log("\n  Sample record (first retrieval-quality post):");
    console.log(`    id:            ${sample.id}`);
    console.log(`    account:       @${sample.provenance.account}`);
    console.log(`    flags:         [${sample.quality.flags.join(", ") || "none"}]`);
    console.log(`    time_sensitive: ${sample.temporal.is_likely_time_sensitive}`);
    console.log("    text_for_embedding:");
    sample.text_for_embedding.split("\n").forEach(line => {
      console.log(`      ${line}`);
    });
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n═════════════════════════════════════════════════════");
  console.log("  Sparky — Instagram Normalization Pipeline");
  console.log("═════════════════════════════════════════════════════\n");

  const normalizedAt = new Date().toISOString();

  // ── Load ──────────────────────────────────────────────────────────────────
  let entries;
  try {
    entries = loadAllInputFiles(INPUT_DIR);
  } catch (err) {
    console.error(`❌  ${err.message}`);
    process.exit(1);
  }

  console.log(`📥  Loaded ${entries.length} raw posts\n`);

  // ── Normalize ─────────────────────────────────────────────────────────────
  const normalized = [];
  const rejected   = [];

  for (const { raw, sourceFile } of entries) {
    const result = normalizePost(raw, sourceFile, normalizedAt);

    if (result.rejected) {
      rejected.push(result.rejectedEntry);
    } else {
      normalized.push(result.record);
    }
  }

  // ── Deduplicate ───────────────────────────────────────────────────────────
  const { unique, dupes } = deduplicate(normalized);

  // ── Write outputs ─────────────────────────────────────────────────────────
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Main output
  writeJsonFile(OUTPUT_FILE, {
    _meta: {
      generated_at:        normalizedAt,
      total_posts:         unique.length,
      embeddable_posts:    unique.filter(r => r.quality.passes_embedding).length,
      retrievable_posts:   unique.filter(r => r.quality.passes_retrieval).length,
      rejected_posts:      rejected.length,
      duplicates_removed:  dupes.length,
      source_dir:          INPUT_DIR,
      pipeline_stage:      "normalized",
      schema_version:      "2.0",
    },
    posts: unique,
  });

  // Rejected posts — full audit trail, nothing silently discarded
  writeJsonFile(REJECTED_FILE, {
    _meta: {
      generated_at:   normalizedAt,
      total_rejected: rejected.length,
      pipeline_stage: "normalized",
    },
    rejected_posts: rejected,
  });

  console.log(`💾  all_posts.json    → ${unique.length} records`);
  console.log(`💾  rejected_posts.json → ${rejected.length} records\n`);

  // ── Stats ─────────────────────────────────────────────────────────────────
  printStats(unique, rejected, dupes);

  console.log("\n═════════════════════════════════════════════════════");
  console.log("  Done. Next: run the Voyage AI embedding ingestion.");
  console.log("═════════════════════════════════════════════════════\n");
}

main();
