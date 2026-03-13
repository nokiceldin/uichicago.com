import fs from "fs";

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseProfessorToCoursesName(name) {
  const parts = String(name).split(",").map((x) => x.trim());
  if (parts.length !== 2) return null;

  const last = normalize(parts[0]);
  const givenParts = normalize(parts[1]).split(" ").filter(Boolean);

  if (givenParts.length !== 2) return null;

  return {
    original: name,
    last,
    first: givenParts[0],
    middle: givenParts[1],
  };
}

function parseRmpName(name) {
  const parts = normalize(name).split(" ").filter(Boolean);

  if (parts.length !== 2) return null;

  return {
    original: name,
    first: parts[0],
    last: parts[1],
  };
}

const profToCoursesRaw = fs.readFileSync("./public/data/professor_to_courses.json", "utf8");
const profToCourses = JSON.parse(profToCoursesRaw);

const rmpRaw = fs.readFileSync("./public/data/uic_rmp_professors_fixed.json", "utf8");
const rmp = JSON.parse(rmpRaw);

const courseNames = Object.keys(profToCourses);
const threePartCourseNames = courseNames
  .map(parseProfessorToCoursesName)
  .filter(Boolean);

const rmpTwoPartNames = rmp
  .map((p) => parseRmpName(p.Name || p.name || ""))
  .filter(Boolean);

const matches = [];
const noMatches = [];
const ambiguous = [];

for (const courseProf of threePartCourseNames) {
  const candidates = rmpTwoPartNames.filter((rmpProf) => {
    return rmpProf.last === courseProf.last && rmpProf.first === courseProf.first;
  });

  if (candidates.length === 1) {
    matches.push({
      from: courseProf.original,
      to: candidates[0].original,
    });
  } else if (candidates.length === 0) {
    noMatches.push(courseProf.original);
  } else {
    ambiguous.push({
      from: courseProf.original,
      candidates: candidates.map((c) => c.original),
    });
  }
}

fs.writeFileSync(
  "./scripts/three-name-matches.json",
  JSON.stringify(matches, null, 2),
  "utf8"
);

fs.writeFileSync(
  "./scripts/three-name-no-matches.json",
  JSON.stringify(noMatches, null, 2),
  "utf8"
);

fs.writeFileSync(
  "./scripts/three-name-ambiguous.json",
  JSON.stringify(ambiguous, null, 2),
  "utf8"
);

console.log("Done");
console.log("Matches:", matches.length);
console.log("No matches:", noMatches.length);
console.log("Ambiguous:", ambiguous.length);