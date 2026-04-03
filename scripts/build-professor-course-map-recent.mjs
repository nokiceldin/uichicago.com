import fs from "node:fs";
import path from "node:path";

const RECENT_TERM_FILES = [
  "spring24.csv",
  "summer24.csv",
  "fall24.csv",
  "spring25.csv",
  "summer25.csv",
  "fall25.csv",
];

const DATA_DIR = path.join(process.cwd(), "public", "data");
const OUTPUT_FILE = path.join(DATA_DIR, "professor_to_courses_recent.json");

function parseCsvLine(line) {
  return line.match(/(".*?"|[^",\s][^,]*|)(?=\s*,|\s*$)/g) ?? [];
}

function cleanCell(value) {
  return String(value ?? "").replace(/^"|"$/g, "").trim();
}

function isValidInstructorName(value) {
  return /[A-Za-z]/.test(value);
}

const coursesByProfessor = new Map();

for (const file of RECENT_TERM_FILES) {
  const filePath = path.join(DATA_DIR, file);
  const csv = fs.readFileSync(filePath, "utf8");
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) continue;

  const headerCells = parseCsvLine(lines[0].replace(/^\uFEFF/, ""));
  const subjectIndex = headerCells.findIndex((cell) => cell.includes('"CRS SUBJ CD"'));
  const numberIndex = headerCells.findIndex((cell) => cell.includes('"CRS NBR"'));
  const titleIndex = headerCells.findIndex((cell) => cell.includes('"CRS TITLE"'));
  const instructorIndex = headerCells.findIndex((cell) => cell.includes('"Primary Instructor"'));

  if (subjectIndex < 0 || numberIndex < 0 || titleIndex < 0 || instructorIndex < 0) {
    throw new Error(`Missing required columns in ${file}`);
  }

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const subject = cleanCell(cells[subjectIndex]).toUpperCase();
    const number = cleanCell(cells[numberIndex]).toUpperCase();
    const title = cleanCell(cells[titleIndex]);
    const instructor = cleanCell(cells[instructorIndex]);

    if (!subject || !number || !title || !instructor || !isValidInstructorName(instructor)) continue;

    const courseLabel = `${subject} ${number} | ${title}`;
    const bucket = coursesByProfessor.get(instructor) ?? new Set();
    bucket.add(courseLabel);
    coursesByProfessor.set(instructor, bucket);
  }
}

const sorted = Object.fromEntries(
  [...coursesByProfessor.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([professor, courses]) => [professor, [...courses].sort((a, b) => a.localeCompare(b))])
);

fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(sorted, null, 2)}\n`);

console.log(`Wrote ${OUTPUT_FILE}`);
console.log(`Professors: ${Object.keys(sorted).length}`);
