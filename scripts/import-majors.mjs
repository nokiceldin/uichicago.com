#!/usr/bin/env node
// scripts/import-majors.mjs
// Run: node --env-file=.env scripts/import-majors.mjs
// Scrapes catalog.uic.edu for all major requirements and sample schedules

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { writeFileSync } from "fs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const BASE = "https://catalog.uic.edu";
const DEGREE_LIST = `${BASE}/ucat/degree-programs/degree-minors/`;
const DELAY = 500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#[0-9]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Get all degree program links ────────────────────────────────────────────
async function getDegreeLinks() {
  console.log("📋 Fetching degree program list...");
  const res = await fetch(DEGREE_LIST, { headers: { "User-Agent": "UICSparky/1.0" } });
  const html = await res.text();

  const links = new Set();
  // Match links to college/dept/major pages
  const linkRegex = /href="(\/ucat\/colleges-depts\/[^"]+\/[^"]+\/[^"]+\/)"/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const path = match[1];
    // Skip if it's just a department page (too short) or contains anchor
    if (path.split("/").filter(Boolean).length >= 4 && !path.includes("#")) {
      links.add(BASE + path);
    }
  }

  const result = [...links];
  console.log(`  Found ${result.length} degree program pages`);
  return result;
}

// ─── Parse a major page ───────────────────────────────────────────────────────
function parseMajorPage(html, url) {
  const text = html;

  // Extract major name from h1
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const majorName = h1Match ? stripHtml(h1Match[1]) : "Unknown";

  // Extract college from breadcrumb
  const breadcrumb = html.match(/colleges-depts\/([^/]+)\//);
  const collegeSlug = breadcrumb ? breadcrumb[1] : "unknown";

  // Extract program code
  const codeMatch = html.match(/Program Codes?:?\s*<[^>]*>\s*([A-Z0-9]+)/i) ||
                    html.match(/([0-9]{2}[A-Z]{2}[0-9]+[A-Z]+)/);
  const programCode = codeMatch ? codeMatch[1] : "";

  // ── Extract required courses from course tables ──
  const courses = [];
  // Match table rows with course codes like "CS 111" or "MATH 180"
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(row)) !== null) {
      cells.push(stripHtml(cellMatch[1]).trim());
    }
    if (cells.length >= 2) {
      // Check if first cell looks like a course code
      const codeCheck = cells[0].match(/^([A-Z]{2,8})\s+(\d{1,3}[A-Z]?)$/);
      if (codeCheck) {
        const hours = cells[cells.length - 1].match(/^\d+(-\d+)?$/) ? cells[cells.length - 1] : "";
        const title = cells.slice(1, cells.length - (hours ? 1 : 0)).join(" ").trim();
        courses.push({
          code: cells[0],
          subject: codeCheck[1],
          number: codeCheck[2],
          title: title || "",
          hours: hours || "",
          required: true,
        });
      }
    }
  }

  // ── Extract total hours ──
  const totalMatch = html.match(/Total Hours[\s\S]*?(\d{3})/i);
  const totalHours = totalMatch ? parseInt(totalMatch[1]) : 120;

  // ── Extract sample schedule by semester ──
  const schedule = [];

  // Look for "Freshman Year", "Sophomore Year", etc.
  const yearSections = html.split(/(?=Freshman Year|Sophomore Year|Junior Year|Senior Year)/i);

  for (const section of yearSections.slice(1)) {
    const yearMatch = section.match(/^(Freshman|Sophomore|Junior|Senior) Year/i);
    if (!yearMatch) continue;
    const year = yearMatch[1];

    // Split into semesters
    const semSections = section.split(/(?=Fall Semester|Spring Semester|Summer Session)/i);
    for (const sem of semSections.slice(1)) {
      const semMatch = sem.match(/^(Fall Semester|Spring Semester|Summer Session)/i);
      if (!semMatch) continue;
      const semester = semMatch[1];

      const semCourses = [];
      const semRowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let semRow;
      while ((semRow = semRowRegex.exec(sem)) !== null) {
        const rowText = stripHtml(semRow[1]);
        const courseCode = rowText.match(/([A-Z]{2,8})\s+(\d{1,3}[A-Z]?)/);
        if (courseCode) {
          semCourses.push(`${courseCode[1]} ${courseCode[2]}`);
        }
      }

      if (semCourses.length > 0) {
        // Extract hours for this semester
        const hoursMatch = sem.match(/Hours\s+(\d+)/i);
        schedule.push({
          year,
          semester,
          courses: semCourses,
          total_hours: hoursMatch ? parseInt(hoursMatch[1]) : null,
        });
      }
    }
  }

  // ── Extract requirement categories ──
  const categories = [];
  const h2Regex = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  let h2Match;
  while ((h2Match = h2Regex.exec(html)) !== null) {
    const heading = stripHtml(h2Match[1]).trim();
    if (heading && heading.length > 3 && heading.length < 100 &&
        !heading.includes("Catalog") && !heading.includes("University of Illinois")) {
      categories.push(heading);
    }
  }

  return {
    name: majorName,
    url,
    college: collegeSlug,
    programCode,
    totalHours,
    requiredCourses: courses,
    sampleSchedule: schedule,
    requirementCategories: categories.filter(c =>
      c.toLowerCase().includes("requirement") ||
      c.toLowerCase().includes("core") ||
      c.toLowerCase().includes("elective") ||
      c.toLowerCase().includes("major") ||
      c.toLowerCase().includes("writing")
    ),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🎓 UIC Major Requirements Scraper");
  console.log("Scraping catalog.uic.edu degree program pages\n");

  const links = await getDegreeLinks();
  const majors = [];
  let failed = 0;

  for (let i = 0; i < links.length; i++) {
    const url = links[i];
    const slug = url.split("/").filter(Boolean).pop();
    process.stdout.write(`  [${i+1}/${links.length}] ${slug}... `);

    try {
      const res = await fetch(url, { headers: { "User-Agent": "UICSparky/1.0" } });
      if (!res.ok) { process.stdout.write(`HTTP ${res.status}\n`); failed++; continue; }
      const html = await res.text();
      const major = parseMajorPage(html, url);

      if (major.requiredCourses.length > 0 || major.sampleSchedule.length > 0) {
        majors.push(major);
        process.stdout.write(`✅ ${major.requiredCourses.length} courses, ${major.sampleSchedule.length} semesters\n`);
      } else {
        process.stdout.write(`⚠️  no course data found\n`);
      }
    } catch (err) {
      process.stdout.write(`❌ ${err.message}\n`);
      failed++;
    }

    await sleep(DELAY);
  }

  console.log(`\n✅ Scraped ${majors.length} majors (${failed} failed)`);

  // Save to JSON file
  writeFileSync("./scripts/majors-scraped.json", JSON.stringify(majors, null, 2));
  console.log("💾 Saved to scripts/majors-scraped.json");

  // Also save to uic-knowledge folder for Sparky
  writeFileSync("./public/data/uic-knowledge/major-requirements.json", JSON.stringify({
    total: majors.length,
    scraped_at: new Date().toISOString(),
    majors: majors.map(m => ({
      name: m.name,
      college: m.college,
      url: m.url,
      totalHours: m.totalHours,
      programCode: m.programCode,
      requiredCourses: m.requiredCourses,
      sampleSchedule: m.sampleSchedule,
    }))
  }, null, 2));
  console.log("💾 Saved to public/data/uic-knowledge/major-requirements.json");

  // Summary
  console.log("\n📊 Majors by college:");
  const byCollege = {};
  for (const m of majors) {
    byCollege[m.college] = (byCollege[m.college] || 0) + 1;
  }
  for (const [college, count] of Object.entries(byCollege)) {
    console.log(`  ${college}: ${count}`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async err => {
  console.error("Fatal:", err);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
