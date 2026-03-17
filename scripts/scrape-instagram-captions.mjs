import { chromium } from "playwright";
import fs from "fs/promises";
import path from "path";

const ACCOUNTS_FILE = "public/data/uic-knowledge/instagram-accounts.json";
const OUTPUT_DIR = "public/data/instagram-captions";
const USER_DATA_DIR = ".playwright-instagram-session";

const MAX_POSTS_PER_ACCOUNT = 80;
const SCROLL_ROUNDS = 12;
const SCROLL_PAUSE_MS = 1800;
const BETWEEN_POSTS_MS = 1200;
const BETWEEN_ACCOUNTS_MS = 2500;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizePostUrl(raw) {
  const m = raw.match(/\/p\/([^/?#]+)\//);
  return m ? `https://www.instagram.com/p/${m[1]}/` : null;
}

function cleanCaption(raw) {
  if (!raw) return "";

  let text = raw.trim();
  text = text.replace(/^[\d,]+\s+likes?,\s*[\d,]+\s+comments?\s*-\s*.*?:\s*/i, "");
  text = text.replace(/^"+|"+$/g, "");
  text = text.replace(/"\.\s*$/, "").trim();

  return text;
}

function extractMetaDescription(html) {
  const match = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"]*)["']/i
  );
  return match ? match[1] : "";
}

function extractPostedAt(html) {
  const match = html.match(
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"]*)["']/i
  );
  return match ? match[1] : null;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readAccounts(file) {
  const raw = await fs.readFile(file, "utf8");
  const json = JSON.parse(raw);

  if (!json.accounts || !Array.isArray(json.accounts)) {
    throw new Error(`Invalid format in ${file}. Expected { "accounts": [...] }`);
  }

  return json.accounts
    .map(acc => ({
      name: acc.name || "",
      handle: (acc.handle || "").replace(/^@/, "").trim(),
      url: acc.url || "",
      category: acc.category || "",
      confirmed: !!acc.confirmed,
    }))
    .filter(acc => acc.handle);
}

async function collectPostUrls(page, username) {
  const profileUrl = `https://www.instagram.com/${username}/`;

  console.log(`\nOpening profile: ${username}`);
  await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(2500);

  for (let i = 0; i < SCROLL_ROUNDS; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(SCROLL_PAUSE_MS);
  }

  const urls = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/p/"]'));
    return anchors.map(a => a.href);
  });

  const normalized = [...new Set(urls.map(normalizePostUrl).filter(Boolean))];
  return normalized.slice(0, MAX_POSTS_PER_ACCOUNT);
}

async function scrapePost(page, account, postUrl) {
  try {
    await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await sleep(1500);

    const html = await page.content();
    const rawCaption = extractMetaDescription(html);
    const publishedAt = extractPostedAt(html);
    const caption = cleanCaption(rawCaption);

    return {
      source: "instagram",
      account: account.handle,
      account_name: account.name,
      category: account.category,
      confirmed: account.confirmed,
      post_url: postUrl,
      caption,
      caption_raw: rawCaption,
      published_at: publishedAt,
    };
  } catch (err) {
    console.log(`Failed post ${postUrl}: ${err.message}`);
    return {
      source: "instagram",
      account: account.handle,
      account_name: account.name,
      category: account.category,
      confirmed: account.confirmed,
      post_url: postUrl,
      caption: "",
      caption_raw: "",
      published_at: null,
      error: err.message,
    };
  }
}

async function saveAccountData(account, data) {
  const outPath = path.join(OUTPUT_DIR, `${account.handle}_captions.json`);
  await fs.writeFile(outPath, JSON.stringify(data, null, 2), "utf8");
  console.log(`Saved ${data.length} posts to ${outPath}`);
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  const accounts = await readAccounts(ACCOUNTS_FILE);
  if (!accounts.length) {
    throw new Error(`No accounts found in ${ACCOUNTS_FILE}`);
  }

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1400, height: 1000 },
  });

  const page = context.pages()[0] || await context.newPage();

  console.log("\nInstagram browser opened.");
  console.log("If you are not logged in, log in manually now.");
  console.log("After login is complete, press Enter here.\n");

  process.stdin.resume();
  await new Promise(resolve => process.stdin.once("data", resolve));

  for (const account of accounts) {
    try {
      const postUrls = await collectPostUrls(page, account.handle);
      console.log(`Found ${postUrls.length} posts for ${account.handle}`);

      const results = [];
      for (let i = 0; i < postUrls.length; i++) {
        const postUrl = postUrls[i];
        console.log(`[${account.handle}] ${i + 1}/${postUrls.length} ${postUrl}`);
        const data = await scrapePost(page, account, postUrl);
        results.push(data);
        await sleep(BETWEEN_POSTS_MS);
      }

      await saveAccountData(account, results);
      await sleep(BETWEEN_ACCOUNTS_MS);
    } catch (err) {
      console.log(`Failed account ${account.handle}: ${err.message}`);
    }
  }

  console.log("\nDone.");
  await context.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});