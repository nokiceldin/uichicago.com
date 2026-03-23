/**
 * scripts/scrape-degree-plans.mjs
 *
 * Scrapes every major from major_urls.json, extracts:
 *   - required courses with credit hours
 *   - elective groups and rules
 *   - sample course schedule (semester by semester)
 *   - total hours
 *
 * Writes output to: public/data/uic-knowledge/major-requirements.json
 *
 * Run:
 *   node scripts/scrape-degree-plans.mjs
 *   node scripts/scrape-degree-plans.mjs --dry-run     # print first 3, don't write
 *   node scripts/scrape-degree-plans.mjs --major="Computer Science"
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const URLS_FILE   = path.join(ROOT, "public/data/uic-knowledge/major_urls.json");
const OUTPUT_DIR  = path.join(ROOT, "public/data/uic-knowledge/majors");
// Legacy single-file output for backwards compatibility with route.ts
const OUTPUT_FILE = path.join(ROOT, "public/data/uic-knowledge/major-requirements.json");

const DELAY_MS    = 800;   // polite crawl delay between requests
const TIMEOUT_MS  = 15000;

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const DRY_RUN  = args.includes("--dry-run");
const ONLY_MISSING = args.includes("--only-missing");
const MAJOR_FILTER = args.find(a => a.startsWith("--major="))?.split("=")[1]?.toLowerCase() ?? null;

// ─── FETCH ────────────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "UIC-Sparky-Scraper/1.0 (academic assistant bot)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

// ─── PARSE HELPERS ────────────────────────────────────────────────────────────

/**
 * Extract text content from simple HTML — strip all tags.
 */
function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Decode HTML entities.
 */
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8203;/g, "")
    .replace(/&[a-z]+;/g, " ")
    .replace(/&#\d+;/g, " ")
    .trim();
}

/**
 * Parse all course list tables (required courses, technical electives, etc.)
 * Returns array of { code, title, hours, required, group }
 */
function parseCourseListTables(html) {
  const courses = [];

  // Find all table sections with course rows
  // Course rows look like: <tr><td>CS 111</td><td>Program Design I</td><td>3</td></tr>
  // or with links: <td><a href="...">CS 111</a></td>

  // Split into course list sections first
  const sectionRegex = /<h[23][^>]*>(.*?)<\/h[23]>[\s\S]*?(?=<h[23]|$)/gi;
  const tableRowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  // Extract course-looking rows from entire HTML
  let rowMatch;
  const rowRe = new RegExp(tableRowRegex.source, "gi");
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];
    const cells = [];
    let cellMatch;
    const cellRe = new RegExp(cellRegex.source, "gi");
    while ((cellMatch = cellRe.exec(row)) !== null) {
      cells.push(decodeEntities(stripTags(cellMatch[1])).trim());
    }

    if (cells.length < 2) continue;

    // Check if first cell looks like a course code: "CS 111", "MATH 180", "KN 100" etc.
    const codeCandidate = cells[0].replace(/\s+/g, " ").trim();
    if (!/^[A-Z]{2,5}\s+\d{3}[A-Z]?$/.test(codeCandidate)) continue;

    const title = cells[1] || "";
    if (!title || title.length < 3) continue;

    // Hours: last numeric cell
    let hours = null;
    for (let i = cells.length - 1; i >= 2; i--) {
      const h = cells[i].replace(/[^0-9.]/g, "");
      if (h && !isNaN(parseFloat(h))) {
        hours = parseFloat(h);
        break;
      }
    }

    courses.push({
      code:     codeCandidate,
      subject:  codeCandidate.split(" ")[0],
      number:   codeCandidate.split(" ")[1] ?? "",
      title:    title.replace(/\s+/g, " ").trim(),
      hours:    hours,
      required: true, // default; refined below
    });
  }

  // Deduplicate by code
  const seen = new Set();
  return courses.filter(c => {
    if (seen.has(c.code)) return false;
    seen.add(c.code);
    return true;
  });
}

/**
 * Parse the Summary of Requirements table to get category totals.
 * Returns { categoryName: hours } 
 */
function parseSummaryTable(html) {
  const summary = {};
  // Find "Summary of Requirements" section
  const summaryMatch = html.match(/Summary of Requirements[\s\S]*?Total Hours[\s\S]*?(\d+)/i);
  if (!summaryMatch) return summary;

  const sectionEnd = html.indexOf("Total Hours", html.indexOf("Summary of Requirements"));
  if (sectionEnd === -1) return summary;

  const section = html.slice(html.indexOf("Summary of Requirements"), sectionEnd + 200);
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(section)) !== null) {
    const cells = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      cells.push(decodeEntities(stripTags(cellMatch[1])).trim());
    }
    if (cells.length >= 2) {
      const label = cells[0];
      const hoursStr = cells[cells.length - 1].replace(/[^0-9\-]/g, "");
      if (label && hoursStr) summary[label] = hoursStr;
    }
  }
  return summary;
}

/**
 * Parse Total Hours from the page.
 */
function parseTotalHours(html) {
  // Look for "Total Hours  128" pattern in summary table
  const match = html.match(/Total Hours\s*<\/[^>]+>\s*<[^>]+>\s*(\d+)/i)
    ?? html.match(/Total Hours[\s\S]{0,50}?(\d{3})/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

/**
 * Parse elective group rules and populate their course options.
 * Returns array of { label, credits, options: [{code, title}] }
 *
 * Strategy: find every <span class="courselistcomment"> in the raw HTML.
 * For each one that matches a "Select X" rule, collect the <tr> rows that
 * immediately follow (until the next courselistcomment or </table>) and
 * extract course codes + titles from those rows.
 */
function parseElectiveGroups(html) {
  const groups = [];

  // Single-match patterns to test each courselistcomment text against
  const selectPatterns = [
    /Select\s+(\d+(?:-\d+)?)\s+hours?\s+(?:of\s+)?(?:Free\s+)?Electives?/i,
    /Select\s+(\w+)\s+of\s+the\s+following[,\s]+only\s+one\s+of\s+which\s+may\s+be\s+outside\s+the\s+(\w+)\s+rubric/i,
    /Select\s+(\d+(?:-\d+)?)\s+hours?\s+from\s+(?:among\s+)?the\s+following/i,
  ];

  // Collect all courselistcomment spans with their positions in the raw HTML
  const commentRe = /<span[^>]*class="[^"]*courselistcomment[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  const comments = [];
  let cm;
  while ((cm = commentRe.exec(html)) !== null) {
    comments.push({
      pos:  cm.index,
      end:  cm.index + cm[0].length,
      text: decodeEntities(stripTags(cm[1])).replace(/\s+/g, " ").trim(),
    });
  }

  for (let i = 0; i < comments.length; i++) {
    const { end: spanEnd, text } = comments[i];

    // Does this comment match one of our selection rules?
    let matched = null;
    for (const pat of selectPatterns) {
      const r = text.match(pat);
      if (r) { matched = r; break; }
    }
    if (!matched) continue;

    const creditStr = matched[1] ?? "";
    const credits = creditStr.includes("-")
      ? parseInt(creditStr.split("-")[1], 10)
      : isNaN(parseInt(creditStr, 10))
        ? wordToNum(creditStr)
        : parseInt(creditStr, 10);

    // Slice the HTML from after this comment to the earlier of:
    //   - the next courselistcomment span
    //   - the closing </table> tag
    const nextCommentPos = comments[i + 1]?.pos ?? html.length;
    const tableEnd = html.indexOf("</table>", spanEnd);
    const sliceEnd = Math.min(
      nextCommentPos,
      tableEnd !== -1 ? tableEnd : html.length,
    );
    const slice = html.slice(spanEnd, sliceEnd);

    // Extract course options from <tr> rows in this slice
    const options = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRe.exec(slice)) !== null) {
      const rowHtml = rowMatch[1];
      if (rowHtml.includes("courselistcomment")) continue; // another rule row

      const cells = [];
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
        cells.push(decodeEntities(stripTags(cellMatch[1])).replace(/\s+/g, " ").trim());
      }
      if (cells.length < 2) continue;

      // Strip "or " prefix present in orclass rows
      const cleanCode = cells[0].replace(/^or\s+/i, "").replace(/\s+/g, " ").trim();
      if (!/^[A-Z]{2,5}\s+\d{3}[A-Z]?$/.test(cleanCode)) continue;

      const title = cells[1]?.replace(/\s+/g, " ").trim() ?? "";
      if (title.length < 2) continue;

      options.push({ code: cleanCode, title });
    }

    groups.push({ label: text.slice(0, 120), credits, options });
  }

  return groups;
}

function wordToNum(word) {
  const map = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  return map[word?.toLowerCase()] ?? null;
}

/**
 * Parse Sample Course Schedule.
 * Returns array of { year, semester, total_hours, courses: [{code, title, hours, isElective, electiveType}] }
 */
function parseSampleSchedule(html) {
  const schedule = [];

  // Match all known headings UIC uses for sample schedules across colleges
  const scheduleStart = html.search(
    /Sample Course Schedule|Sample Plan of Study|Recommended Plan of Study|Plan of Study Grid|BSN Sample Curriculum|Sample Curriculum|Degree Plan|Four.Year Plan/i
  );
  if (scheduleStart === -1) return schedule;

  const scheduleHtml = html.slice(scheduleStart);

  // Split by year/semester headers
  // Patterns: "Freshman Year", "Sophomore Year", "Junior Year", "Senior Year"
  // or "First Semester", "Second Semester", "Fall Semester", "Spring Semester"

  const yearLabels = ["Freshman", "Sophomore", "Junior", "Senior", "First Year", "Second Year", "Third Year", "Fourth Year"];
  const semesterLabels = ["First Semester", "Second Semester", "Fall Semester", "Spring Semester"];

  let currentYear = null;
  let currentSemester = null;
  let currentCourses = [];
  let currentHours = null;

  // Parse row by row
  // Normalize: convert <th> row content to look like <td> so our row parser catches it
  // The catalog uses <th> for year/semester headers like "Freshman Year", "First Semester"
  const normalizedHtml = scheduleHtml.replace(/<th([^>]*)>([\s\S]*?)<\/th>/gi, '<td$1>$2</td>');

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRe.exec(normalizedHtml)) !== null) {
    const rowHtml = rowMatch[1];
    const rowText = decodeEntities(stripTags(rowHtml)).replace(/\s+/g, " ").trim();

    // Detect year header
    const yearMatch = yearLabels.find(y => rowText.toLowerCase().includes(y.toLowerCase()));
    if (yearMatch && rowText.length < 30) {
      // Save previous semester
      if (currentSemester && currentCourses.length > 0) {
        schedule.push({
          year:        currentYear,
          semester:    currentSemester,
          total_hours: currentHours,
          courses:     currentCourses,
        });
      }
      // Avoid "First Year Year" — only append "Year" if not already present
      currentYear     = yearMatch.toLowerCase().includes("year") ? yearMatch : yearMatch + " Year";
      currentSemester = null;
      currentCourses  = [];
      currentHours    = null;
      continue;
    }

    // Detect semester header
    const semMatch = semesterLabels.find(s => rowText.toLowerCase().includes(s.toLowerCase()));
    if (semMatch && rowText.length < 40) {
      if (currentSemester && currentCourses.length > 0) {
        schedule.push({
          year:        currentYear,
          semester:    currentSemester,
          total_hours: currentHours,
          courses:     currentCourses,
        });
      }
      currentSemester = semMatch;
      currentCourses  = [];
      currentHours    = null;
      continue;
    }

    // Detect "Hours  16" total row
    if (rowText.match(/^Hours\s+\d+$/i)) {
      currentHours = parseInt(rowText.replace(/[^0-9]/g, ""), 10);
      continue;
    }

    if (!currentSemester) continue;

    // Parse course row
    const cells = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
      cells.push(decodeEntities(stripTags(cellMatch[1])).trim());
    }

    if (cells.length < 2) continue;

    const col0 = cells[0].replace(/\s+/g, " ").trim();
    const col1 = cells[1]?.replace(/\s+/g, " ").trim() ?? "";
    const hoursStr = cells[cells.length - 1]?.replace(/[^0-9.\-]/g, "") ?? "";
    const hours = hoursStr && !isNaN(parseFloat(hoursStr)) ? parseFloat(hoursStr) : null;

    // Is it a real course code?
    const isCourseCode = /^[A-Z]{2,5}\s+\d{3}[A-Z]?/.test(col0);

    if (isCourseCode) {
      // Extract just the first course code (some cells have "CS 111 or CS 112 or CS 113")
      const primaryCode = col0.match(/^([A-Z]{2,5}\s+\d{3}[A-Z]?)/)?.[1] ?? col0;
      currentCourses.push({
        code:        primaryCode,
        title:       col1,
        hours:       hours,
        isElective:  false,
        electiveType: null,
      });
    } else if (col0.length > 3 && !col0.match(/^Hours/i)) {
      // It's an elective slot or placeholder
      // Classify the elective type
      const elType = classifyElectiveSlot(col0);
      if (elType) {
        currentCourses.push({
          code:        null,
          title:       col0,
          hours:       hours,
          isElective:  true,
          electiveType: elType,
        });
      }
    }
  }

  // Save last semester
  if (currentSemester && currentCourses.length > 0) {
    schedule.push({
      year:        currentYear,
      semester:    currentSemester,
      total_hours: currentHours,
      courses:     currentCourses,
    });
  }

  return schedule;
}

/**
 * Classify an elective slot label into a standard type.
 */
function classifyElectiveSlot(label) {
  const l = label.toLowerCase();

  if (l.includes("gen ed") || l.includes("general education") || l.includes("general ed")) {
    // Try to identify the specific gen ed category
    if (l.includes("world cultures") || l.includes("exploring world")) return "gen_ed_world_cultures";
    if (l.includes("creative arts") || l.includes("understanding the creative")) return "gen_ed_creative_arts";
    if (l.includes("past") || l.includes("understanding the past")) return "gen_ed_past";
    if (l.includes("individual") || l.includes("society")) return "gen_ed_individual_society";
    if (l.includes("u.s. society") || l.includes("us society")) return "gen_ed_us_society";
    return "gen_ed_any";
  }
  if (l.includes("free elective")) return "free_elective";
  if (l.includes("technical elective")) return "technical_elective";
  if (l.includes("science elective")) return "science_elective";
  if (l.includes("math") && l.includes("elective")) return "math_elective";
  if (l.includes("humanities") || l.includes("social science") || l.includes("art elective")) return "humanities_elective";
  if (l.includes("required math")) return "required_math";
  if (l.includes("elective") || l.includes("select")) return "elective_general";

  return null; // not an elective slot
}

/**
 * Parse the page title / degree name.
 */
function parseDegreeTitle(html) {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (match) return decodeEntities(stripTags(match[1])).trim();
  return null;
}

/**
 * Main parser — given HTML of a degree page, return structured data.
 */
function parseDegree(html, meta) {
  const courses      = parseCourseListTables(html);
  const schedule     = parseSampleSchedule(html);
  const totalHours   = parseTotalHours(html);
  const summary      = parseSummaryTable(html);
  const electiveGroups = parseElectiveGroups(html);
  // Always use meta.degreeName from major_urls.json — the page h1 is often
  // the site-wide "Academic Catalog" header, not the degree title.
  const title = meta.degreeName;

  // Separate required from elective courses
  // Heuristic: courses in "Technical Electives" or "Free Electives" sections
  // are optional; everything else in "Required Courses" sections is required.
  // We'll mark all parsed courses as required for now — the schedule's isElective flag
  // handles the elective slots.

  // Build credit hour lookup from parsed courses
  const creditLookup = {};
  for (const c of courses) {
    if (c.hours != null) creditLookup[c.code] = c.hours;
  }

  // Enrich schedule entries with credit hours from course lookup
  for (const sem of schedule) {
    for (const entry of sem.courses) {
      if (entry.code && !entry.hours && creditLookup[entry.code]) {
        entry.hours = creditLookup[entry.code];
      }
    }
  }

  return {
    name:              title,
    college:           meta.college || meta.department,
    department:        meta.department,
    url:               meta.degreeUrl,
    totalHours:        totalHours,
    summaryRequirements: summary,
    requiredCourses:   courses,
    electiveGroups:    electiveGroups.length > 0 ? electiveGroups : undefined,
    sampleSchedule:    schedule,
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  UIC Degree Plan Scraper");
  console.log("═══════════════════════════════════════════════════════\n");

  if (!fs.existsSync(URLS_FILE)) {
    console.error(`❌  major_urls.json not found at ${URLS_FILE}`);
    process.exit(1);
  }

  let urls = JSON.parse(fs.readFileSync(URLS_FILE, "utf-8"));
  console.log(`📋  Loaded ${urls.length} major URLs`);

  // Filter if --major specified
  if (MAJOR_FILTER) {
    urls = urls.filter(u =>
      u.degreeName?.toLowerCase().includes(MAJOR_FILTER) ||
      u.department?.toLowerCase().includes(MAJOR_FILTER)
    );
    console.log(`🔍  Filtered to ${urls.length} majors matching "${MAJOR_FILTER}"`);
  }

  // Skip minors, certificates — only BS/BA/BFA/BArch degrees
  const degreeUrls = urls.filter(u => {
    const name = (u.degreeName ?? "").toLowerCase();
    return name.includes(" bs") || name.includes(" ba") || name.includes(" bfa") ||
           name.includes(" barch") || name.includes(" bmus") || name.includes(" bse") ||
           name.includes("bachelor") || name.startsWith("bs ") || name.startsWith("ba ");
  });

  console.log(`🎓  Processing ${degreeUrls.length} degree programs (skipping minors/certificates)`);
  if (ONLY_MISSING) console.log(`    --only-missing: will skip majors whose JSON already has a sampleSchedule\n`);
  else console.log();

  if (DRY_RUN) {
    console.log("  DRY RUN — will not write output file\n");
  }

  const majors = [];
  let success = 0;
  let failed = 0;

  for (let i = 0; i < degreeUrls.length; i++) {
    const meta = degreeUrls[i];
    const url  = meta.degreeUrl;

    if (!url || !url.startsWith("http")) {
      console.log(`  [${i+1}/${degreeUrls.length}] ⚠  Skipping — no URL: ${meta.degreeName}`);
      failed++;
      continue;
    }

    // --only-missing: skip if the existing JSON already has a non-empty sampleSchedule
    if (ONLY_MISSING) {
      const slug = toSlug(meta.degreeName);
      const existingPath = path.join(OUTPUT_DIR, `${slug}.json`);
      if (fs.existsSync(existingPath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(existingPath, "utf-8"));
          if ((existing.sampleSchedule?.length ?? 0) > 0) {
            console.log(`  [${i+1}/${degreeUrls.length}] skip (has schedule): ${meta.degreeName?.slice(0,50)}`);
            majors.push(existing);
            success++;
            continue;
          }
        } catch {}
      }
    }

    process.stdout.write(`  [${i+1}/${degreeUrls.length}] ${meta.degreeName?.slice(0,50)}... `);

    try {
      const html    = await fetchPage(url);
      const degree  = parseDegree(html, meta);

      const courseCount    = degree.requiredCourses.length;
      const scheduleCount  = degree.sampleSchedule.length;
      const hasSchedule    = scheduleCount > 0;

      console.log(`✓ ${courseCount} courses | ${scheduleCount} semesters${hasSchedule ? "" : " ⚠ NO SCHEDULE"}`);

      majors.push(degree);
      success++;

      if (DRY_RUN && i >= 2) {
        console.log("\n  [dry-run] Stopping after 3 majors.");
        break;
      }
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failed++;
      // Still add a placeholder so we don't lose the entry
      majors.push({
        name:           meta.degreeName,
        college:        meta.college || meta.department,
        department:     meta.department,
        url:            url,
        totalHours:     null,
        requiredCourses: [],
        sampleSchedule: [],
        _error:         err.message,
      });
    }

    // Polite delay
    if (i < degreeUrls.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n  Done: ${success} succeeded, ${failed} failed\n`);

  if (DRY_RUN) {
    console.log("  [dry-run] Sample output (first major):");
    console.log(JSON.stringify(majors[0], null, 2).slice(0, 3000));
  } else {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const index = [];
    for (const major of majors) {
      const slug = toSlug(major.name);
      const filePath = path.join(OUTPUT_DIR, `${slug}.json`);
      fs.writeFileSync(filePath, JSON.stringify(major, null, 2), "utf-8");
      index.push({
        name:        major.name,
        slug,
        college:     major.college,
        department:  major.department,
        totalHours:  major.totalHours,
        url:         major.url,
        file:        `majors/${slug}.json`,
        hasSchedule: (major.sampleSchedule?.length ?? 0) > 0,
        courseCount: major.requiredCourses?.length ?? 0,
        hasError:    !!major._error,
      });
    }
    const indexPath = path.join(OUTPUT_DIR, "_index.json");
    fs.writeFileSync(indexPath, JSON.stringify({ majors: index }, null, 2), "utf-8");
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ majors }, null, 2), "utf-8");
    const withSchedule    = majors.filter(m => (m.sampleSchedule?.length ?? 0) > 0).length;
    const withoutSchedule = majors.filter(m => !(m.sampleSchedule?.length) && !m._error).length;
    console.log(`  💾  Individual files: ${OUTPUT_DIR}/`);
    console.log(`  💾  Index:            ${indexPath}`);
    console.log(`  💾  Legacy combined:  ${OUTPUT_FILE}`);
    console.log(`  📊  With schedule: ${withSchedule} | Without: ${withoutSchedule}`);
    if (withoutSchedule > 0) {
      majors.filter(m => !(m.sampleSchedule?.length) && !m._error)
            .forEach(m => console.log(`  ⚠   No schedule: ${m.name}`));
    }
    console.log("\n  Example files:");
    index.slice(0, 5).forEach(m => console.log(`    ${m.file} (${m.courseCount} courses, schedule:${m.hasSchedule})`));
  }

  console.log("\n═══════════════════════════════════════════════════════\n");
}

function toSlug(name) {
  return (name ?? "unknown")
    .toLowerCase()
    .replace(/^[•·\-\s]+/, "")          // strip leading bullets
    .replace(/\s*-\s*(bs|ba|bfa|barch|bmus|bse)\s*$/i, "-$1")  // normalize "- BS" suffix
    .replace(/with/g, "")
    .replace(/concentration/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
