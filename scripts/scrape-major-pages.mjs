// scripts/scrape-major-pages.mjs
import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";
import * as cheerio from "cheerio";

const INPUT_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "uic-knowledge",
  "major_urls.json"
);

const OUTPUT_DIR = path.join(
  process.cwd(),
  "public",
  "data",
  "uic-knowledge",
  "majors"
);

const INDEX_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "uic-knowledge",
  "major_index.json"
);

const REPORT_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "uic-knowledge",
  "major_scrape_report.json"
);

const CONCURRENCY = 4;
const PAGE_TIMEOUT = 45000;

function clean(text = "") {
  return String(text).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function cleanMultiline(text = "") {
  return String(text)
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .split("\n")
    .map(line => clean(line))
    .filter(Boolean)
    .join("\n");
}

function slugify(text = "") {
  return clean(text)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
function isUsableMajorResult(result) {
  if (!result?.ok) return false;

  const degreeName = clean(result.meta?.degreeName || "").toLowerCase();
  const url = clean(result.meta?.degreeUrl || "").toLowerCase();

  const combined = `${degreeName} ${url}`;

  const badPatterns = [
    /\bminor\b/,
    /\bcertificate\b/,
    /\bconcentration\b/,
    /\btrack\b/,
    /\bjoint\b/,
    /\bbs\/ms\b/,
    /\bms\/bs\b/,
    /joint-bs-ms/
  ];

  if (badPatterns.some((re) => re.test(combined))) return false;
  if (result.trust === "weak") return false;
  if (result.warnings.includes("Missing requirement blocks")) return false;

  return true;
}

function unique(arr) {
  return [...new Set(arr)];
}
function safeFilename(meta) {
  const degreePart = slugify(meta.degreeName || "");
  const codePart = slugify(meta.programCode || "");
  const deptPart = slugify(meta.department || "");

  const pieces = [degreePart, codePart, deptPart].filter(Boolean);

  return `${pieces.join("--") || "major"}.json`;
}

function normalizeProgramText(text = "") {
  return clean(text).toLowerCase();
}

function shouldSkipUrlEntry(entry) {
  const degreeName = normalizeProgramText(entry.degreeName || "");
  const url = normalizeProgramText(entry.degreeUrl || "");
  const combined = `${degreeName} ${url}`;

  const excludePatterns = [
    /\bminor\b/,
    /\bcertificate\b/,
    /\bconcentration\b/,
    /\btrack\b/,
    /minor\//,
    /certificate\//,
    /concentration\//
  ];

  return excludePatterns.some((re) => re.test(combined));
}

function isBaseUndergradMajor(entry) {
  const degreeName = normalizeProgramText(entry.degreeName || "");
  const url = normalizeProgramText(entry.degreeUrl || "");
  const dept = normalizeProgramText(entry.department || "");

  const combined = `${degreeName} ${url} ${dept}`;

  const looksLikeUndergradMajor =
    /^(bs|ba|bfa|bba|bsn|bmus|barch|bdes|bacc)\b/.test(degreeName) ||
    /\b(bachelor of)\b/.test(degreeName);

  const excludePatterns = [
    /\bjoint\b/,
    /\bbs\/ms\b/,
    /\bms\/bs\b/,
    /\bminor\b/,
    /\bcertificate\b/,
    /\bconcentration\b/,
    /\btrack\b/,
    /\bgraduate\b/,
    /\bmaster\b/,
    /\bms in\b/,
    /\bma in\b/,
    /\bphd\b/,
    /joint-bs-ms/,
    /minor/,
    /certificate/,
    /concentration/
  ];

  if (!looksLikeUndergradMajor) return false;
  if (excludePatterns.some((re) => re.test(combined))) return false;

  return true;
}

function getText($, el) {
  return clean($(el).text());
}

function extractCatalogYear($) {
  const candidates = [
    clean($("body").text()),
    clean($("title").text()),
    clean($("h1").first().text()),
    clean($("h2").first().text())
  ].join(" ");

  const match = candidates.match(/\b(20\d{2}-20\d{2})\b/);
  return match ? match[1] : null;
}

function extractBreadcrumbs($) {
  const allLinks = $("a").toArray().map(a => clean($(a).text())).filter(Boolean);

  const breadcrumbish = [];
  for (const txt of allLinks) {
    if (
      txt.includes("Home") ||
      txt.includes("Undergraduate Catalog") ||
      txt.includes("Colleges") ||
      txt.includes("Departments") ||
      txt.includes("College of") ||
      txt.includes("School of") ||
      txt.includes("BS in") ||
      txt.includes("BA in") ||
      txt.includes("BFA in") ||
      txt.includes("BMus in") ||
      txt.includes("BArch") ||
      txt.includes("Minor in") ||
      txt.includes("Certificate")
    ) {
      breadcrumbish.push(txt);
    }
  }

  return unique(breadcrumbish).slice(0, 20);
}

function extractProgramCode($) {
  const bodyText = cleanMultiline($("body").text());
  const m = bodyText.match(/Program Codes?:\s*([A-Z0-9]+)/i);
  return m ? clean(m[1]) : null;
}
function extractDegreeTitle($) {
  const titleCandidates = [];

  const breadcrumbLast = $(".breadcrumb li").last().text();
  if (clean(breadcrumbLast)) titleCandidates.push(clean(breadcrumbLast));

  $("h1, h2, h3, .page-title, .title").each((_, el) => {
    const text = clean($(el).text());
    if (text) titleCandidates.push(text);
  });

  $("strong").each((_, el) => {
    const text = clean($(el).text());
    if (text) titleCandidates.push(text);
  });

  const bodyText = cleanMultiline($("body").text());
  const lines = bodyText.split("\n").map(clean).filter(Boolean);

  for (const line of lines) {
    if (
      /^(BS in |BA in |BFA in |BMus in |BArch|BDes|BAcc|Bachelor of |Minor in |Certificate in )/i.test(line)
    ) {
      titleCandidates.push(line);
    }
  }

  const good = titleCandidates.find(text =>
    /^(BS in |BA in |BFA in |BMus in |BArch|BDes|BAcc|Bachelor of )/i.test(text)
  );

  if (good) return good;

  const fallback = titleCandidates.find(text =>
    /^(Minor in |Certificate in )/i.test(text)
  );

  return fallback || null;
}

function extractMetaFromUrlEntry(entry) {
  return {
    college: entry.college || null,
    department: entry.department || null,
    degreeName: entry.degreeName || null,
    degreeUrl: entry.degreeUrl || null
  };
}

function extractSummaryText($) {
  const bodyText = cleanMultiline($("body").text());
  const idx = bodyText.indexOf("Degree Requirements");
  if (idx === -1) return null;

  const after = bodyText.slice(idx);
  const lines = after.split("\n").map(clean).filter(Boolean);

  const out = [];
  let started = false;

  for (const line of lines) {
    if (line === "Degree Requirements") {
      started = true;
      continue;
    }
    if (!started) continue;

    if (
      line === "Course List" ||
      line === "Sample Course Schedule" ||
      line === "Plan of Study Grid"
    ) {
      break;
    }

    out.push(line);

    if (out.length >= 4) break;
  }

  return out.length ? out.join(" ") : null;
}

function extractTotalHours($) {
  const bodyText = cleanMultiline($("body").text());

  const match1 = bodyText.match(/Total Hours\s+(\d+(?:-\d+)?)/i);
  if (match1) return match1[1];

  const match2 = bodyText.match(/\bTotal Hours\b[:\s]+(\d+(?:-\d+)?)/i);
  if (match2) return match2[1];

  return null;
}

function extractRequirementSummary($) {
  const bodyText = cleanMultiline($("body").text());
  const lines = bodyText.split("\n").map(clean).filter(Boolean);

  const start = lines.indexOf("Summary of Requirements");
  if (start === -1) return [];

  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];

    if (line === "University Writing Requirement" && out.length > 0) break;
    if (line === "Sample Course Schedule") break;
    if (line === "Plan of Study Grid") break;

    const m = line.match(/^(.*?)(\d+(?:-\d+)?)$/);
    if (m) {
      const label = clean(m[1]);
      const hours = clean(m[2]);
      if (label && hours) {
        out.push({ label, hours });
      }
    }
  }

  return out;
}

function parseCourseListTable($table, $) {
  const rows = [];
  const trs = $table.find("tr").toArray();

  for (const tr of trs) {
    const cells = $(tr).find("th, td").toArray().map(td => clean($(td).text()));

    if (!cells.length) continue;

    const joined = cells.join(" | ");
    if (
      joined.includes("Code") && joined.includes("Title") && joined.includes("Hours")
    ) {
      continue;
    }

    if (cells.length >= 3) {
      rows.push({
        code: cells[0] || "",
        title: cells[1] || "",
        hours: cells[2] || "",
        raw: cells
      });
    } else if (cells.length === 2) {
      rows.push({
        code: cells[0] || "",
        title: cells[1] || "",
        hours: "",
        raw: cells
      });
    } else {
      rows.push({
        code: "",
        title: cells[0] || "",
        hours: "",
        raw: cells
      });
    }
  }

  return rows;
}

function isLikelyRequirementHeading(text) {
  if (!text) return false;
  if (text === "Degree Requirements") return false;
  if (text === "Sample Course Schedule") return false;
  if (text === "Plan of Study Grid") return false;
  if (text === "Course List") return false;
  if (text === "Summary of Requirements") return false;
  if (text === "Code" || text === "Title" || text === "Hours") return false;

  return (
    /^[A-Z][A-Za-z0-9,&/() .'\-]+$/.test(text) &&
    text.length <= 120
  );
}

function extractRequirementBlocks($) {
  const blocks = [];
  const headings = $("h2, h3, h4, p, strong")
    .toArray()
    .map(el => {
      const text = clean($(el).text());
      return { el, text };
    })
    .filter(x => isLikelyRequirementHeading(x.text));

  const seenNames = new Set();

  for (const { el, text } of headings) {
    if (seenNames.has(text)) continue;

    const $el = $(el);

    const nextTable = $el.nextAll("table").first();
    if (!nextTable.length) continue;

    const courses = parseCourseListTable(nextTable, $);
    if (!courses.length) continue;

    const blockName = text;
    seenNames.add(blockName);

    const block = {
      name: blockName,
      hours: null,
      courses: [],
      rulesText: [],
      notes: []
    };

    for (const course of courses) {
      const titleLower = (course.title || "").toLowerCase();
      const codeUpper = (course.code || "").toUpperCase();

      if (
        codeUpper === "TOTAL HOURS" ||
        course.code === "Total Hours" ||
        titleLower === "total hours"
      ) {
        block.hours = course.hours || course.title || null;
        continue;
      }

      if (
        codeUpper === "REQUIRED COURSES" ||
        codeUpper === "ELECTIVES" ||
        codeUpper === "REQUIREMENTS" ||
        codeUpper === "SUMMARY OF REQUIREMENTS"
      ) {
        if (course.title) block.rulesText.push(course.title);
        if (course.hours) block.rulesText.push(`Hours: ${course.hours}`);
        continue;
      }

      const looksLikeRealCourse =
        /^[A-Z]{2,5}\s?\d{3}[A-Z]?$/.test(codeUpper) ||
        /^ENGL\s160|ENGL\s161|BIOS\s110|MATH\s121|CHEM\s101|PHYS\s131/.test(codeUpper);

      if (looksLikeRealCourse) {
        block.courses.push({
          code: course.code,
          title: course.title,
          hours: course.hours
        });
      } else {
        const combined = clean(
          [course.code, course.title, course.hours].filter(Boolean).join(" ")
        );
        if (combined) block.rulesText.push(combined);
      }
    }

    let sibling = nextTable[0]?.nextSibling || null;
    let noteCount = 0;

    while (sibling && noteCount < 10) {
      const $sib = $(sibling);
      const tag = (sibling.tagName || "").toLowerCase();
      const txt = clean($sib.text());

      if (!txt) {
        sibling = sibling.nextSibling;
        continue;
      }

      if (/^Sample Course Schedule$/i.test(txt)) break;
      if (/^Plan of Study Grid$/i.test(txt)) break;

      if (["h2", "h3", "h4"].includes(tag) && isLikelyRequirementHeading(txt)) {
        break;
      }

      if (txt.length <= 350) {
        block.notes.push(txt);
        noteCount++;
      }

      sibling = sibling.nextSibling;
    }

    block.rulesText = unique(block.rulesText);
    block.notes = unique(block.notes);

    blocks.push(block);
  }

  return blocks;
}

function extractFootnotes($) {
  const bodyText = cleanMultiline($("body").text());
  const lines = bodyText.split("\n").map(clean).filter(Boolean);

  const footnotes = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const marker = lines[i];
    const text = lines[i + 1];

    if (/^[a-z]$/.test(marker) && text && text.length >= 10 && text.length <= 500) {
      footnotes.push({ marker, text });
    }
  }

  return footnotes;
}function extractSampleSchedule($) {
  const result = {
    available: false,
    years: []
  };

  const headings = $("h2, h3, h4").toArray();
  const scheduleHeading = headings.find(el =>
    clean($(el).text()).toLowerCase() === "sample course schedule"
  );

  if (!scheduleHeading) {
    return extractSampleScheduleFromRawText($);
  }

  const scheduleTable = $(scheduleHeading).nextAll("table").first();
  if (!scheduleTable.length) {
    return extractSampleScheduleFromRawText($);
  }

  const rows = scheduleTable.find("tr").toArray();

  let currentYear = null;
  let currentTerm = null;

  for (const row of rows) {
    const cells = $(row).find("th, td").toArray().map(cell => clean($(cell).text()));
    const nonEmpty = cells.filter(Boolean);

    if (!nonEmpty.length) continue;

    const cleanedCells = nonEmpty
      .map(cell => cell.replace(/Hours?/gi, "").trim())
      .filter(Boolean);

    if (!cleanedCells.length) continue;

    const joined = cleanedCells.join(" ").trim();
    const upperJoined = joined.toUpperCase();

    const isYear =
      /^(Freshman Year|Sophomore Year|Junior Year|Senior Year|First Year|Second Year|Third Year|Fourth Year|Fifth Year)$/i.test(joined);

    const isTerm =
      /(FALL SEMESTER|SPRING SEMESTER|SUMMER SEMESTER|SUMMER SESSION|FALL|SPRING|SUMMER)/i.test(joined);

    if (isYear) {
      currentYear = {
        label: joined,
        terms: []
      };
      result.years.push(currentYear);
      currentTerm = null;
      continue;
    }

    if (isTerm) {
      if (!currentYear) continue;
      currentTerm = {
        label: joined.replace(/hours?/gi, "").trim(),
        items: [],
        totalHours: null
      };
      currentYear.terms.push(currentTerm);
      continue;
    }

    if (!currentTerm) continue;

    if (
      cleanedCells.length >= 2 &&
      /^Hours$/i.test(nonEmpty[nonEmpty.length - 2]) &&
      /^\d+(?:-\d+)?$/.test(nonEmpty[nonEmpty.length - 1])
    ) {
      currentTerm.totalHours = nonEmpty[nonEmpty.length - 1];
      continue;
    }

    if (
      cleanedCells.length === 1 &&
      /^(\d+(?:-\d+)?)$/.test(cleanedCells[0])
    ) {
      currentTerm.totalHours = cleanedCells[0];
      continue;
    }

    if (cleanedCells.length >= 3) {
      const maybeCode = cleanedCells[0];
      const maybeHours = cleanedCells[cleanedCells.length - 1];
      const title = cleanedCells.slice(1, -1).join(" ");

      currentTerm.items.push({
        code: /^[A-Z]{2,5}\s?\d{3}[A-Z]?$/.test(maybeCode) ? maybeCode : "",
        title: title || maybeCode,
        hours: /^\d+(?:-\d+)?$/.test(maybeHours) ? maybeHours : null,
        label: [maybeCode, title].filter(Boolean).join(" ").trim()
      });
      continue;
    }

    if (cleanedCells.length === 2) {
      const first = cleanedCells[0];
      const second = cleanedCells[1];

      if (/^\d+(?:-\d+)?$/.test(second)) {
        currentTerm.items.push({
          code: "",
          title: first,
          hours: second,
          label: first
        });
      } else {
        currentTerm.items.push({
          code: /^[A-Z]{2,5}\s?\d{3}[A-Z]?$/.test(first) ? first : "",
          title: second,
          hours: null,
          label: `${first} ${second}`.trim()
        });
      }
      continue;
    }

    if (cleanedCells.length === 1) {
      currentTerm.items.push({
        code: "",
        title: cleanedCells[0],
        hours: null,
        label: cleanedCells[0]
      });
    }
  }

  result.available = result.years.length > 0 && result.years.some(
    year => year.terms.some(term => term.items.length > 0)
  );

  if (!result.available) {
    return extractSampleScheduleFromRawText($);
  }

  return result;
}

function extractSampleScheduleFromRawText($) {
  const result = {
    available: false,
    years: []
  };

  const raw = cleanMultiline($("body").text());
  const startIdx = raw.indexOf("Sample Course Schedule");
  if (startIdx === -1) return result;

  const text = raw.slice(startIdx);
  const lines = text.split("\n").map(clean).filter(Boolean);

  let currentYear = null;
  let currentTerm = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^(Freshman Year|Sophomore Year|Junior Year|Senior Year|First Year|Second Year|Third Year|Fourth Year|Fifth Year)$/i.test(line)) {
      currentYear = { label: line, terms: [] };
      result.years.push(currentYear);
      currentTerm = null;
      continue;
    }

    if (/^(Fall Semester|Spring Semester|Summer Semester|Summer Session)$/i.test(line)) {
      if (!currentYear) continue;
      currentTerm = { label: line, items: [], totalHours: null };
      currentYear.terms.push(currentTerm);
      continue;
    }

    if (!currentTerm) continue;

    if (/^Hours\d+$/i.test(line)) {
      currentTerm.totalHours = line.replace(/^Hours/i, "").trim();
      continue;
    }

    if (/^Hours$/i.test(line) && lines[i + 1] && /^\d+$/.test(lines[i + 1])) {
      currentTerm.totalHours = lines[i + 1];
      i++;
      continue;
    }

    if (/^[A-Z]{2,5}\s?\d{3}[A-Z]?$/.test(line)) {
      const code = line;
      const title = lines[i + 1] || "";
      const hours = lines[i + 2] && /^\d+$/.test(lines[i + 2]) ? lines[i + 2] : null;

      currentTerm.items.push({
        code,
        title,
        hours,
        label: `${code} ${title}`.trim()
      });

      if (hours) i += 2;
      else i += 1;
      continue;
    }

    if (
      !/^(Plan of Study Grid|Total Hours|a[A-Z]?)/i.test(line) &&
      line.length > 2
    ) {
      currentTerm.items.push({
        code: "",
        title: line,
        hours: null,
        label: line
      });
    }
  }

  result.available = result.years.length > 0 && result.years.some(
    year => year.terms.some(term => term.items.length > 0)
  );

  return result;
}

function extractRawText($) {
  return cleanMultiline($("body").text());
}

function scoreParseResult(parsed) {
  let score = 0;

  if (parsed.meta.degreeName) score += 1;
  if (parsed.meta.programCode) score += 1;
  if (parsed.overview.totalHours) score += 1;
  if (parsed.requirementSummary.length) score += 1;
  if (parsed.requirementBlocks.length) score += 2;
  if (parsed.sampleSchedule.available) score += 1;
  if (parsed.footnotes.length) score += 1;
  if (parsed.rawText && parsed.rawText.length > 1000) score += 1;

  if (score >= 7) return "strong";
  if (score >= 4) return "medium";
  return "weak";
}

function buildWarnings(parsed) {
  const warnings = [];

  if (!parsed.meta.degreeName) warnings.push("Missing degree title");
  if (!parsed.meta.programCode) warnings.push("Missing program code");
  if (!parsed.overview.totalHours) warnings.push("Missing total hours");
  if (!parsed.requirementSummary.length) warnings.push("Missing requirement summary");
  if (!parsed.requirementBlocks.length) warnings.push("Missing requirement blocks");
  if (!parsed.sampleSchedule.available) warnings.push("Missing sample schedule");

  return warnings;
}

async function scrapeOne(browser, entry, index) {
  const page = await browser.newPage();

  try {
    await page.goto(entry.degreeUrl, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT
    });

    await page.waitForLoadState("networkidle", { timeout: PAGE_TIMEOUT }).catch(() => {});
    const html = await page.content();
    const $ = cheerio.load(html);

    const urlMeta = extractMetaFromUrlEntry(entry);

    const meta = {
      ...urlMeta,
      degreeName: extractDegreeTitle($) || urlMeta.degreeName,
      programCode: extractProgramCode($),
      catalogYear: extractCatalogYear($),
      scrapedAt: new Date().toISOString(),
      breadcrumbs: extractBreadcrumbs($)
    };

    const parsed = {
      meta,
      overview: {
        summaryText: extractSummaryText($),
        totalHours: extractTotalHours($)
      },
      requirementSummary: extractRequirementSummary($),
      requirementBlocks: extractRequirementBlocks($),
      sampleSchedule: extractSampleSchedule($),
      footnotes: extractFootnotes($),
      rawText: extractRawText($)
    };

    const trust = scoreParseResult(parsed);
    const warnings = buildWarnings(parsed);
    const fileName = safeFilename(meta);
    const filePath = path.join(OUTPUT_DIR, fileName);

    await fs.writeFile(filePath, JSON.stringify(parsed, null, 2), "utf8");

    return {
      ok: true,
      index,
      fileName,
      filePath,
      trust,
      warnings,
      meta
    };
  } catch (error) {
    return {
      ok: false,
      index,
      meta: extractMetaFromUrlEntry(entry),
      error: String(error?.message || error)
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function runPool(items, worker, concurrency) {
  const results = [];
  let nextIndex = 0;

  async function runner() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      const result = await worker(items[current], current);
      results[current] = result;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runner())
  );

  return results;
}

async function main() {
  const raw = await fs.readFile(INPUT_PATH, "utf8");
  const urls = JSON.parse(raw);
  

  if (!Array.isArray(urls) || !urls.length) {
    throw new Error("major_urls.json is empty or invalid");
  }

  const filteredUrls = urls.filter(entry => !shouldSkipUrlEntry(entry));

  if (!filteredUrls.length) {
    throw new Error("No valid base undergraduate majors left after filtering");
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    const results = await runPool(
      filteredUrls,
      (entry, index) => scrapeOne(browser, entry, index),
      CONCURRENCY
    );

    const successes = results.filter(r => r?.ok);
const usableSuccesses = successes.filter(isUsableMajorResult);
      r.trust !== "weak" &&
      !r.warnings.includes("Missing requirement blocks")
    const failures = results.filter(r => r && !r.ok);

    const majorIndex = usableSuccesses.map(r => ({
      degreeName: r.meta.degreeName || null,
      college: r.meta.college || null,
      department: r.meta.department || null,
      programCode: r.meta.programCode || null,
      degreeUrl: r.meta.degreeUrl || null,
      catalogYear: r.meta.catalogYear || null,
      trust: r.trust,
      warnings: r.warnings,
      file: `/data/uic-knowledge/majors/${r.fileName}`
    }));

    const report = {
        usableMajors: usableSuccesses.length,
      scrapedAt: new Date().toISOString(),
      totalUrls: filteredUrls.length,
      successful: successes.length,
      failed: failures.length,
            usableMajors: usableSuccesses.length,
      strongParses: successes.filter(r => r.trust === "strong").length,
      mediumParses: successes.filter(r => r.trust === "medium").length,
      weakParses: successes.filter(r => r.trust === "weak").length,
      failures: failures.map(f => ({
        degreeName: f.meta?.degreeName || null,
        degreeUrl: f.meta?.degreeUrl || null,
        error: f.error
      })),
      warningBreakdown: {
        missingProgramCode: successes.filter(r => r.warnings.includes("Missing program code")).length,
        missingTotalHours: successes.filter(r => r.warnings.includes("Missing total hours")).length,
        missingRequirementSummary: successes.filter(r => r.warnings.includes("Missing requirement summary")).length,
        missingRequirementBlocks: successes.filter(r => r.warnings.includes("Missing requirement blocks")).length,
        missingSampleSchedule: successes.filter(r => r.warnings.includes("Missing sample schedule")).length
      }
    };

    await fs.writeFile(INDEX_PATH, JSON.stringify(majorIndex, null, 2), "utf8");
    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

    console.log(`Done. Scraped ${successes.length}/${filteredUrls.length} pages`);
    console.log(`Index: ${INDEX_PATH}`);
    console.log(`Report: ${REPORT_PATH}`);
    console.log(`Majors folder: ${OUTPUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});