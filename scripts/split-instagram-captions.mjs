import fs from "fs/promises";
import path from "path";

const INPUT_DIR = "public/data/instagram-captions";
const GOOD_DIR = "public/data/instagram-captions-good";
const FAILED_DIR = "public/data/instagram-captions-failed";
const SUMMARY_DIR = "public/data/instagram-captions-summary";

function hasRealCaption(post) {
  if (!post) return false

  const text1 = typeof post.caption === "string" ? post.caption.trim() : ""
  const text2 = typeof post.caption_raw === "string" ? post.caption_raw.trim() : ""

  const text = text1 || text2

  if (text.length < 10) return false
  if (post.error) return false

  return true
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  await ensureDir(GOOD_DIR);
  await ensureDir(FAILED_DIR);
  await ensureDir(SUMMARY_DIR);

  const files = (await fs.readdir(INPUT_DIR))
    .filter(name => name.endsWith(".json"))
    .sort();

  const accountSummaries = [];
  const allGood = [];
  const allFailed = [];

  for (const file of files) {
    const inputPath = path.join(INPUT_DIR, file);
    const raw = await fs.readFile(inputPath, "utf8");

    let posts;
    try {
      posts = JSON.parse(raw);
    } catch (err) {
      console.error(`Could not parse ${file}: ${err.message}`);
      continue;
    }

    if (!Array.isArray(posts)) {
      console.log(`Skipping ${file}, not an array`);
      continue;
    }

    const good = posts.filter(post => hasRealCaption(post) && !post.error);
    const failed = posts.filter(post => !hasRealCaption(post) || !!post.error);

    const baseName = file.replace(/\.json$/i, "");
    const goodPath = path.join(GOOD_DIR, `${baseName}_good.json`);
    const failedPath = path.join(FAILED_DIR, `${baseName}_failed.json`);

    await fs.writeFile(goodPath, JSON.stringify(good, null, 2), "utf8");
    await fs.writeFile(failedPath, JSON.stringify(failed, null, 2), "utf8");

    allGood.push(...good);
    allFailed.push(...failed);

    const account = posts[0]?.account || baseName.replace(/_captions$/i, "");
    const accountName = posts[0]?.account_name || null;

    accountSummaries.push({
      file,
      account,
      account_name: accountName,
      total_posts: posts.length,
      good_posts: good.length,
      failed_posts: failed.length,
      success_rate: posts.length ? Number(((good.length / posts.length) * 100).toFixed(1)) : 0
    });

    console.log(
      `${file}: total=${posts.length}, good=${good.length}, failed=${failed.length}`
    );
  }

  accountSummaries.sort((a, b) => b.success_rate - a.success_rate);

  await fs.writeFile(
    path.join(SUMMARY_DIR, "all_good_posts.json"),
    JSON.stringify(allGood, null, 2),
    "utf8"
  );

  await fs.writeFile(
    path.join(SUMMARY_DIR, "all_failed_posts.json"),
    JSON.stringify(allFailed, null, 2),
    "utf8"
  );

  await fs.writeFile(
    path.join(SUMMARY_DIR, "account_success_summary.json"),
    JSON.stringify(accountSummaries, null, 2),
    "utf8"
  );

  console.log("\nDone.");
  console.log(`All good posts: ${allGood.length}`);
  console.log(`All failed posts: ${allFailed.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});