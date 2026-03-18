// scripts/scrape-major-urls.mjs
import fs from "fs/promises";
import path from "path";
import * as cheerio from "cheerio";

const PAGE_URL = "https://catalog.uic.edu/ucat/degree-programs/degree-minors/";
const OUTPUT_DIR = path.join(process.cwd(), "public", "data", "uic-knowledge");
const JSON_PATH = path.join(OUTPUT_DIR, "major_urls.json");
const CSV_PATH = path.join(OUTPUT_DIR, "major_urls.csv");

function clean(text) {
  return text.replace(/\s+/g, " ").trim();
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function main() {
  const res = await fetch(PAGE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch page: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const rows = $("table tr").toArray();
  const data = [];

  let currentCollege = "";

  for (const row of rows) {
    const $row = $(row);
    const ths = $row.find("th");
    const tds = $row.find("td");

    if (ths.length === 1 && tds.length === 0) {
      currentCollege = clean($(ths[0]).text());
      continue;
    }

    if (tds.length >= 2) {
      const department = clean($(tds[0]).text());
      const degreeCell = $(tds[1]);
      const links = degreeCell.find("a").toArray();

      for (const link of links) {
        const degreeName = clean($(link).text());
        const rawHref = $(link).attr("href") || "";
        const degreeUrl = new URL(rawHref, PAGE_URL).href;

        data.push({
          college: currentCollege,
          department,
          degreeName,
          degreeUrl
        });
      }
    }
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  await fs.writeFile(JSON_PATH, JSON.stringify(data, null, 2), "utf8");

  const csvLines = [
    ["college", "department", "degreeName", "degreeUrl"].join(","),
    ...data.map(item =>
      [
        csvEscape(item.college),
        csvEscape(item.department),
        csvEscape(item.degreeName),
        csvEscape(item.degreeUrl)
      ].join(",")
    )
  ];

  await fs.writeFile(CSV_PATH, csvLines.join("\n"), "utf8");

  console.log(`Saved ${data.length} degree links`);
  console.log(`JSON: ${JSON_PATH}`);
  console.log(`CSV: ${CSV_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});