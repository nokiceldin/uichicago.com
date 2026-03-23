import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// Protect with a secret so only your cron service can call this
const CRON_SECRET = process.env.CRON_SECRET;

const FEEDS = [
  { source: "uic-news",     url: "https://today.uic.edu/feed",                         label: "UIC Today" },
  { source: "uic-events",   url: "https://events.uic.edu/feed",                        label: "UIC Events" },
  { source: "uic-reddit",   url: "https://www.reddit.com/r/uichicago.json?sort=new",   label: "r/uichicago" },
  { source: "uic-flames",   url: "https://uicflames.com/rss.aspx",                     label: "UIC Flames" },
  { source: "uic-mbball",   url: "https://uicflames.com/rss.aspx?path=mbball",         label: "Men's Basketball" },
  { source: "uic-wbball",   url: "https://uicflames.com/rss.aspx?path=wbball",         label: "Women's Basketball" },
  { source: "uic-baseball", url: "https://uicflames.com/rss.aspx?path=baseball",       label: "Baseball" },
  { source: "uic-softball", url: "https://uicflames.com/rss.aspx?path=softball",       label: "Softball" },
  { source: "uic-msoc",     url: "https://uicflames.com/rss.aspx?path=msoc",           label: "Men's Soccer" },
  { source: "uic-wsoc",     url: "https://uicflames.com/rss.aspx?path=wsoc",           label: "Women's Soccer" },
  { source: "uic-mvball",   url: "https://uicflames.com/rss.aspx?path=wvball",         label: "Volleyball" },
  { source: "uic-swim",     url: "https://uicflames.com/rss.aspx?path=swim",           label: "Swimming & Diving" },
  { source: "uic-track",    url: "https://uicflames.com/rss.aspx?path=mtrack",         label: "Track & Field" },
  { source: "uic-golf",     url: "https://uicflames.com/rss.aspx?path=mgolf",          label: "Golf" },
  { source: "uic-cross",    url: "https://uicflames.com/rss.aspx?path=mxc",            label: "Cross Country" },
];

function parseRSS(xml: string) {
  const items: { guid: string; title: string; url: string; publishedAt: Date; rawContent: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag: string) => {
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

async function summarizeArticle(title: string, content: string, source: string): Promise<string | null> {
  try {
    const isAthletics = source.includes("flames") || source.includes("basketball");
    const prompt = isAthletics
      ? `Extract key facts from this UIC athletics update in 2-3 sentences. Include scores, wins/losses, player names, records.\n\nTitle: ${title}\nContent: ${content}`
      : `Extract key facts from this UIC news item in 2-3 sentences. Include dates, names, announcements, deadlines.\n\nTitle: ${title}\nContent: ${content}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    return (response.content[0] as any)?.text?.trim() ?? null;
  } catch {
    return null;
  }
}

function detectCategory(title: string, content: string, source: string): string {
  const text = (title + " " + content).toLowerCase();
  if (/basketball|hoops/.test(text)) return "basketball";
  if (/baseball|softball/.test(text)) return "baseball";
  if (/soccer/.test(text)) return "soccer";
  if (/volleyball/.test(text)) return "volleyball";
  if (/scholarship|financial aid|aspire|fafsa/.test(text)) return "financial-aid";
  if (/registration|enrollment|deadline/.test(text)) return "registration";
  if (/research|grant|faculty/.test(text)) return "research";
  if (/event|graduation|commencement/.test(text)) return "event";
  if (source.includes("flames") || source.includes("basketball")) return "athletics";
  return "general";
}

export async function GET(req: Request) {
  // Verify secret
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") || req.headers.get("x-cron-secret");
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let totalImported = 0;
  const results: Record<string, number> = {};

  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "UICRatings/1.0" },
        next: { revalidate: 0 },
      });
      if (!res.ok) { results[feed.source] = 0; continue; }

      const xml = await res.text();
      const items = parseRSS(xml);
      let imported = 0;

      for (const item of items) {
        const exists = await prisma.newsItem.findUnique({ where: { guid: item.guid } });
        if (exists) continue;

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

        imported++;
        await new Promise(r => setTimeout(r, 200));
      }

      results[feed.source] = imported;
      totalImported += imported;
    } catch (err) {
      console.error(`RSS import failed for ${feed.source}:`, err);
      results[feed.source] = -1;
    }
  }

  return NextResponse.json({
    ok: true,
    imported: totalImported,
    breakdown: results,
    timestamp: new Date().toISOString(),
  });
}