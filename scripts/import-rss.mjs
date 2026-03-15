#!/usr/bin/env node
// scripts/import-rss.mjs
// Run: node --env-file=.env scripts/import-rss.mjs
// Cron: 0 * * * * cd /your/project && node --env-file=.env scripts/import-rss.mjs

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import Anthropic from "@anthropic-ai/sdk";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const anthropic = new Anthropic();

// ─── ALL FEEDS ────────────────────────────────────────────────────────────────
const FEEDS = [
  // ── UIC Today categories (all confirmed RSS via /feed/ convention) ──
  { source: "uic-news",           url: "https://today.uic.edu/feed",                                              label: "UIC Today (All)" },
  { source: "uic-campus-news",    url: "https://today.uic.edu/category/category-campus-news/feed",                label: "UIC Campus News" },
  { source: "uic-research",       url: "https://today.uic.edu/category/category-research/feed",                   label: "UIC Research News" },
  { source: "uic-official",       url: "https://today.uic.edu/category/official/feed",                            label: "UIC Official Comms" },
  { source: "uic-announcements",  url: "https://today.uic.edu/category/announcements/feed",                       label: "UIC Announcements" },
  { source: "uic-news-releases",  url: "https://today.uic.edu/news-release/feed",                                 label: "UIC Press Releases" },
  { source: "uic-alumni-news",    url: "https://today.uic.edu/category/category-alumni/feed",                     label: "UIC Alumni News" },

  // ── Student Services ──
  { source: "uic-student-affairs",url: "https://sa.uic.edu/feed",                                                 label: "Student Affairs" },
  { source: "uic-dos",            url: "https://dos.uic.edu/feed",                                                label: "Dean of Students" },
  { source: "uic-commuter",       url: "https://csrc.uic.edu/feed",                                               label: "Commuter Student Resources" },
  { source: "uic-life",           url: "https://life.uic.edu/feed",                                               label: "UIC Life" },

  // ── Academic units ──
  { source: "uic-library",        url: "https://library.uic.edu/about/library-news/feed",                         label: "UIC Library News" },
  { source: "uic-grad",           url: "https://grad.uic.edu/feed",                                               label: "Graduate College" },
  { source: "uic-honors",         url: "https://honors.uic.edu/feed",                                             label: "Honors College" },
  { source: "uic-ois",            url: "https://ois.uic.edu/about/ois-news/feed",                                 label: "International Students (OIS)" },
  { source: "uic-engineering",    url: "https://engineering.uic.edu/about/coe-news/feed",                         label: "Engineering News" },
  { source: "uic-ahs",            url: "https://ahs.uic.edu/inside-ahs/inside-ahs-news/feed",                     label: "Applied Health Sciences" },

  // ── Community ──
  { source: "uic-reddit",         url: "https://www.reddit.com/r/uichicago.json?sort=new&limit=50",               label: "r/uichicago (Reddit)" },
  { source: "uic-reddit-top",     url: "https://www.reddit.com/r/uichicago.json?sort=top&t=week&limit=25",        label: "r/uichicago Top Posts" },

  // ── UIC Flames Athletics — all sports ──
  { source: "uic-flames",         url: "https://uicflames.com/rss.aspx",                                          label: "UIC Flames (All)" },
  { source: "uic-mbball",         url: "https://uicflames.com/rss.aspx?path=mbball",                              label: "Men's Basketball" },
  { source: "uic-wbball",         url: "https://uicflames.com/rss.aspx?path=wbball",                              label: "Women's Basketball" },
  { source: "uic-baseball",       url: "https://uicflames.com/rss.aspx?path=baseball",                            label: "Baseball" },
  { source: "uic-softball",       url: "https://uicflames.com/rss.aspx?path=softball",                            label: "Softball" },
  { source: "uic-msoc",           url: "https://uicflames.com/rss.aspx?path=msoc",                                label: "Men's Soccer" },
  { source: "uic-wsoc",           url: "https://uicflames.com/rss.aspx?path=wsoc",                                label: "Women's Soccer" },
  { source: "uic-mvball",         url: "https://uicflames.com/rss.aspx?path=wvball",                              label: "Volleyball" },
  { source: "uic-mten",           url: "https://uicflames.com/rss.aspx?path=mten",                                label: "Men's Tennis" },
  { source: "uic-wten",           url: "https://uicflames.com/rss.aspx?path=wten",                                label: "Women's Tennis" },
  { source: "uic-swim",           url: "https://uicflames.com/rss.aspx?path=swim",                                label: "Swimming & Diving" },
  { source: "uic-mtrack",         url: "https://uicflames.com/rss.aspx?path=mtrack",                              label: "Men's Track & Field" },
  { source: "uic-wtrack",         url: "https://uicflames.com/rss.aspx?path=wtrack",                              label: "Women's Track & Field" },
  { source: "uic-golf",           url: "https://uicflames.com/rss.aspx?path=mgolf",                               label: "Golf" },
  { source: "uic-mxc",            url: "https://uicflames.com/rss.aspx?path=mxc",                                 label: "Men's Cross Country" },
  { source: "uic-wxc",            url: "https://uicflames.com/rss.aspx?path=wxc",                                 label: "Women's Cross Country" },
];

// ─── SCHEDULE FEEDS (upcoming games + results) ────────────────────────────────
// These use Sidearm's hidden endpoints — tries JSON first, falls back to XML
const SCHEDULE_FEEDS = [
  { source: "sched-mbball",   url: "https://uicflames.com/sports/mens-basketball/schedule/2025-26",    label: "MBB Schedule",       sport: "mens-basketball" },
  { source: "sched-wbball",   url: "https://uicflames.com/sports/womens-basketball/schedule/2025-26",  label: "WBB Schedule",       sport: "womens-basketball" },
  { source: "sched-baseball", url: "https://uicflames.com/sports/baseball/schedule/2026",              label: "Baseball Schedule",  sport: "baseball" },
  { source: "sched-softball", url: "https://uicflames.com/sports/softball/schedule/2026",              label: "Softball Schedule",  sport: "softball" },
  { source: "sched-msoc",     url: "https://uicflames.com/sports/mens-soccer/schedule/2025",           label: "M Soccer Schedule",  sport: "mens-soccer" },
  { source: "sched-wsoc",     url: "https://uicflames.com/sports/womens-soccer/schedule/2025",         label: "W Soccer Schedule",  sport: "womens-soccer" },
  { source: "sched-mvball",   url: "https://uicflames.com/sports/womens-volleyball/schedule/2025-26",  label: "Volleyball Schedule", sport: "womens-volleyball" },
  { source: "sched-mten",     url: "https://uicflames.com/sports/mens-tennis/schedule/2025-26",        label: "M Tennis Schedule",  sport: "mens-tennis" },
  { source: "sched-wten",     url: "https://uicflames.com/sports/womens-tennis/schedule/2025-26",      label: "W Tennis Schedule",  sport: "womens-tennis" },
  { source: "sched-swim",     url: "https://uicflames.com/sports/womens-swimming-and-diving/schedule/2025-26", label: "Swimming Schedule", sport: "swimming" },
  { source: "sched-mtrack",   url: "https://uicflames.com/sports/mens-track-and-field/schedule/2025-26", label: "M Track Schedule", sport: "mens-track" },
  { source: "sched-wtrack",   url: "https://uicflames.com/sports/womens-track-and-field/schedule/2025-26", label: "W Track Schedule", sport: "womens-track" },
  { source: "sched-mxc",      url: "https://uicflames.com/sports/mens-cross-country/schedule/2025",    label: "M XC Schedule",      sport: "mens-cross-country" },
  { source: "sched-wxc",      url: "https://uicflames.com/sports/womens-cross-country/schedule/2025",  label: "W XC Schedule",      sport: "womens-cross-country" },
  { source: "sched-golf",     url: "https://uicflames.com/sports/womens-golf/schedule/2025-26",        label: "Golf Schedule",      sport: "womens-golf" },
];

// ─── PARSERS ──────────────────────────────────────────────────────────────────

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? (m[1] || m[2] || "").trim() : "";
    };
    const title = get("title");
    const link = get("link");
    const guid = get("guid") || link;
    const pubDate = get("pubDate");
    const description = get("description");
    const content = get("content:encoded") || description;
    if (!title || !guid) continue;
    items.push({
      guid,
      title,
      url: link,
      publishedAt: pubDate ? new Date(pubDate) : new Date(),
      rawContent: content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000),
    });
  }
  return items;
}

function parseReddit(json) {
  return (json?.data?.children || [])
    .map(({ data: d }) => ({
      guid: `reddit-${d.id}`,
      title: d.title,
      url: `https://reddit.com${d.permalink}`,
      publishedAt: new Date(d.created_utc * 1000),
      rawContent: (d.selftext || d.title).slice(0, 3000),
    }))
    .filter(i => i.title);
}

// ─── College Scorecard API (free, no key needed for basic data) ────────────────
async function importCollegeScorecard() {
  console.log("\n📊 Fetching College Scorecard data for UIC...");
  try {
    const url = "https://api.data.gov/ed/collegescorecard/v1/schools.json?school.name=University+of+Illinois+Chicago&fields=school.name,latest.student.size,latest.cost.tuition.in_state,latest.cost.tuition.out_of_state,latest.aid.median_debt.completers.overall,latest.completion.completion_rate_4yr_150nt,latest.earnings.10_yrs_after_entry.median,latest.admissions.admission_rate.overall,latest.student.demographics.race_ethnicity.white,latest.student.demographics.race_ethnicity.black,latest.student.demographics.race_ethnicity.hispanic,latest.student.demographics.race_ethnicity.asian&api_key=DEMO_KEY";
    const res = await fetch(url, { headers: { "User-Agent": "UICRatings/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const school = json?.results?.[0];
    if (!school) throw new Error("No results");

    const summary = `UIC College Scorecard data (official US Dept of Education):
- Total enrollment: ${school["latest.student.size"]?.toLocaleString() ?? "N/A"} students
- In-state tuition: $${school["latest.cost.tuition.in_state"]?.toLocaleString() ?? "N/A"}
- Out-of-state tuition: $${school["latest.cost.tuition.out_of_state"]?.toLocaleString() ?? "N/A"}
- Median debt at graduation: $${school["latest.aid.median_debt.completers.overall"]?.toLocaleString() ?? "N/A"}
- 4-year graduation rate: ${school["latest.completion.completion_rate_4yr_150nt"] ? (school["latest.completion.completion_rate_4yr_150nt"] * 100).toFixed(1) + "%" : "N/A"}
- Median earnings 10 years after entry: $${school["latest.earnings.10_yrs_after_entry.median"]?.toLocaleString() ?? "N/A"}
- Admission rate: ${school["latest.admissions.admission_rate.overall"] ? (school["latest.admissions.admission_rate.overall"] * 100).toFixed(1) + "%" : "N/A"}`;

    const guid = "college-scorecard-uic-2025";
    const exists = await prisma.newsItem.findUnique({ where: { guid } });
    if (exists) {
      // Update if exists since this data refreshes annually
      await prisma.newsItem.update({
        where: { guid },
        data: { rawContent: summary, aiSummary: summary, publishedAt: new Date() },
      });
      console.log("  🔄 Updated College Scorecard data");
    } else {
      await prisma.newsItem.create({
        data: {
          guid,
          source: "college-scorecard",
          title: "UIC Official Institutional Data (College Scorecard)",
          url: "https://collegescorecard.ed.gov/school/?145600",
          publishedAt: new Date(),
          rawContent: summary,
          aiSummary: summary,
          category: "institutional-data",
        },
      });
      console.log("  ✅ Imported College Scorecard data");
    }
  } catch (err) {
    console.error(`  ❌ College Scorecard failed: ${err.message}`);
  }
}

// ─── Summarizer ───────────────────────────────────────────────────────────────

async function summarizeArticle(title, content, source) {
  try {
    const isAthletics = source.includes("flame") || source.includes("ball") ||
      source.includes("baseball") || source.includes("soccer") ||
      source.includes("softball") || source.includes("swim") ||
      source.includes("track") || source.includes("tennis") ||
      source.includes("golf") || source.includes("cross");
    const isReddit = source.includes("reddit");

    let prompt;
    if (isAthletics) {
      prompt = `Extract key facts from this UIC athletics update in 2-3 sentences. Include: scores, wins/losses, player names, records, upcoming games.\n\nTitle: ${title}\nContent: ${content}`;
    } else if (isReddit) {
      prompt = `Summarize this UIC student Reddit post in 1-2 sentences. Focus on what the student is asking or discussing that other students might find useful.\n\nTitle: ${title}\nContent: ${content}`;
    } else {
      prompt = `Extract key facts from this UIC news item in 2-3 sentences. Include: dates, names, deadlines, announcements relevant to students.\n\nTitle: ${title}\nContent: ${content}`;
    }

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    return response.content[0]?.text?.trim() ?? null;
  } catch {
    return null;
  }
}

function detectCategory(title, content, source) {
  const text = (title + " " + content).toLowerCase();
  if (/basketball|hoops/.test(text)) return "basketball";
  if (/baseball/.test(text)) return "baseball";
  if (/softball/.test(text)) return "softball";
  if (/soccer/.test(text)) return "soccer";
  if (/volleyball/.test(text)) return "volleyball";
  if (/swimming|diving/.test(text)) return "swimming";
  if (/tennis/.test(text)) return "tennis";
  if (/track|cross country|golf/.test(text)) return "athletics";
  if (/scholarship|financial aid|aspire|fafsa|tuition|aid/.test(text)) return "financial-aid";
  if (/registration|enrollment|add.drop|deadline|banner/.test(text)) return "registration";
  if (/housing|dorm|residence/.test(text)) return "housing";
  if (/dining|food|meal plan/.test(text)) return "dining";
  if (/research|study|grant|faculty|professor/.test(text)) return "research";
  if (/event|ceremony|graduation|commencement|workshop/.test(text)) return "event";
  if (/health|counseling|wellness|medical/.test(text)) return "health";
  if (/international|visa|immigration|ois/.test(text)) return "international";
  if (/library/.test(text)) return "library";
  if (source.includes("reddit")) return "student-discussion";
  if (source.includes("flame") || source.includes("ball")) return "athletics";
  return "general";
}

// ─── Feed importer ────────────────────────────────────────────────────────────

async function importFeed(feed) {
  console.log(`\n📡 Fetching ${feed.label}...`);
  let items;
  try {
    const isReddit = feed.source.includes("reddit");
    const res = await fetch(feed.url, {
      headers: { "User-Agent": "UICRatings/1.0 (educational project)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (isReddit) {
      const json = await res.json();
      items = parseReddit(json);
    } else {
      const xml = await res.text();
      items = parseRSS(xml);
    }
  } catch (err) {
    console.error(`  ❌ Failed: ${err.message}`);
    return { fetched: 0, imported: 0, skipped: 0 };
  }

  console.log(`  📄 Found ${items.length} items`);
  let imported = 0, skipped = 0;

  for (const item of items) {
    const exists = await prisma.newsItem.findUnique({ where: { guid: item.guid } });
    if (exists) { skipped++; continue; }

    const aiSummary = await summarizeArticle(item.title, item.rawContent, feed.source);
    const category = detectCategory(item.title, item.rawContent, feed.source);

    await prisma.newsItem.create({
      data: {
        guid: item.guid,
        source: feed.source,
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        rawContent: item.rawContent,
        aiSummary,
        category,
      },
    });

    console.log(`  ✅ ${item.title.slice(0, 70)}`);
    imported++;
    if (imported < items.length) await new Promise(r => setTimeout(r, 250));
  }

  console.log(`  → ${imported} new, ${skipped} already existed`);
  return { fetched: items.length, imported, skipped };
}

// ─── Schedule scraper ────────────────────────────────────────────────────────
// Tries Sidearm hidden JSON endpoint, falls back to HTML scrape

function parseScheduleHTML(html, sport, source) {
  // Extract game info from plain text after stripping tags
  const text = html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const items = [];

  // Look for date + opponent patterns in the cleaned text
  const chunks = text.split(/(?=Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/).slice(0, 40);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i].slice(0, 200);
    const dateMatch = chunk.match(/(\w+ \d+,?\s*\d{4})/);
    const timeMatch = chunk.match(/(\d+:\d+\s*[AP]M)/i);
    const resultMatch = chunk.match(/\b([WL])\s+(\d+-\d+)/);
    if (!dateMatch) continue;
    const date = dateMatch[1];
    const time = timeMatch ? timeMatch[1] : "TBD";
    const result = resultMatch ? resultMatch[1] + " " + resultMatch[2] : "Upcoming";
    const guid = ("schedule-" + source + "-" + date).replace(/\s+/g, "-").toLowerCase().slice(0, 100);
    items.push({
      guid,
      title: "UIC " + sport.replace(/-/g, " ") + " " + result + " — " + date + " " + time,
      url: "https://uicflames.com/sports/" + sport + "/schedule",
      publishedAt: new Date(),
      rawContent: "UIC " + sport.replace(/-/g, " ") + " game on " + date + " at " + time + ". Result: " + result,
    });
  }
  return items.slice(0, 30);
}


async function importSchedules() {
  console.log("\n📅 Importing athletics schedules...");
  let totalImported = 0;

  for (const feed of SCHEDULE_FEEDS) {
    try {
      // Try Sidearm hidden JSON endpoint first
      const jsonUrl = feed.url.replace("/schedule", "/schedule?format=json");
      let items = [];

      try {
        const res = await fetch(jsonUrl, { headers: { "User-Agent": "UICRatings/1.0" } });
        if (res.ok) {
          const json = await res.json();
          // Sidearm JSON structure varies — try common patterns
          const games = json?.games || json?.schedule || json?.data || [];
          if (Array.isArray(games) && games.length > 0) {
            items = games.slice(0, 30).map((g, i) => ({
              guid: `schedule-${feed.source}-${g.date || i}-${(g.opponent_name || "tbd").slice(0, 20)}`.replace(/\s+/g, "-").toLowerCase(),
              title: `UIC ${feed.sport.replace(/-/g, " ")}: ${g.result || "vs"} ${g.opponent_name || "TBD"} — ${g.date || "TBD"}`,
              url: feed.url,
              publishedAt: g.date ? new Date(g.date) : new Date(),
              rawContent: `Game: UIC ${g.home_away || ""} vs ${g.opponent_name || "TBD"} on ${g.date || "TBD"} at ${g.time || "TBD"}. Result: ${g.result || "Upcoming"}. Location: ${g.location || "TBD"}.`,
            }));
          }
        }
      } catch { /* fall through to HTML */ }

      // Fall back to HTML scrape
      if (items.length === 0) {
        const res = await fetch(feed.url, { headers: { "User-Agent": "UICRatings/1.0" } });
        if (res.ok) {
          const html = await res.text();
          items = parseScheduleHTML(html, feed.sport, feed.source);
        }
      }

      if (items.length === 0) {
        console.log(`  ⚠️  ${feed.label}: no games found`);
        continue;
      }

      // Store as a single consolidated record per sport (update each run)
      const guid = `schedule-consolidated-${feed.source}-2025-26`;
      const summary = items.map(i => i.rawContent).join(" | ").slice(0, 4000);
      const existing = await prisma.newsItem.findUnique({ where: { guid } });

      if (existing) {
        await prisma.newsItem.update({
          where: { guid },
          data: { rawContent: summary, aiSummary: summary, publishedAt: new Date() },
        });
      } else {
        await prisma.newsItem.create({
          data: {
            guid,
            source: feed.source,
            title: `UIC ${feed.sport.replace(/-/g, " ")} 2025-26 Schedule & Results`,
            url: feed.url,
            publishedAt: new Date(),
            rawContent: summary,
            aiSummary: summary,
            category: "schedule",
          },
        });
        totalImported++;
      }

      console.log(`  ✅ ${feed.label}: ${items.length} games`);
    } catch (err) {
      console.error(`  ❌ ${feed.label}: ${err.message}`);
    }
  }

  console.log(`  → ${totalImported} new schedule records`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔄 UIC RSS Import starting:", new Date().toISOString());
  let totalImported = 0;

  for (const feed of FEEDS) {
    const result = await importFeed(feed);
    totalImported += result.imported;
  }

  // Import athletics schedules
  await importSchedules();

  // Pull College Scorecard institutional data
  await importCollegeScorecard();

  console.log(`\n✅ Done. Total new items imported: ${totalImported}`);
  console.log(`📊 Sources covered: ${FEEDS.length} RSS feeds + College Scorecard API`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
