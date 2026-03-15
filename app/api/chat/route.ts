
export const dynamic = "force-dynamic";
export const runtime = "nodejs";  // ADD THIS
export const revalidate = 0;      // ADD
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { detectIntent, detectCampusIntent } from "@/lib/chat/intent";
import { classifyIntent } from "@/lib/chat/classify";
import { vectorSearch } from "@/lib/chat/vectors";
import { getMemory, updateMemory, formatMemoryForPrompt } from "@/lib/chat/memory";
import {
  fetchCourseDetail,
  fetchCoursesByCodesRanked,
  fetchCoursesBySubjectOrDept,
  fetchGenEdCourses,
  fetchProfessorsByDept,
  fetchProfessorWithCourseRankings,
  fetchRecentNews,
} from "@/lib/chat/data";
import { diffLabel } from "@/lib/chat/utils";
import housingDiningData from "@/public/data/uic-knowledge/housing-dining.json";
import athleticsData from "@/public/data/uic-knowledge/athletics.json";
import academicCalendarData from "@/public/data/uic-knowledge/academic-calendar.json";
import admissionsData from "@/public/data/uic-knowledge/admissions.json";
import billingData from "@/public/data/uic-knowledge/billing-financial-aid.json";
import studentLifeExpandedData from "@/public/data/uic-knowledge/student-life-expanded.json";
import safetyData from "@/public/data/uic-knowledge/safety-policies.json";
import libraryData from "@/public/data/uic-knowledge/library.json";
import internationalData from "@/public/data/uic-knowledge/international.json";
import instagramData from "@/public/data/uic-knowledge/instagram-accounts.json";
import healthData from "@/public/data/uic-knowledge/health-academics.json";
import buildingsData from "@/public/data/uic-knowledge/campus-buildings.json";
import advisingData from "@/public/data/uic-knowledge/advising-support.json";


const client = new Anthropic();

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ChatMessage { role: "user" | "assistant"; content: string; }

type Domain =
  | "courses" | "professors" | "gen_ed" | "major_plan"
  | "tuition" | "financial_aid"
  | "housing" | "dining"
  | "student_life" | "greek_life"
  | "athletics" | "news"
  | "campus_map" | "transportation"
  | "health" | "recreation"
  | "calendar" | "registration" | "academic_policy"
  | "admissions" | "careers" | "library"
  | "international" | "safety" | "instagram";

type AnswerMode =
  | "ranking"        // "easiest", "best", "top N"
  | "comparison"     // "A vs B", "difference between"
  | "recommendation" // "should I", "what's better for me"
  | "logistics"      // "where is", "phone number", "deadline"
  | "planning"       // "4-year plan", "sequence", "schedule"
  | "discovery"      // "tell me about", open-ended
  | "hybrid";        // multiple modes combined

interface Constraint {
  type: "cost" | "proximity" | "fit" | "year" | "major" | "preference" | "eligibility";
  value: string;
  weight: number; // 0-1, how important is this constraint
}

interface SubIntent {
  goal: string;
  domains: Domain[];
  constraints: Constraint[];
  answerMode: AnswerMode;
}

interface QueryAnalysis {
  rawQuery: string;
  primaryGoal: string;
  answerMode: AnswerMode;
  subIntents: SubIntent[];
  constraints: Constraint[];
  domainConfidence: Partial<Record<Domain, number>>; // 0-1
  isMultiPart: boolean;
  requiresComparison: boolean;
  requiresPersonalization: boolean;
  isFact: boolean; // true = single factual lookup: address/phone/deadline/hours/location
}

interface RetrievedChunk {
  domain: Domain;
  content: string;
  relevanceScore: number;  // 0-1, computed dynamically
  sourceConfidence: number; // 0-1, how reliable is this source
  tokenEstimate: number;
}

interface AnswerBrief {
  inferredGoal: string;
  answerMode: AnswerMode;
  detectedConstraints: Constraint[];
  keyFacts: string[];
  tradeoffs: string[];
  recommendedApproach: string;
  domainsUsed: Domain[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 1: QUERY ANALYSIS — extract structured intent from natural language
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeQuery(msg: string, conversationHistory: ChatMessage[]): QueryAnalysis {
  const lower = msg.toLowerCase();
  const words = lower.split(/\s+/);

  // ── Answer mode detection (ordered by specificity) ──────────────────────
  const answerMode = detectAnswerMode(lower);

  // ── Constraint extraction ─────────────────────────────────────────────────
  const constraints: Constraint[] = [];

  // Cost sensitivity
  if (words.some(w => ["cheap","cheapest","affordable","save money","budget","cost","expensive","free"].includes(w))) {
    constraints.push({ type: "cost", value: "budget-conscious", weight: 0.9 });
  }
  // Year/level
  const yearMatch = lower.match(/\b(freshman|sophomore|junior|senior|first.?year|second.?year|transfer)\b/);
  if (yearMatch) constraints.push({ type: "year", value: yearMatch[1], weight: 0.8 });
  // Major/field
  const majorKeywords = [
    ["engineering","engineer","cs","computer science","ece","mechanical","electrical","civil","bioengineering"],
    ["nursing","nurse","health sciences","pre.?med","pre-med","pre.?health","premed"],
    ["business","accounting","finance","marketing","management","mba"],
    ["biology","chemistry","physics","math","science"],
    ["liberal arts","english","history","psychology","sociology","political science"],
    ["architecture","design","art","theater","music"],
    ["public health","pharmacy","dentistry","medicine"],
  ];
  for (const group of majorKeywords) {
    if (group.some(k => lower.includes(k))) {
      constraints.push({ type: "major", value: group[0], weight: 0.7 });
      break;
    }
  }
  // Social/lifestyle
  if (lower.includes("social") || lower.includes("community") || lower.includes("meet people") || lower.includes("friends")) {
    constraints.push({ type: "preference", value: "social", weight: 0.6 });
  }
  // Commuter
  if (lower.includes("commut") || lower.includes("off campus") || lower.includes("live off") || lower.includes("drive")) {
    constraints.push({ type: "preference", value: "commuter", weight: 0.7 });
  }
  // Proximity
  if (lower.includes("close to") || lower.includes("near") || lower.includes("walking distance") || lower.includes("nearby")) {
    constraints.push({ type: "proximity", value: "close-to-campus", weight: 0.7 });
  }
  // International
  if (lower.includes("international") || lower.includes("f-1") || lower.includes("f1") || lower.includes("visa")) {
    constraints.push({ type: "eligibility", value: "international-student", weight: 0.9 });
  }

  // ── Domain confidence scoring ─────────────────────────────────────────────
  const domainConfidence: Partial<Record<Domain, number>> = {};

  // Course/academic signals
  if (lower.match(/\b(course|class|cs|math|chem|bios|phys|engl|stat|mcs|econ|hist|pols)\s*\d{3}/i)) domainConfidence["courses"] = 0.95;
  else if (words.some(w => ["course","courses","class","classes","section","prerequisite","credit","gpa","grade","easiest","hardest"].includes(w))) domainConfidence["courses"] = 0.8;

  if (words.some(w => ["professor","prof","instructor","teacher","teach","lecture"].includes(w))) domainConfidence["professors"] = 0.9;
  if (lower.includes("gen ed") || lower.includes("general education") || lower.includes("gen-ed")) domainConfidence["gen_ed"] = 0.95;
  if (lower.match(/4.?year|four.?year|degree plan|course plan|semester.?plan|what should i take/)) domainConfidence["major_plan"] = 0.9;

  // Financial signals
  if (words.some(w => ["tuition","cost","fee","price","pay","afford","how much","billing"].includes(w))) domainConfidence["tuition"] = 0.85;
  if (words.some(w => ["aid","fafsa","scholarship","grant","aspire","financial","loan","debt"].includes(w))) domainConfidence["financial_aid"] = 0.9;

  // Housing/dining signals
  if (words.some(w => ["dorm","housing","hall","residence","room","live","apartment","arc","jst","cmw","cmn","mih","tbh","ssr","psr"].includes(w))) domainConfidence["housing"] = 0.9;
  if (words.some(w => ["food","eat","dining","meal","plan","breakfast","lunch","dinner","cafe","restaurant","commons","halsted"].includes(w))) domainConfidence["dining"] = 0.85;

  // Campus life
  if (words.some(w => ["club","org","organization","activity","activities","involve","join","greek","frat","fraternity","sorority","rush"].includes(w))) {
    domainConfidence["student_life"] = 0.8;
    if (lower.includes("greek") || lower.includes("frat") || lower.includes("sorority") || lower.includes("rush")) domainConfidence["greek_life"] = 0.9;
  }

  // Athletics
  if (words.some(w => ["basketball","soccer","baseball","volleyball","softball","tennis","swim","track","flame","flames","athletic","sport","ticket","game"].includes(w))) domainConfidence["athletics"] = 0.9;

  // Campus logistics
  if (words.some(w => ["where","building","office","located","map","navigate","get to","address"].includes(w))) domainConfidence["campus_map"] = 0.8;
  if (words.some(w => ["cta","bus","train","blue line","pink line","shuttle","parking","commute","transit","ride"].includes(w))) domainConfidence["transportation"] = 0.9;

  // Health
  if (words.some(w => ["health","clinic","counsel","therapy","mental","campuscare","insurance","waiver","drc","disability","pharmacy","doctor","nurse"].includes(w))) domainConfidence["health"] = 0.9;
  if (words.some(w => ["gym","rec","workout","srf","sfc","intramural","swim","pool","fitness","sport club"].includes(w))) domainConfidence["recreation"] = 0.85;

  // Academic policies
  if (words.some(w => ["deadline","withdraw","drop","add","registration","register","finals","exam","schedule","calendar","gpa","graduation","graduate","honors","latin honors"].includes(w))) {
    domainConfidence["calendar"] = 0.8;
    domainConfidence["academic_policy"] = 0.7;
  }

  // Other services
  if (words.some(w => ["admit","apply","application","acceptance","transfer","incoming","aspire"].includes(w))) domainConfidence["admissions"] = 0.85;
  if (words.some(w => ["job","career","internship","resume","interview","handshake","hire","recruit"].includes(w))) domainConfidence["careers"] = 0.85;
  if (words.some(w => ["library","daley","borrow","study room","book","lhs","print","reserve"].includes(w))) domainConfidence["library"] = 0.85;
  if (words.some(w => ["international","visa","ois","cpt","opt","f-1","study abroad","abroad"].includes(w))) domainConfidence["international"] = 0.9;
  if (words.some(w => ["safe","safety","police","escort","emergency","title ix","conduct","ferpa","legal"].includes(w))) domainConfidence["safety"] = 0.85;
  if (lower.includes("instagram") || lower.includes(" ig ") || lower.includes("insta") || lower.includes("follow") || lower.includes("@uic")) domainConfidence["instagram"] = 0.95;

  // ── Query decomposition ───────────────────────────────────────────────────
  const subIntents = decomposeQuery(lower, domainConfidence, constraints, answerMode);

  // ── Multi-part detection ──────────────────────────────────────────────────
  const isMultiPart = subIntents.length > 1 ||
    (lower.includes(" and ") && Object.keys(domainConfidence).length >= 2) ||
    lower.includes("also") || lower.includes("as well");

  const requiresComparison = answerMode === "comparison" ||
    lower.includes(" vs ") || lower.includes(" or ") ||
    lower.includes("difference") || lower.includes("better");

  const requiresPersonalization = constraints.length >= 2 ||
    answerMode === "recommendation" ||
    lower.includes("for me") || lower.includes("my situation") || lower.includes("i am");

  // ── isFact detection — single factual lookups that need verbatim structured data ──
  const factPatterns = [
    /\b(where is|where are|where('s| is) the|what (floor|suite|room|building)|address of|located at|location of)\b/,
    /\b(phone( number)?|number for|email( for)?|contact( for)?|how (do i |can i )?call|how (do i |can i )?reach)\b/,
    /\b(what (time|are the hours|hour)|when (does|is|are|do).{0,20}(open|close|start|end)|hours (for|of))\b/,
    /\b(deadline (for|to)|due date|last day (to|for)|when is the.{0,25}deadline)\b/,
    /\b(how much (is|does|cost|are)|what (is the |does it )?cost|price of|what('s| is) tuition)\b/,
    /\b(what is the (fafsa|aspire|add.?drop|withdraw|registration))\b/,
  ];
  const isFact = factPatterns.some(p => p.test(lower)) && words.length < 15 && !lower.includes(" and ") && !lower.includes(" vs ");

  // ── Athletics boost: scan actual roster + coach data dynamically ──────────
  const athData = athleticsData as any;
  const allRosterPlayers: string[] = [];
  const rosters = athData.current_rosters_2025_2026 ?? {};
  for (const [key, val] of Object.entries(rosters)) {
    if (key === "note" || !Array.isArray(val)) continue;
    for (const player of val as string[]) {
      allRosterPlayers.push(player.toLowerCase());
    }
  }
  const allCoaches = [
    ...(athData.teams?.mens ?? []),
    ...(athData.teams?.womens ?? []),
  ].map((t: any) => (t.coach ?? "").toLowerCase());

  const athleticsMatch =
    allRosterPlayers.some(p => {
      const parts = p.split(/\s+/);
      // Match on last name (last part) if it's 3+ chars, or full name
      return parts.some(part => part.length >= 3 && lower.includes(part)) || lower.includes(p);
    }) ||
    allCoaches.some(c => {
      const parts = c.split(/\s+/);
      return parts.some((part: string) => part.length >= 4 && lower.includes(part));
    });

  if (athleticsMatch) {
    domainConfidence["athletics"] = 0.95;
  }

  // Primary goal extraction
  const primaryGoal = inferPrimaryGoal(lower, domainConfidence, answerMode);

  return {
    rawQuery: msg,
    primaryGoal,
    answerMode,
    subIntents,
    constraints,
    domainConfidence,
    isMultiPart,
    requiresComparison,
    requiresPersonalization,
    isFact,
  };
}

function detectAnswerMode(lower: string): AnswerMode {
  if (lower.match(/\b4.?year|four.?year|degree plan|course plan|semester.?plan|sequence\b/)) return "planning";
  if (lower.match(/\b(should i|recommend|suggest|good for|worth it|would you|best for|which is better for me)\b/)) return "recommendation";
  if (lower.match(/\b(vs|versus|difference between|compare|which is better|or the)\b/)) return "comparison";
  if (lower.match(/\b(easiest|hardest|best|worst|top|cheapest|highest gpa|lowest|most|least)\b/)) return "ranking";
  if (lower.match(/\b(how do i|where is|when does|phone number|address|hours|deadline|how to|how can i|contact)\b/)) return "logistics";

  const knowledgeDomains = Object.keys(detectAnswerMode).length; // placeholder
  void knowledgeDomains;

  // Check for hybrid (multiple mode signals)
  const modeSignals = [
    /\b(easiest|best|top)\b/.test(lower),
    /\b(should i|recommend)\b/.test(lower),
    /\b(where|when|how)\b/.test(lower),
  ].filter(Boolean).length;

  if (modeSignals >= 2) return "hybrid";
  return "discovery";
}

function inferPrimaryGoal(lower: string, domainConfidence: Partial<Record<Domain, number>>, answerMode: AnswerMode): string {
  const topDomain = Object.entries(domainConfidence).sort(([,a],[,b]) => b - a)[0]?.[0] ?? "general";
  const modeVerb: Record<AnswerMode, string> = {
    ranking: "find the best",
    comparison: "compare options for",
    recommendation: "get a recommendation for",
    logistics: "find logistics/info about",
    planning: "build a plan for",
    discovery: "learn about",
    hybrid: "research",
  };
  return `${modeVerb[answerMode]} ${topDomain.replace("_", " ")} at UIC`;
}

function decomposeQuery(
  lower: string,
  domainConfidence: Partial<Record<Domain, number>>,
  constraints: Constraint[],
  primaryMode: AnswerMode
): SubIntent[] {
  const highConfidenceDomains = Object.entries(domainConfidence)
    .filter(([, conf]) => conf >= 0.7)
    .map(([domain]) => domain as Domain);

  if (highConfidenceDomains.length <= 1) {
    return [{
      goal: `Answer question about ${highConfidenceDomains[0] ?? "UIC"}`,
      domains: highConfidenceDomains.length > 0 ? highConfidenceDomains : ["student_life"],
      constraints,
      answerMode: primaryMode,
    }];
  }

  // Group related domains into sub-intents
  const domainGroups: Domain[][] = [];
  const courseGroup = highConfidenceDomains.filter(d => ["courses","professors","gen_ed","major_plan"].includes(d));
  const financeGroup = highConfidenceDomains.filter(d => ["tuition","financial_aid"].includes(d));
  const housingGroup = highConfidenceDomains.filter(d => ["housing","dining"].includes(d));
  const campusLifeGroup = highConfidenceDomains.filter(d => ["student_life","greek_life","athletics","recreation"].includes(d));
  const logisticsGroup = highConfidenceDomains.filter(d => ["campus_map","transportation","health","library","careers","safety","international"].includes(d));
  const calendarGroup = highConfidenceDomains.filter(d => ["calendar","registration","academic_policy"].includes(d));

  if (courseGroup.length) domainGroups.push(courseGroup);
  if (financeGroup.length) domainGroups.push(financeGroup);
  if (housingGroup.length) domainGroups.push(housingGroup);
  if (campusLifeGroup.length) domainGroups.push(campusLifeGroup);
  if (logisticsGroup.length) domainGroups.push(logisticsGroup);
  if (calendarGroup.length) domainGroups.push(calendarGroup);

  if (domainGroups.length <= 1) {
    return [{ goal: "Multi-domain question", domains: highConfidenceDomains, constraints, answerMode: primaryMode }];
  }

  return domainGroups.slice(0, 4).map(group => ({
    goal: `Retrieve ${group.join("+")} information`,
    domains: group,
    constraints,
    answerMode: primaryMode === "recommendation" ? "recommendation" : (group.length > 1 ? "hybrid" : primaryMode),
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 2: SESSION RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

function resolveSession(req: Request) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/sparky_session=([^;]+)/);
  if (match?.[1]) return { sessionId: match[1], isNew: false };
  return { sessionId: `sparky_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, isNew: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 3: RETRIEVAL EXECUTORS
// Each executor returns scored chunks, relevance is computed against the query
// ═══════════════════════════════════════════════════════════════════════════════

// For fact queries: find the 1-3 lines most directly answering the question
// rather than returning the full blob. This ensures the exact fact is at
// the top of context and Claude quotes it verbatim rather than paraphrasing.
function extractFact(content: string, queryWords: string[]): string | null {
  const significantWords = queryWords.filter(w => w.length > 3 &&
    !["what","where","when","does","that","this","have","from","with","about","the","for","how","its","who","are","and","can","you","uic"].includes(w));
  if (significantWords.length === 0) return null;

  const lines = content.split("\n").filter(l => l.trim() && !l.startsWith("==="));
  const scored = lines.map(line => {
    const lower = line.toLowerCase();
    const hits = significantWords.filter(w => lower.includes(w)).length;
    // Extra weight for lines that look like facts: contain suite/phone/address/hours patterns
    const factBonus = lower.match(/suite|floor|\d{3}-\d{3}-\d{4}|@|\d{3,4}\s+[wsne]\s+\w|am|pm|mon|free|deadline/) ? 1 : 0;
    return { line, score: hits + factBonus };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  // Return top 3 lines maximum — enough context without the full blob
  return scored.slice(0, 3).map(x => x.line).join("\n");
}

function scoreChunk(content: string, query: QueryAnalysis, domain: Domain): number {
  const lower = content.toLowerCase();
  const queryWords = query.rawQuery.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  // Word overlap score
  const overlapCount = queryWords.filter(w => lower.includes(w)).length;
  const overlapScore = Math.min(overlapCount / Math.max(queryWords.length, 1), 1);

  // Domain confidence score
  const domainScore = query.domainConfidence[domain] ?? 0.5;

  // Constraint relevance
  let constraintScore = 0;
  for (const constraint of query.constraints) {
    if (constraint.type === "cost" && lower.match(/\$\d|price|cost|free|cheap/)) constraintScore += 0.2 * constraint.weight;
    if (constraint.type === "year" && lower.includes(constraint.value)) constraintScore += 0.15 * constraint.weight;
    if (constraint.type === "preference" && lower.includes(constraint.value)) constraintScore += 0.1 * constraint.weight;
  }

  // Answer mode alignment
  const modeBonus: Partial<Record<AnswerMode, number>> = {
    ranking: lower.match(/gpa|rate|score|rank|\d+\/5/) ? 0.15 : 0,
    logistics: lower.match(/\d{3}-\d{3}-\d{4}|suite|room|floor|hours|am|pm/) ? 0.15 : 0,
    planning: lower.match(/semester|year|sequence|required|schedule/) ? 0.15 : 0,
    comparison: lower.includes("vs") || lower.includes("or") ? 0.1 : 0,
  };
  const modeScore = modeBonus[query.answerMode] ?? 0;

  return Math.min(overlapScore * 0.4 + domainScore * 0.35 + constraintScore + modeScore, 1);
}

function makeChunk(domain: Domain, content: string, baseConfidence: number, query: QueryAnalysis): RetrievedChunk {
  let finalContent = content;
  if (query.isFact) {
    const queryWords = query.rawQuery.toLowerCase().split(/\s+/);
    const extracted = extractFact(content, queryWords);
    // Only use the extracted snippet if it actually found something meaningful
    if (extracted && extracted.length > 20) finalContent = extracted;
  }
  return {
    domain,
    content: finalContent,
    relevanceScore: scoreChunk(finalContent, query, domain),
    sourceConfidence: baseConfidence,
    tokenEstimate: Math.ceil(finalContent.length / 4),
  };
}

async function retrieveCourseDetail(intent: any, query: QueryAnalysis): Promise<RetrievedChunk[]> {
  if (!intent.courseCode) return [];
  try {
    const result = await fetchCourseDetail(intent.courseCode.subject, intent.courseCode.number);
    if (!result) return [];
    const { course, totals, instructors } = result;
    const sum = totals._sum;
    const totalGraded = (sum.a ?? 0) + (sum.b ?? 0) + (sum.c ?? 0) + (sum.d ?? 0) + (sum.f ?? 0);
    const aPct = totalGraded > 0 ? (((sum.a ?? 0) / totalGraded) * 100).toFixed(1) : "?";
    const passPct = totalGraded > 0 ? ((((sum.a ?? 0) + (sum.b ?? 0) + (sum.c ?? 0) + (sum.d ?? 0)) / totalGraded) * 100).toFixed(1) : "?";

    let content = `=== ${course.subject} ${course.number}: ${course.title} ===\n` +
      `Dept: ${course.deptName ?? "N/A"} | Avg GPA: ${course.avgGpa ?? "N/A"} | Difficulty: ${diffLabel(course.difficultyScore)} (${course.difficultyScore ?? "N/A"}/5)\n` +
      `${course.totalRegsAllTime} total students | Grades: A=${sum.a ?? 0}(${aPct}%), B=${sum.b ?? 0}, C=${sum.c ?? 0}, D=${sum.d ?? 0}, F=${sum.f ?? 0}, W=${sum.w ?? 0} | Pass rate: ${passPct}%` +
      (course.isGenEd ? ` | Gen Ed: YES — ${course.genEdCategory}` : "");

    if (instructors.length > 0) {
      content += "\n\nINSTRUCTORS (best GPA first):\n" + instructors.map((s: any, i: number) =>
        `${i + 1}. ${s.instructor} | GPA: ${s.avgGpa ?? "N/A"} | A-rate: ${s.aRate ?? "N/A"}% | W-rate: ${s.wRate ?? "N/A"}%` +
        (s.rmpQuality ? ` | RMP: ${s.rmpQuality}/5 (${s.rmpRatingsCount} reviews)` : "") +
        ` | ${s.totalStudents} students`
      ).join("\n");
    }
    return [makeChunk("courses", content, 0.98, query)];
  } catch { return []; }
}

async function retrieveCourseList(intent: any, query: QueryAnalysis): Promise<RetrievedChunk[]> {
  try {
    const asc = !intent.wantsHardest;
    if (intent.major?.categories) {
      const allCodes = intent.major.categories.flatMap((cat: any) => cat.courses);
      const courses = await fetchCoursesByCodesRanked(allCodes, asc);
      const content = `=== ${intent.major.label.toUpperCase()} COURSES (${intent.wantsHardest ? "hardest" : "easiest"} first) ===\n` +
        courses.map((c: any) =>
          `${c.subject} ${c.number} - ${c.title}: GPA ${c.avgGpa ?? "N/A"}, ${diffLabel(c.difficultyScore)}, ${c.totalRegsAllTime} students${c.isGenEd ? " [Gen Ed]" : ""}`
        ).join("\n") + "\n\nCURRICULUM:\n" +
        intent.major.categories.map((cat: any) =>
          `${cat.label}: ${cat.courses.slice(0, 8).join(", ")}${cat.courses.length > 8 ? ` +${cat.courses.length - 8} more` : ""}`
        ).join("\n");
      return [makeChunk("courses", content, 0.95, query)];
    }
    if (intent.subjectCode || intent.deptName) {
      const courses = await fetchCoursesBySubjectOrDept(intent.subjectCode, intent.deptName, 40, asc);
      if (!courses.length) return [];
      const label = (intent.subjectCode || intent.deptName || "").toUpperCase();
      const content = `=== ${label} COURSES ===\n` +
        courses.map((c: any) =>
          `${c.subject} ${c.number} - ${c.title}: GPA ${c.avgGpa ?? "N/A"}, ${diffLabel(c.difficultyScore)}, ${c.totalRegsAllTime} students${c.isGenEd ? " [Gen Ed]" : ""}`
        ).join("\n");
      return [makeChunk("courses", content, 0.9, query)];
    }
    return [];
  } catch { return []; }
}

async function retrieveGenEd(query: QueryAnalysis): Promise<RetrievedChunk[]> {
  try {
    const cats = [
      "Analyzing the Natural World", "Understanding the Individual and Society",
      "Understanding the Past", "Understanding the Creative Arts",
      "Exploring World Cultures", "Understanding U.S. Society",
    ];
    const lower = query.rawQuery.toLowerCase();
    const matched = cats.find(c => lower.includes(c.toLowerCase().slice(0, 12)));
    const geneds = await fetchGenEdCourses(matched, 45);

    // Smart filtering: if constraints say engineering/CS major, surface relevant gen eds
    const engineeringMajor = query.constraints.find(c => c.type === "major" && c.value.includes("engineer"));
    let filtered = geneds;
    if (engineeringMajor && query.answerMode === "recommendation") {
      // For engineers, prioritize high-GPA gen eds outside hard sciences
      filtered = geneds.filter((c: any) => !["PHYS","CHEM","BIOS","MATH"].includes(c.subject));
    }

    const content = `=== GEN ED COURSES${matched ? ` — ${matched}` : " (all categories)"} ===\n` +
      `Six categories: ${cats.join(" | ")}\n\n` +
      filtered.slice(0, 40).map((c: any) =>
        `${c.subject} ${c.number} - ${c.title}: GPA ${c.avgGpa ?? "N/A"}, ${diffLabel(c.difficultyScore)}, [${c.genEdCategory}]`
      ).join("\n");
    return [makeChunk("gen_ed", content, 0.95, query)];
  } catch { return []; }
}

async function retrieveProfessors(intent: any, query: QueryAnalysis): Promise<RetrievedChunk[]> {
  const chunks: RetrievedChunk[] = [];
  try {
    if (intent.profNameHint) {
      const result = await fetchProfessorWithCourseRankings(intent.profNameHint);
      if (result) {
        const { prof, courses } = result;
        const content = `=== PROFESSOR: ${prof.name} ===\n` +
          `Dept: ${prof.department} | RMP: ${prof.rmpQuality ?? "N/A"}/5 | Difficulty: ${prof.rmpDifficulty ?? "N/A"}/5\n` +
          `Reviews: ${prof.rmpRatingsCount ?? 0} | Would take again: ${prof.rmpWouldTakeAgain ?? "N/A"}%\n` +
          (prof.aiSummary ? `Student consensus: ${prof.aiSummary.slice(0, 300)}\n` : "") +
          `Courses: ${courses.map((c: any) => c.label).join(", ")}`;
        chunks.push(makeChunk("professors", content, 0.98, query));
      }
    }
    const deptFilter = intent.deptName || (intent.major ? intent.major.label : null);
    const profs = await fetchProfessorsByDept(deptFilter, 20);
    if (profs.length > 0) {
      const content = `=== ${deptFilter ? `PROFESSORS — ${deptFilter}` : "TOP RATED PROFESSORS"} ===\n` +
        profs.map((p: any, i: number) =>
          `${i + 1}. ${p.name} (${p.department}) | ${p.rmpQuality ?? "N/A"}/5 | Diff: ${p.rmpDifficulty ?? "N/A"}/5 | ${p.rmpRatingsCount ?? 0} reviews | Would take again: ${p.rmpWouldTakeAgain ?? "N/A"}%`
        ).join("\n");
      chunks.push(makeChunk("professors", content, 0.9, query));
    }
  } catch { /* tolerate */ }
  return chunks;
}

async function retrieveMajorPlan(query: QueryAnalysis): Promise<RetrievedChunk[]> {
  try {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const data = JSON.parse(readFileSync(join(process.cwd(), "public/data/uic-knowledge/major-requirements.json"), "utf8"));
    const lower = query.rawQuery.toLowerCase();

    const majorMatch = data.majors?.find((m: any) => {
      const n = m.name.toLowerCase();
      return lower.includes(n) ||
        (n.includes("computer science") && (lower.includes(" cs ") || lower.includes("cs major") || lower.includes("computer science"))) ||
        (n.includes("biology") && lower.includes("biol")) ||
        (n.includes("psychology") && lower.includes("psych")) ||
        (n.includes("kinesiology") && lower.includes("kin")) ||
        (n.includes("nursing") && lower.includes("nurs")) ||
        (n.includes("accounting") && lower.includes("account")) ||
        (n.includes("finance") && lower.includes("finance")) ||
        (n.includes("marketing") && lower.includes("marketing")) ||
        (n.includes("chemistry") && lower.includes("chem") && !lower.includes("biochem")) ||
        (n.includes("mechanical engineering") && lower.includes("mechanical")) ||
        (n.includes("electrical engineering") && lower.includes("electrical")) ||
        (n.includes("civil engineering") && lower.includes("civil")) ||
        (n.includes("bioengineering") && lower.includes("bioengin")) ||
        (n.includes("public health") && lower.includes("public health"));
    });

    if (!majorMatch) {
      const list = data.majors?.slice(0, 40).map((m: any) => `- ${m.name}`).join("\n") || "";
      return [makeChunk("major_plan", `=== AVAILABLE MAJORS FOR 4-YEAR PLANS ===\n${list}\n\nSpecify your major for a detailed plan.`, 0.7, query)];
    }

    const required = majorMatch.requiredCourses.slice(0, 50).map((c: any) => `${c.code}: ${c.title} (${c.hours} hrs)`).join("\n");
    const schedule = majorMatch.sampleSchedule?.length > 0
      ? majorMatch.sampleSchedule.map((s: any) => `${s.year} ${s.semester} (${s.total_hours || "?"} hrs): ${s.courses.join(", ")}`).join("\n")
      : "Build from required courses below.";

    let easyText = "";
    try {
      const subj = majorMatch.requiredCourses[0]?.subject;
      if (subj) {
        const easy = await fetchCoursesBySubjectOrDept(subj, null, 8, true);
        easyText = easy.map((c: any) => `${c.subject} ${c.number} ${c.title}: GPA ${c.avgGpa?.toFixed(2)}`).join("\n");
      }
    } catch { /* ok */ }

    const content = `=== ${majorMatch.name.toUpperCase()} — 4-YEAR DEGREE PLAN ===\n` +
      `Total hours: ${majorMatch.totalHours} | College: ${majorMatch.college}\n\n` +
      `REQUIRED COURSES:\n${required}\n\n` +
      `OFFICIAL SEMESTER SCHEDULE:\n${schedule}` +
      (easyText ? `\n\nEASIEST DEPT ELECTIVES (auto-select for optional slots):\n${easyText}` : "") +
      `\n\nINSTRUCTION: Build complete semester-by-semester plan. For optional slots, use easiest courses by GPA. Present as table with course codes.`;
    return [makeChunk("major_plan", content, 0.95, query)];
  } catch {
    return [makeChunk("major_plan", "Visit catalog.uic.edu for official degree requirements.", 0.3, query)];
  }
}

function retrieveTuition(ci: any, query: QueryAnalysis): RetrievedChunk[] {
  const bill = billingData as any;
  const chunks: RetrievedChunk[] = [];

  if (ci.isAboutTuition || ci.isAboutCostComparison || ci.isAboutDebt || query.domainConfidence["tuition"]) {
    const content = `=== UIC TUITION & COSTS 2025-2026 ===\n` +
      `In-state undergrad: ${bill.tuition_2025_2026?.undergraduate?.in_state_per_semester}/semester + ${bill.tuition_2025_2026?.mandatory_fees_per_semester} fees\n` +
      `Out-of-state undergrad: ${bill.tuition_2025_2026?.undergraduate?.out_of_state_per_semester}/semester + ${bill.tuition_2025_2026?.mandatory_fees_per_semester} fees\n` +
      `Per credit hour: ${bill.tuition_2025_2026?.undergraduate?.in_state_per_credit_hour} (in-state)\n` +
      `CampusCare health insurance: ${bill.tuition_2025_2026?.campuscare_annual}/year (waivable with outside insurance)\n` +
      `4-year tuition lock: YES — guaranteed for your entering cohort\n` +
      `Total COA: In-state on-campus ~$39,510 | In-state off-campus ~$37,410 | OOS on-campus ~$57,712\n` +
      `Bill due: Fall — ${bill.billing?.fall_due_date} | Spring — ${bill.billing?.spring_due_date}\n` +
      `Payment plan: Nelnet via UI-Pay, up to 6 installments. Late fee 1.5%/month.\n` +
      `COMPARISON: UIC cheaper than UIUC. More than NIU. Less than Loyola/DePaul.`;
    chunks.push(makeChunk("tuition", content, 0.97, query));
  }

  if (ci.isAboutFinancialAid || ci.isAboutResidency || query.domainConfidence["financial_aid"]) {
    const content = `=== FINANCIAL AID & SCHOLARSHIPS ===\n` +
      `Aspire Grant: 100% tuition + fees FREE for IL families earning under $75k. Apply via FAFSA by Mar 15. free.uic.edu\n` +
      `Chancellor's Fellows: $7,500/yr — 3.70+ GPA + ACT 33/SAT 1450. Deadline Nov 3.\n` +
      `President's Award: $5,000/yr or full tuition+housing for Honors Scholars. Deadline Feb 1.\n` +
      `Merit Tuition Award: $9,128/yr for out-of-state students (auto-reviewed).\n` +
      `Lake County IN / Tribal Nation: $16,102/yr in-state equivalent.\n` +
      `SnAP portal: snap.uic.edu — 500+ scholarships. Apply every semester.\n` +
      `FAFSA code: ${bill.financial_aid?.fafsa_school_code} | Priority deadline: ${bill.financial_aid?.fafsa_priority_deadline}\n` +
      `~65-79% of students receive aid. Average aid: ~$15,330. Average debt: ~$21,381 (43% borrow).\n` +
      `Emergency: U&I Care Fund up to ~$500 for enrolled students in hardship.\n` +
      `In-state residency: Independent students need 1 year in IL not as a student. F-1 visa = not eligible.`;
    chunks.push(makeChunk("financial_aid", content, 0.97, query));
  }
  return chunks;
}

function retrieveHousing(ci: any, query: QueryAnalysis): RetrievedChunk[] {
  const chunks: RetrievedChunk[] = [];
  const lower = query.rawQuery.toLowerCase();

  if (ci.isAboutHousing || lower.includes("dorm") || lower.includes("residence") || lower.includes("housing") || lower.includes("live on campus")) {
    try {
      const halls = (housingDiningData as any).housing.residence_halls;
      const costConstraint = query.constraints.find(c => c.type === "cost");
      const yearConstraint = query.constraints.find(c => c.type === "year");
      const majorConstraint = query.constraints.find(c => c.type === "major");
      const socialConstraint = query.constraints.find(c => c.type === "preference" && c.value === "social");

      // Score each hall by relevance to constraints
      const scoredHalls = halls.map((h: any) => {
        let score = 0.5;
        if (costConstraint && h.per_semester_approx) {
          const cheapness = h.abbreviation === "CMW" || h.abbreviation === "CMS" ? 0.3 : 0;
          score += cheapness * costConstraint.weight;
        }
        if (yearConstraint?.value.includes("fresh") && (h.abbreviation === "ARC" || h.abbreviation === "JST")) score += 0.2;
        if (majorConstraint?.value.includes("engineer") && (h.abbreviation === "ARC" || h.abbreviation === "JST")) score += 0.15;
        if (socialConstraint && (h.abbreviation === "ARC" || h.abbreviation === "JST" || h.abbreviation === "CMN")) score += 0.15;
        return { hall: h, score };
      }).sort((a: any, b: any) => b.score - a.score);

      const hallList = scoredHalls.map(({ hall: h }: any) => {
        const cost = typeof h.per_semester_approx === "object" && "range" in h.per_semester_approx
          ? (h.per_semester_approx as any).range
          : Object.entries(h.per_semester_approx || {}).filter(([k]) => k !== "range").map(([k, v]) => `${k.replace(/_/g, " ")}: $${v}`).join(", ");
        return `${h.name} (${h.abbreviation}): ${h.open_to} | Meal plan ${h.meal_plan_required ? "REQUIRED" : "optional"} | Cost: ${cost} | ${h.why_choose}`;
      }).join("\n");

      let guidance = "\n\nCONSTRAINT-BASED GUIDANCE:\n";
      if (costConstraint) guidance += `Budget: Cheapest options are CMW/CMS (~$5,275/sem, meal plan optional).\n`;
      if (yearConstraint?.value.includes("fresh")) guidance += `Freshmen: ARC and JST are most popular, offer LLCs, meal plan required.\n`;
      if (majorConstraint?.value.includes("engineer")) guidance += `Engineering students: JST and ARC are closest to engineering buildings on east campus.\n`;
      if (socialConstraint) guidance += `Social environment: ARC, JST, and CMN have the most community programming.\n`;

      guidance += `No meal plan required: MRH, TBH, SSR, PSR\nOff-campus vs on-campus: On-campus adds ~$10-18k/yr but includes meals and proximity.\nApply: housing.uic.edu | $50 app fee + $80/sem tech fee. Self-select room.`;

      const content = `=== UIC RESIDENCE HALLS ===\n${hallList}${guidance}`;
      chunks.push(makeChunk("housing", content, 0.97, query));
    } catch { /* tolerate */ }
  }

  if (ci.isAboutLLC || lower.includes("llc") || lower.includes("living learning")) {
    const content = `=== LIVING LEARNING COMMUNITIES ===\n` +
      `ARC: Future Leaders of Healthcare, Creators of Community Impact, Evans Scholars\n` +
      `JST: Innovate (innovation+entrepreneurship), PAP STEM, DuSable Scholars, Ventures in Business, SISTERS, Bayt Al Iman, Honors, La Casa, LEAD ASIA\n` +
      `CTY: Spectrum (LGBTQ+ inclusive) | MRH: PBMA\n` +
      `Benefits: Faculty mentors, peer community, priority tutoring, themed programming`;
    chunks.push(makeChunk("housing", content, 0.9, query));
  }

  if (ci.isAboutOffCampus || lower.includes("off campus") || lower.includes("apartment")) {
    const content = `=== OFF-CAMPUS HOUSING ===\n` +
      `Tool: offcampushousing.uic.edu\n` +
      `University Village/Little Italy: Closest, walkable. ~$900-1,400/mo 1BR.\n` +
      `Medical District: Best for west campus. ~$1,000-1,600/mo.\n` +
      `Pilsen: Affordable, cultural. ~$800-1,200/mo. 1-2 Pink Line stops.\n` +
      `West Loop: Newer, pricier. ~$1,500-2,500/mo.\n` +
      `Cost comparison: Off-campus typically saves $3-8k/yr vs on-campus after meal plan.\n` +
      `CTA pass: $163/semester (already included in fees for on-campus students).`;
    chunks.push(makeChunk("housing", content, 0.9, query));
  }
  return chunks;
}

function retrieveDining(ci: any, query: QueryAnalysis): RetrievedChunk[] {
  const chunks: RetrievedChunk[] = [];
  if (ci.isAboutDining) {
    const content = `=== DINING LOCATIONS ===\n` +
      `605 Commons (SCE): Full dining hall. Mon-Fri 7:30AM-8PM, Sat-Sun 10AM-8PM.\n` +
      `JST Cafe: Full dining. Similar hours.\n` +
      `SCE: Chick-fil-A | Panda Express (10AM-8PM) | Dunkin (6:30AM-10PM) | Market at Halsted (24 HOURS) | Sushi Do | Subway | Halal Shack | Moe's\n` +
      `SCW: Starbucks (7AM-4PM) | Harold's Chicken | Lotus Cafe | Mex Sabor | Wild Blue Sushi\n` +
      `Other: Starbucks ARC (7AM-7PM) | Market at Morgan (8AM-6PM)\n` +
      `24-hour: Market at Halsted | Halal: Halal Shack SCE\n` +
      `Off-campus: Al's Italian Beef (1079 W Taylor) | Mario's Italian Lemonade (1068 W Taylor) | Pompei (1531 W Taylor)`;
    chunks.push(makeChunk("dining", content, 0.95, query));
  }
  if (ci.isAboutMealPlan) {
    const content = `=== MEAL PLANS 2025-2026 ===\n` +
      `Required for: ARC, CTY, CMN, CMW, CMS, JST | Optional for: MRH, TBH, SSR, PSR\n` +
      `Ignite Unlimited: $2,800/sem — unlimited swipes + $400 Flames Fare + 50 exchanges + 5 guest passes\n` +
      `Ignite 15: $2,060/sem — 15 swipes/week + $50 Flames Fare\n` +
      `Ignite 160: $2,350/sem — 160 swipes + $750 Flames Fare + 30 exchanges\n` +
      `Blaze 160 (commuters): $2,260/sem | Blaze 80: $1,150/sem | Blaze 30: $370/sem\n` +
      `Flames Fare rolls fall->spring->summer. Plan changes: first 10-14 days only.`;
    chunks.push(makeChunk("dining", content, 0.95, query));
  }
  return chunks;
}

function retrieveStudentLife(query: QueryAnalysis): RetrievedChunk[] {
  const sl2 = studentLifeExpandedData as any;
  const lower = query.rawQuery.toLowerCase();
  const isAboutGreek = lower.includes("greek") || lower.includes("frat") || lower.includes("soror") || lower.includes("rush");
  const sparkArtists = sl2.major_events?.spark_festival?.past_artists?.slice(0, 8).join(", ") || "Kid Cudi, Kendrick Lamar, J. Cole, Twenty One Pilots";

  let c = `=== UIC STUDENT LIFE ===\n${sl2.student_orgs?.total || "470+"} registered student orgs at connect.uic.edu.\n\n`;

  c += `GREEK LIFE (5 councils, 30+ chapters):\n` +
    `IFC: Phi Kappa Psi, Delta Sigma Phi, Pi Kappa Phi, Tau Kappa Epsilon, Lambda Chi Alpha, Sigma Pi + more\n` +
    `CPC: Alpha Phi, Delta Gamma, Phi Sigma Sigma, Sigma Sigma Sigma, Alpha Omicron Pi, Delta Phi Epsilon + more\n` +
    `NPHC (Divine Nine): Alpha Phi Alpha, Kappa Alpha Psi, Omega Psi Phi, Alpha Kappa Alpha, Delta Sigma Theta, Zeta Phi Beta, Sigma Gamma Rho\n` +
    `GPAAC/LGC: Sigma Lambda Beta, Lambda Theta Phi, Sigma Lambda Gamma, Lambda Theta Alpha, Delta Xi Phi, Theta Lambda Beta + more\n` +
    `Instagram: @uicfsl | @ifcuic | @nphc_at_uic\n\n`;

  if (!isAboutGreek) {
    c += `MAJOR EVENTS: Spark Festival (fall, past: ${sparkArtists}) | Homecoming (fall) | Weeks of Welcome (WOW) | Involvement Fair (each semester) | Flames Finish Strong (finals)\n\n`;
    c += `CULTURAL CENTERS: AARCC (723 W Maxwell) | Arab American CC (B01 BSB) | Black Cultural Center (209 Addams) | Disability CC (235 BSB) | Gender & Sexuality Center (181 BSB) | Latino Cultural Center (LC B2) | WLRC (SSB 1700)\n\n`;
  }

  c += `STUDY SPOTS: Daley Library quiet floors 3+4 + Circle Reading Room | SCE Lounges | CSRC (commuter lounge hidden gem)\n` +
    `EMERGENCY: Pop-Up Pantry (free food) | U&I Care Fund (~$500 aid) | Basic Needs: dos.uic.edu\n` +
    `APPS: my.UIC | UIC Connection | UIC Safe | UIC Ride | IMLeagues | Handshake`;

  return [makeChunk("student_life", c, 0.9, query)];
}

async function retrieveAthletics(query: QueryAnalysis): Promise<RetrievedChunk[]> {
  const chunks: RetrievedChunk[] = [];
  try {
    const ath = athleticsData as any;
    const lower = query.rawQuery.toLowerCase();

    // ── Person lookup: player or coach name mentioned ──────────────────────
    const allTeams = [...ath.teams.mens, ...ath.teams.womens];
    const isPersonQuery = lower.match(/\bwho is\b|\bwho('s| is)\b|\btell me about\b|\babout\b/);

    // Search rosters for the person
    const allRosters: Record<string, string[]> = ath.current_rosters_2025_2026 ?? {};
    for (const [rosterKey, players] of Object.entries(allRosters)) {
      if (rosterKey === "note") continue;
      const playerList = players as string[];
      const matched = playerList.filter((p: string) => lower.includes(p.toLowerCase().split(" ").pop()!.toLowerCase()) || lower.includes(p.toLowerCase()));
      if (matched.length > 0) {
        // Find the team this roster belongs to
        const teamLabel = rosterKey.replace(/_/g, " ");
        const teamInfo = allTeams.find((t: any) =>
          rosterKey.includes(t.sport.toLowerCase().replace(/\s/g, "_")) ||
          t.sport.toLowerCase().includes(rosterKey.replace(/_/g, " "))
        );
        chunks.push(makeChunk("athletics",
          `${matched.join(", ")} — UIC Flames ${teamLabel}${teamInfo ? ` | Coach: ${teamInfo.coach}${teamInfo.notes ? ` | ${teamInfo.notes}` : ""}` : ""}`,
          0.99, query));
      }
    }

    // Search coach names and team notes
    for (const team of allTeams) {
      const coachLower = (team.coach ?? "").toLowerCase();
      const notesLower = (team.notes ?? "").toLowerCase();
      const teamNameLower = (team.sport ?? "").toLowerCase();
      if (lower.includes(coachLower.split(" ").pop() ?? "__") ||
          (isPersonQuery && (notesLower.split(/\s+/).some((w: string) => w.length > 4 && lower.includes(w))))) {
        const gender = ath.teams.mens.includes(team) ? "Men's" : "Women's";
        chunks.push(makeChunk("athletics",
          `${gender} ${team.sport}: Coach ${team.coach}${team.conference ? ` | Conference: ${team.conference}` : ""}${team.venue ? ` | Venue: ${team.venue}` : ""}${team.notes ? `\n${team.notes}` : ""}`,
          0.99, query));
      }
    }

    // ── Sport-specific query ───────────────────────────────────────────────
    const sportMatch = allTeams.find((t: any) => lower.includes(t.sport.toLowerCase()) ||
      (t.sport.toLowerCase().includes("tennis") && lower.includes("tennis")) ||
      (t.sport.toLowerCase().includes("basketball") && lower.match(/basketball|mbb|wbb/)) ||
      (t.sport.toLowerCase().includes("soccer") && lower.includes("soccer")) ||
      (t.sport.toLowerCase().includes("baseball") && lower.includes("baseball")) ||
      (t.sport.toLowerCase().includes("volleyball") && lower.includes("volleyball")));

    if (sportMatch && chunks.length === 0) {
      const gender = ath.teams.mens.includes(sportMatch) ? "Men's" : "Women's";
      const roster = allRosters[`${gender.toLowerCase().replace("'s","")}_${sportMatch.sport.toLowerCase().replace(/\s/g,"_")}`] as string[] | undefined;
      chunks.push(makeChunk("athletics",
        `${gender} ${sportMatch.sport}: Coach ${sportMatch.coach}${sportMatch.conference ? ` | Conference: ${sportMatch.conference}` : ""}${sportMatch.venue ? ` | Venue: ${sportMatch.venue}` : ""}${sportMatch.notes ? `\n${sportMatch.notes}` : ""}${roster ? `\nRoster: ${roster.join(", ")}` : ""}`,
        0.97, query));
    }

    // ── Recent results ─────────────────────────────────────────────────────
    if (lower.match(/result|score|win|loss|won|lost|last game|season|record/)) {
      const results = Object.entries(ath.recent_results_2025_2026 as Record<string, string>)
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join("\n");
      chunks.push(makeChunk("athletics", `RECENT RESULTS 2025-2026:\n${results}`, 0.95, query));
    }

    // ── General overview if nothing specific matched ───────────────────────
    if (chunks.length === 0) {
      const content = `UIC FLAMES ATHLETICS — Conference: MVC | Website: UICFlames.com\n` +
        `TICKETS: FREE for students with UIC ID (regular season home events)\n` +
        `Flames Fast Pass: $50 — all home events except basketball\n\n` +
        `TEAMS:\n` +
        ath.teams.mens.map((t: any) => `Men's ${t.sport}: Coach ${t.coach}${t.notes ? ` — ${t.notes}` : ""}`).join("\n") + "\n" +
        ath.teams.womens.map((t: any) => `Women's ${t.sport}: Coach ${t.coach}${t.notes ? ` — ${t.notes}` : ""}`).join("\n");
      chunks.push(makeChunk("athletics", content, 0.9, query));
    }

    // ── Recent news (basketball queries) ──────────────────────────────────
    if (lower.match(/basketball|mbb|wbb|flames/)) {
      const news = await fetchRecentNews("basketball", 4).catch(() => []);
      if (news.length > 0) {
        const nc = `RECENT FLAMES NEWS:\n` +
          news.map((n: any) => `[${n.publishedAt.toLocaleDateString()}] ${n.title}${n.aiSummary ? ": " + n.aiSummary.slice(0, 100) : ""}`).join("\n");
        chunks.push(makeChunk("news", nc, 0.85, query));
      }
    }
  } catch { /* tolerate */ }
  return chunks;
}

function retrieveCampusMap(query: QueryAnalysis): RetrievedChunk[] {
  const b = buildingsData as any;
  const lower = query.rawQuery.toLowerCase();
  const chunks: RetrievedChunk[] = [];

  // ── Specific office lookups — SSB offices ──────────────────────────────
  const offices = b.important_offices;
  if (lower.match(/\bregistrar\b/)) {
    const o = offices.registrar;
    chunks.push(makeChunk("campus_map", `REGISTRAR: ${o.location} | Hours: ${o.hours} | ${o.website}`, 0.99, query));
  }
  if (lower.match(/financial aid|fin(ancial)? aid/)) {
    const o = offices.financial_aid;
    chunks.push(makeChunk("campus_map", `FINANCIAL AID: ${o.location} | ${o.website}`, 0.99, query));
  }
  if (lower.match(/\badmission(s)?\b/)) {
    const o = offices.admissions;
    chunks.push(makeChunk("campus_map", `ADMISSIONS: ${o.location} | Visitors center: ${o.visitors_center} | ${o.website}`, 0.99, query));
  }
  if (lower.match(/dean of students|dos\b/)) {
    const o = offices.dean_of_students;
    chunks.push(makeChunk("campus_map", `DEAN OF STUDENTS: ${o.location} | ${o.website}`, 0.99, query));
  }
  if (lower.match(/\bbursar\b/)) {
    const o = offices.bursar;
    chunks.push(makeChunk("campus_map", `BURSAR: ${o.location}`, 0.99, query));
  }
  if (lower.match(/career service|career center/)) {
    const o = offices.career_services;
    chunks.push(makeChunk("campus_map", `CAREER SERVICES: ${o.location} | Hours: ${o.hours} | Appointments: ${o.appointment} | ${o.website}`, 0.99, query));
  }
  if (lower.match(/study abroad/)) {
    const o = offices.study_abroad;
    chunks.push(makeChunk("campus_map", `STUDY ABROAD: ${o.location} | ${o.website}`, 0.99, query));
  }
  if (lower.match(/\bois\b|international service|international student office/)) {
    const o = offices.international_services_OIS;
    chunks.push(makeChunk("campus_map", `OFFICE OF INTERNATIONAL SERVICES (OIS): ${o.location} | Hours: ${o.hours}`, 0.99, query));
  }
  if (lower.match(/\bdrc\b|disability resource/)) {
    const o = offices.disability_resource_center;
    chunks.push(makeChunk("campus_map", `DRC: ${o.location} | Phone: ${o.phone} | Email: ${o.email} | Hours: ${o.hours}`, 0.99, query));
  }
  if (lower.match(/writing center/)) {
    const o = offices.writing_center;
    chunks.push(makeChunk("campus_map", `WRITING CENTER: ${o.location} | Hours: ${o.hours} | Appointments: ${o.appointment}`, 0.99, query));
  }
  if (lower.match(/\bmslc\b|math.*science.*learning|science.*learning center|tutoring center/)) {
    const o = offices.math_science_learning_center_MSLC;
    chunks.push(makeChunk("campus_map", `MSLC (Math & Science Learning Center): ${o.location} | Hours: ${o.hours} | ${o.cost}`, 0.99, query));
  }

  // ── Building lookups from key_buildings ──────────────────────────────────
  const kb = b.key_buildings;
  if (lower.match(/\bssb\b|student services building/)) {
    const ssb = kb.student_services[0];
    chunks.push(makeChunk("campus_map",
      `SSB (Student Services Building): ${ssb.address}\nContains: ${Array.isArray(ssb.whats_inside) ? ssb.whats_inside.join(", ") : ssb.whats_inside}`,
      0.99, query));
  }
  if (lower.match(/daley library|\blib\b|main library/)) {
    const lib = kb.libraries[0];
    chunks.push(makeChunk("campus_map", `DALEY LIBRARY: ${lib.address} | Hours: ${lib.hours}\n${lib.whats_inside}`, 0.98, query));
  }
  if (lower.match(/lhs|library.*health|health.*library/)) {
    const lhs = kb.libraries[1];
    chunks.push(makeChunk("campus_map", `LHS (Library of Health Sciences): ${lhs.address} | Hours: ${lhs.hours}\n${lhs.whats_inside}`, 0.98, query));
  }
  if (lower.match(/\bsce\b|student center east/)) {
    const sce = kb.student_centers[0];
    chunks.push(makeChunk("campus_map", `SCE (Student Center East): ${sce.address}\nContains: ${(sce.whats_inside as string[]).join(", ")}`, 0.98, query));
  }
  if (lower.match(/\bscw\b|student center west/)) {
    const scw = kb.student_centers[1];
    chunks.push(makeChunk("campus_map", `SCW (Student Center West): ${scw.address}\nContains: ${(scw.whats_inside as string[]).join(", ")}`, 0.98, query));
  }
  if (lower.match(/\bsrf\b|student rec|rec facility/)) {
    const srf = kb.recreation[0];
    chunks.push(makeChunk("campus_map", `SRF (Student Recreation Facility): ${srf.address} | ${srf.whats_inside}`, 0.98, query));
  }
  if (lower.match(/\bsfc\b|sport.*fitness|fitness.*center.*west/)) {
    const sfc = kb.recreation[1];
    chunks.push(makeChunk("campus_map", `SFC (Sport and Fitness Center): ${sfc.address} | ${sfc.whats_inside}`, 0.98, query));
  }

  // ── Transportation ────────────────────────────────────────────────────────
  if (lower.match(/\bcta\b|blue line|pink line|\bbus\b|train|transit|how (do i )?get (to|there)/)) {
    const t = b.transportation;
    const trains = t.cta_trains.map((s: any) => `${s.line} — ${s.station}: closest to ${s.closest_to}`).join("\n");
    const buses = t.key_cta_buses.slice(0, 4).map((s: any) => `${s.route}: ${s.notes}`).join("\n");
    chunks.push(makeChunk("transportation",
      `CTA TO UIC:\n${trains}\n\nKEY BUSES:\n${buses}`,
      0.97, query));
  }
  if (lower.match(/shuttle|night ride|intracampus/)) {
    const s = b.transportation.shuttles;
    chunks.push(makeChunk("transportation",
      `SHUTTLES:\nIntracampus (east↔west): ${s.intracampus_route.hours}\nNight Ride: ${s.night_ride.hours} — ${s.night_ride.description} — Use UIC Ride app. Coverage: ${s.night_ride.coverage}`,
      0.97, query));
  }
  if (lower.match(/\bparking\b|garage|permit/)) {
    const p = b.parking;
    chunks.push(makeChunk("campus_map",
      `PARKING: Semester permit $${p.semester_permit}. Visitor: $${p.visitor_rates["0_to_1_hour"]}/hr.\nEast campus garages: ${p.east_campus_garages.map((g: any) => `${g.name} (${g.address}) — ${g.best_for}`).join(" | ")}\nWest campus: ${p.west_campus_garages.map((g: any) => `${g.name} — ${g.best_for}`).join(" | ")}`,
      0.95, query));
  }

  // ── Fallback: general campus overview ────────────────────────────────────
  if (chunks.length === 0) {
    const layout = b.campus_layout;
    const nav = b.quick_navigation;
    chunks.push(makeChunk("campus_map",
      `CAMPUS OVERVIEW:\nEast Campus (Halsted/Harrison): ${layout.east_campus}\nWest Campus (Medical District): ${layout.west_campus}\n\nQUICK NAV:\n${Object.entries(nav).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join("\n")}`,
      0.88, query));
  }

  return chunks;
}

function retrieveHealth(query: QueryAnalysis): RetrievedChunk[] {
  const h = healthData as any;
  const hs = h.health_services;
  const lower = query.rawQuery.toLowerCase();
  const chunks: RetrievedChunk[] = [];

  const isCounseling = lower.match(/counsel|therapy|therapist|mental health|anxiety|depression|psychiatry|emotional|stress|grief|trauma|talk to someone/);
  const isDRC = lower.match(/\bdrc\b|disability|accommodation|accommodations|ada\b/);
  const isInsurance = lower.match(/campuscare|campus care|insurance|waiver|health insurance/);
  const isPharmacy = lower.match(/pharmacy|prescription|medication|med(s)?\b/);
  const isDental = lower.match(/dental|dentist|dentistry|teeth|tooth/);
  const isClinic = lower.match(/clinic|doctor|sick|appointment|primary care|urgent care|health service/);
  const isRecreation = lower.match(/\bgym\b|rec center|srf\b|sfc\b|workout|fitness|pool|intramural|sport club|climbing/);

  // ── Counseling — pulled directly from structured JSON ──
  if (isCounseling) {
    const cc = hs.counseling_center;
    chunks.push(makeChunk("health",
      `COUNSELING CENTER: ${cc.address} | Phone: ${cc.phone} | Hours: ${cc.hours}\nCost: ${cc.cost}\nCrisis line (24/7): ${cc.crisis_line}\nAppointments: ${cc.appointments}`,
      0.99, query));
  }

  // ── DRC — pulled directly from structured JSON ──
  if (isDRC) {
    const drc = hs.disability_resource_center;
    chunks.push(makeChunk("health",
      `DISABILITY RESOURCE CENTER (DRC): ${drc.address} | Phone: ${drc.phone} | Email: ${drc.email} | Hours: ${drc.hours}\nHow to register: ${drc.how_to_register}`,
      0.99, query));
  }

  // ── Health clinic ──
  if (isClinic || (!isCounseling && !isDRC && !isInsurance && !isPharmacy && !isDental && !isRecreation)) {
    const mc = hs.main_clinic;
    chunks.push(makeChunk("health",
      `HEALTH CLINIC (${mc.name}): ${mc.address} | Phone: ${mc.phone} | Hours: ${mc.hours}\nCost: ${mc.cost}`,
      0.98, query));
  }

  // ── CampusCare insurance ──
  if (isInsurance) {
    const cc = hs.campuscare;
    const bill = billingData as any;
    chunks.push(makeChunk("health",
      `CAMPUSCARE INSURANCE: ${cc.what_it_is}\nCost: ~$${bill.campuscare?.annual_cost ?? "1,394"}/year. Waiver deadline — Fall: ${bill.campuscare?.waiver_deadline_fall} | Spring: ${bill.campuscare?.waiver_deadline_spring}\n${cc.waiver}`,
      0.98, query));
  }

  // ── Pharmacy ──
  if (isPharmacy) {
    const pharms = hs.pharmacy as any[];
    chunks.push(makeChunk("health",
      `PHARMACY:\n${pharms.map((p: any) => `${p.name}: ${p.address} | ${p.phone} | ${p.hours}`).join("\n")}`,
      0.97, query));
  }

  // ── Dental ──
  if (isDental) {
    const d = hs.dental;
    chunks.push(makeChunk("health",
      `DENTAL (${d.name}): ${d.address} | Phone: ${d.phone}\n${d.note}`,
      0.97, query));
  }

  // ── Recreation (SRF/SFC) ──
  if (isRecreation) {
    chunks.push(makeChunk("recreation",
      `REC CENTERS (FREE for fee-paying students):\nSRF (east campus): 737 S Halsted | Mon-Thu 6AM-11PM, Fri 6AM-9PM, Sat-Sun 9AM-9PM\nSFC (west campus): 828 S Wolcott | Same hours\nFacilities: 18,000 sq ft gym, pool, sauna, steam, track, racquetball, climbing wall\nINTRAMURALS (free): Basketball, Soccer, Volleyball, Flag Football, Pickleball — IMLeagues.com`,
      0.95, query));
  }

  // ── Fallback: return overview if nothing specific matched ──
  if (chunks.length === 0) {
    const mc = hs.main_clinic;
    const cc = hs.counseling_center;
    const drc = hs.disability_resource_center;
    chunks.push(makeChunk("health",
      `HEALTH SERVICES OVERVIEW:\nHealth Clinic: ${mc.address} | ${mc.phone}\nCounseling Center: ${cc.address} | ${cc.phone} | ${cc.cost}\nDRC: ${drc.address} | ${drc.phone}\nPharmacy: ${(hs.pharmacy as any[])[0].address} | ${(hs.pharmacy as any[])[0].phone}\nUrgent Care: ${hs.urgent_care.address}`,
      0.92, query));
  }

  return chunks;
}

function retrieveCalendar(query: QueryAnalysis): RetrievedChunk[] {
  const cal = academicCalendarData as any;
  const fall = cal.academic_calendar?.fall_2025;
  const spring = cal.academic_calendar?.spring_2026;
  let c = `=== ACADEMIC CALENDAR & POLICIES ===\n`;
  // Use health-academics.json which has the exact deadline field names
  const ha = healthData as any;
  const haFall = ha.academic_calendar?.fall_2025;
  const haSpring = ha.academic_calendar?.spring_2026;

  if (haFall) {
    const kd = haFall.key_deadlines;
    c += `FALL 2025: Starts ${haFall.semester_start} | Add/drop (no W): ${kd.last_day_add_drop_no_W_16week} | Last day to withdraw (W): ${kd.last_day_withdraw_with_W_16week} | Finals: ${haFall.finals} | Spring reg opens: ${kd.spring_registration_opens}\n`;
  } else if (fall) {
    c += `FALL 2025: Starts ${fall.first_day} | Add/drop: ${fall.last_day_to_add} | Withdraw: ${fall.last_day_to_withdraw_W} | Finals: ${fall.finals_start}-${fall.finals_end} | Spring reg: ${fall.spring_registration_opens}\n`;
  }
  if (haSpring) {
    const kd = haSpring.key_deadlines;
    c += `SPRING 2026: Starts ${haSpring.semester_start} | Add/drop (no W): ${kd.last_day_add_drop_no_W_16week} | Last day to withdraw (W): ${kd.last_day_withdraw_with_W_16week} | Spring break: ${haSpring.spring_break} | Finals: ${haSpring.finals} | Summer/Fall reg opens: ${kd.summer_fall_registration_opens}\n`;
  } else if (spring) {
    c += `SPRING 2026: Starts ${spring.first_day} | Spring break: ${spring.spring_break_start}-${spring.spring_break_end} | Withdraw: ${spring.last_day_to_withdraw_W} | Finals: ${spring.finals_start}-${spring.finals_end} | Summer/Fall reg: ${spring.summer_fall_registration_opens}\n`;
  }
  if (cal.academic_calendar?.commencement) {
    const comm = cal.academic_calendar.commencement;
    c += `Commencement Spring 2026: ${comm.spring_2026_date} at ${comm.location}. Apply by ${comm.application_to_graduate_deadline}\n`;
  }
  if (cal.final_exam_schedule?.blocks?.length) {
    c += `\nFINAL EXAM BLOCKS:\n` +
      cal.final_exam_schedule.blocks.map((b: any) =>
        `${b.class_start_time_window}: T/Th -> ${b.tuesday_thursday_exam_block} | MWF -> ${b.monday_wednesday_friday_and_4_5_day_exam_block}`
      ).join("\n") + "\n";
  }

  // Registration details from health-academics.json
  if (ha.registration) {
    const reg = ha.registration;
    c += `\nREGISTRATION: ${reg.system} | ${reg.availability}\nTime tickets: ${reg.time_tickets}\nWaitlist: ${reg.waitlist}\nAdd/drop: ${reg.add_drop}\n`;
  } else {
    c += `\nREGISTRATION: Banner XE at my.UIC.edu | Time tickets by credit hours (grad first, then seniors->freshmen)\nWaitlist: 24hrs to claim. Miss it = back to bottom. Max 4 W withdrawals/degree.\n`;
  }

  // Academic policies from health-academics.json
  if (ha.academic_policies) {
    const ap = ha.academic_policies;
    const lh = ap.latin_honors;
    c += `\nACADEMIC POLICIES:\nGPA floor: ${ap.gpa_to_stay_enrolled}\nGraduation: ${ap.graduation_requirements.minimum_hours}, GPA ${ap.graduation_requirements.minimum_gpa}, ${ap.graduation_requirements.gen_ed}\nLatin Honors: Cum Laude ${lh.cum_laude} | Magna ${lh.magna_cum_laude} | Summa ${lh.summa_cum_laude}\nGrade replacement: ${ap.grade_replacement}\nWithdrawal limit: ${ap.withdrawal_limit}`;
  } else {
    c += `\nACADEMIC POLICIES:\nGrading: A=4.0, B=3.0, C=2.0, D=1.0, F=0.0\nGPA floor: 2.00 | Graduation: 120+ hrs, 2.00 GPA, 24+ gen ed hrs, last 30 at UIC\nLatin Honors: Cum Laude 3.50+ | Magna 3.75+ | Summa 3.90+`;
  }

  return [makeChunk("calendar", c, 0.95, query)];
}

function retrieveAdvising(query: QueryAnalysis): RetrievedChunk[] {
  const ad = advisingData as any;
  const lower = query.rawQuery.toLowerCase();
  const chunks: RetrievedChunk[] = [];

  // College advising office lookup
  const collegeMatch = ad.college_offices?.find((o: any) => {
    const name = o.college.toLowerCase();
    return lower.includes(name) ||
      (name.includes("engineering") && lower.match(/engineer|ece|me\b|bme|civil|chemical/)) ||
      (name.includes("business") && lower.match(/business|accounting|finance|marketing|management/)) ||
      (name.includes("liberal arts") && lower.match(/liberal arts|las\b|english|history|psychology|sociology/)) ||
      (name.includes("nursing") && lower.includes("nursing")) ||
      (name.includes("applied health") && lower.match(/applied health|ahs\b/)) ||
      (name.includes("public health") && lower.match(/public health/)) ||
      (name.includes("honors") && lower.includes("honors"));
  });
  if (collegeMatch) {
    chunks.push(makeChunk("academic_policy",
      `ADVISING — ${collegeMatch.college}: ${collegeMatch.location}${collegeMatch.phone ? ` | ${collegeMatch.phone}` : ""}${collegeMatch.url ? ` | ${collegeMatch.url}` : ""}`,
      0.99, query));
  }

  // MSLC
  if (lower.match(/\bmslc\b|math.*learning|science.*learning|tutoring (for |in )?(math|chem|bios|phys|stat)/)) {
    const mslc = ad.tutoring?.mslc;
    if (mslc) {
      chunks.push(makeChunk("academic_policy",
        `MSLC (${mslc.name}): ${mslc.location} | Phone: ${mslc.phone} | Subjects: ${mslc.subjects.join(", ")} | Cost: FREE, no appointment needed`,
        0.99, query));
    }
  }

  // Writing Center
  if (lower.match(/writing center|essay help|writing help|paper help/)) {
    const wc = ad.tutoring?.writing_center;
    if (wc) {
      chunks.push(makeChunk("academic_policy",
        `WRITING CENTER: ${wc.location} | Hours: ${wc.hours} | Appointments: ${wc.appointment_url} | Cost: FREE`,
        0.99, query));
    }
  }

  // Career services
  if (lower.match(/career service|career center|internship|resume|handshake|job search/)) {
    const cs = ad.career_services;
    if (cs) {
      chunks.push(makeChunk("careers",
        `CAREER SERVICES: ${cs.location} | Phone: ${cs.phone} | Hours: ${cs.hours} | Drop-in: ${cs.drop_in} | Handshake: ${cs.handshake}`,
        0.99, query));
    }
  }

  // General advising overview
  if (chunks.length === 0) {
    chunks.push(makeChunk("academic_policy",
      `ADVISING: ${ad.central_advising.description} | ${ad.central_advising.url}\nCollege offices: ${ad.college_offices.map((o: any) => `${o.college}: ${o.location}${o.phone ? ` (${o.phone})` : ""}`).join(" | ")}`,
      0.88, query));
  }

  return chunks;
}

function retrieveAdmissions(query: QueryAnalysis): RetrievedChunk[] {
  const content = `=== UIC ADMISSIONS 2025-2026 ===\n` +
    `Common App | Test-optional | No enrollment deposit\n` +
    `First-Year: Priority Nov 3 | Regular Feb 2, 2026 | Spring Oct 1, 2025\n` +
    `Transfer: Fall Apr 1 | Spring Oct 15 | Min 24 credits at app, 36 by enrollment\n` +
    `Guaranteed Transfer: 3.0 GPA pathway at tag.uic.edu\n\n` +
    `SCHOLARSHIPS:\n` +
    `Aspire Grant: 100% tuition+fees for IL families under $75k income. Deadline Mar 15. free.uic.edu\n` +
    `Chancellor's Fellows: $7,500/yr (first-year) or $5,000/yr (transfer). Deadline Nov 3.\n` +
    `President's Award: $5,000/yr or full tuition+housing for Honors. Deadline Feb 1.\n` +
    `Merit Tuition Award: $9,128/yr for OOS students (auto-reviewed).\n\n` +
    `AFTER ADMISSION: Activate NetID | Placement tests (by June 30) | Apply housing (housing.uic.edu) | File FAFSA | Register orientation\n` +
    `Visits: discover.uic.edu | Admitted hub: bound.uic.edu`;
  return [makeChunk("admissions", content, 0.97, query)];
}

function retrieveCareers(query: QueryAnalysis): RetrievedChunk[] {
  const content = `=== CAREER SERVICES ===\n` +
    `SSB Suite 3050 | 312-996-2300 | Mon-Fri 8:30AM-5PM\n` +
    `Drop-in: Wed in-person 12-2PM | Thu virtual 2-4PM | Jobs/internships: uic.joinhandshake.com\n` +
    `Services: Resume/CV, cover letters, mock interviews, salary negotiation\n\n` +
    `CAREER FAIRS: Fall Internship & Career | Winter Internship | Spring Internship & Career | Post-Graduation | Grad/Professional School\n\n` +
    `CAMPUS JOBS: $16-$21.51/hr (FY2026). F-1: up to 20hr/week on-campus (no authorization needed).\n` +
    `Graduate assistantships: 25-67% appointment = tuition waiver. Contact your dept DGS.`;
  return [makeChunk("careers", content, 0.9, query)];
}

function retrieveLibrary(query: QueryAnalysis): RetrievedChunk[] {
  const content = `=== LIBRARY ===\n` +
    `Daley: 801 S Morgan | 312-996-2724 | Quiet: 3rd+4th floors, Circle Reading Room\n` +
    `LHS Chicago: 1750 W Polk | 312-996-8966 | Quiet: 3rd floor, Room 107\n` +
    `Study rooms: libcal.uic.edu\n\n` +
    `BORROWING: Books — 16 weeks | Laptops/MacBooks — 7 days (i-card) | Calculators — 1 day\n` +
    `No fines until 39 days past due. Lost item: $125+\n` +
    `PRINTING: Wepa stations campus-wide.\n` +
    `ILL: I-Share IL libraries 3-5 days | ILLiad worldwide 7-10 days\n` +
    `Research help: ask.library.uic.edu | Guides: researchguides.uic.edu`;
  return [makeChunk("library", content, 0.9, query)];
}

function retrieveInternational(query: QueryAnalysis): RetrievedChunk[] {
  const intl = internationalData as any;
  const content = `=== INTERNATIONAL STUDENTS ===\n` +
    `OIS: SSB 2160 | ${intl.ois?.phone} | ${intl.ois?.email} | Mon-Fri 8:30AM-5PM\n\n` +
    `ARRIVAL: Immigration Check-In with OIS required. F-1: removes SEVIS hold. J-1: validate within 30 days.\n\n` +
    `WORK AUTH:\n` +
    `On-campus (F-1): Immediately, up to 20hr/week during school, full-time during breaks.\n` +
    `CPT: Academically required off-campus work — apply to OIS first.\n` +
    `OPT: Post-graduation. Apply 90 days before. STEM OPT extension: +24 months.\n\n` +
    `Travel signature: Must be <1 year old at re-entry. Request via myOIS.\n` +
    `Study abroad: UH Room 502 | 312-413-7662 | Credit = UIC credit. First Step presentation required.\n` +
    `CampusCare: Required. Waive before semester deadline with equivalent insurance.`;
  return [makeChunk("international", content, 0.95, query)];
}

function retrieveSafety(query: QueryAnalysis): RetrievedChunk[] {
  const saf = safetyData as any;
  const content = `=== SAFETY & POLICIES ===\n` +
    `Police: Emergency ${saf.police?.emergency} | Non-emergency ${saf.police?.non_emergency}\n` +
    `Safety Escort: 24/7 free — call ${saf.safety_escort?.phone}\n` +
    `UIC Safe app | UIC Alert (auto-email + optional phone via Rave)\n\n` +
    `Title IX: OAE (312) 996-8670 | CAN (confidential): (312) 413-8206\n\n` +
    `ACADEMIC INTEGRITY: Cheating, plagiarism, unauthorized AI, fabrication = violations.\n` +
    `AI policy: check your syllabus. Unauthorized AI use = academic dishonesty.\n\n` +
    `Student Legal Services: Free, confidential — dos.uic.edu/student-legal/\n` +
    `FERPA: Your records are private. Parents cannot access without your written consent.\n` +
    `Bias reporting: dos.uic.edu | Conduct: dos.uic.edu/community-standards/`;
  return [makeChunk("safety", content, 0.9, query)];
}

function retrieveInstagram(query: QueryAnalysis): RetrievedChunk[] {
  const ig = instagramData as any;
  const lower = query.rawQuery.toLowerCase();
  const stopPattern = /instagram|insta|\big\b|what|find|follow|social|media|is|the|for|does|have|a|an|their|account|page|handle/g;
  const words = lower.replace(stopPattern, " ").trim().split(/\s+/).filter((w: string) => w.length > 2);

  const matches = (ig.accounts || []).filter((a: any) => {
    const text = (a.name + " " + a.handle + " " + a.category).toLowerCase();
    return words.some((w: string) => text.includes(w));
  });

  if (matches.length > 0) {
    const content = `=== UIC INSTAGRAM ACCOUNTS ===\n` +
      matches.slice(0, 15).map((a: any) =>
        `${a.name}: ${a.handle}${a.confirmed ? " (verified)" : " (unverified)"}`
      ).join("\n");
    return [makeChunk("instagram", content, 0.98, query)];
  }

  const byCategory = ig.by_category as Record<string, any[]>;
  const overview = Object.entries(byCategory)
    .map(([cat, items]) => `${cat}: ${(items as any[]).slice(0, 3).map((a: any) => a.handle).join(", ")}${(items as any[]).length > 3 ? ` +${(items as any[]).length - 3}` : ""}`)
    .join("\n");
  return [makeChunk("instagram", `=== UIC INSTAGRAM DIRECTORY (${ig.total} accounts) ===\n${overview}`, 0.7, query)];
}

function retrieveRecreation(query: QueryAnalysis): RetrievedChunk[] {
  const content = `=== CAMPUS RECREATION ===\n` +
    `SRF (east, 737 S Halsted): Mon-Thu 6AM-11PM, Fri 6AM-9PM, Sat-Sun 9AM-9PM\n` +
    `SFC (west, 828 S Wolcott): Same hours | FREE for fee-paying students\n` +
    `Facilities: 18,000 sq ft gym, pool, sauna, steam, track, racquetball, climbing wall\n` +
    `INTRAMURALS (free): Basketball, Soccer, Volleyball, Flag Football, Pickleball, Dodgeball — IMLeagues.com\n` +
    `SPORT CLUBS: Boxing, Cricket, Fencing, Rugby, Taekwondo, Ultimate Frisbee + more\n` +
    `FITNESS CLASSES: Yoga, Zumba, HIIT, Spin, Boxing, Pilates, Bollywood, F45`;
  return [makeChunk("recreation", content, 0.9, query)];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 4: ANSWER BRIEF — structured reasoning object before model call
// ═══════════════════════════════════════════════════════════════════════════════

function buildAnswerBrief(
  query: QueryAnalysis,
  chunks: RetrievedChunk[]
): AnswerBrief {
  const sortedChunks = [...chunks].sort((a, b) =>
    (b.relevanceScore * b.sourceConfidence) - (a.relevanceScore * a.sourceConfidence)
  );

  // Extract key facts from top chunks (first sentence or key stat patterns)
  const keyFacts: string[] = [];
  for (const chunk of sortedChunks.slice(0, 4)) {
    const lines = chunk.content.split("\n").filter(l => l.trim() && !l.startsWith("==="));
    const statLines = lines.filter(l => l.match(/\$[\d,]+|GPA \d|\d+\/5|\d+%|Suite \d|^\d+\./));
    if (statLines.length > 0) keyFacts.push(statLines[0].trim());
    else if (lines[0]) keyFacts.push(lines[0].trim().slice(0, 120));
  }

  // Detect tradeoffs based on constraints + domains
  const tradeoffs: string[] = [];
  if (query.constraints.find(c => c.type === "cost") && chunks.some(c => c.domain === "housing")) {
    tradeoffs.push("Cheapest dorms (CMW/CMS) require meal plan which adds cost. MRH/TBH cheaper overall with optional meal plan.");
  }
  if (query.constraints.find(c => c.type === "cost") && chunks.some(c => c.domain === "financial_aid")) {
    tradeoffs.push("Aspire Grant covers 100% tuition+fees for IL families under $75k — check eligibility before comparing schools.");
  }
  if (chunks.some(c => c.domain === "housing") && chunks.some(c => c.domain === "tuition")) {
    tradeoffs.push("On-campus adds $10-18k/yr but includes meals and eliminates commute costs/time.");
  }
  if (query.constraints.find(c => c.type === "preference" && c.value === "social") && query.constraints.find(c => c.type === "cost")) {
    tradeoffs.push("Most social dorms (ARC, JST) require meal plans which are the most expensive option.");
  }

  // Recommended approach
  const approachMap: Partial<Record<AnswerMode, string>> = {
    ranking: "Present ranked options with specific metrics justifying the ranking. Name a winner.",
    comparison: "Structure as parallel criteria comparison. End with a clear recommendation.",
    recommendation: "Give a direct personalized recommendation based on the detected constraints.",
    logistics: "Lead with exact operational details: addresses, phone numbers, deadlines.",
    planning: "Build a complete structured plan with specific course codes and semester breakdown.",
    discovery: "Give a comprehensive overview with the most useful highlights.",
    hybrid: "Address each sub-intent in organized sections. Synthesize at the end.",
  };

  return {
    inferredGoal: query.primaryGoal,
    answerMode: query.answerMode,
    detectedConstraints: query.constraints,
    keyFacts: keyFacts.slice(0, 6),
    tradeoffs: tradeoffs.slice(0, 3),
    recommendedApproach: approachMap[query.answerMode] ?? "Answer directly and specifically.",
    domainsUsed: [...new Set(sortedChunks.map(c => c.domain))],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 5: CONTEXT ASSEMBLY — relevance-scored deduplication + token budget
// ═══════════════════════════════════════════════════════════════════════════════

function assembleContext(chunks: RetrievedChunk[], brief: AnswerBrief): string {
  // Score = relevance * source confidence, with boost for answer mode alignment
  const scored = chunks.map(c => ({
    ...c,
    finalScore: c.relevanceScore * 0.6 + c.sourceConfidence * 0.4,
  })).sort((a, b) => b.finalScore - a.finalScore);

  // Deduplicate by content fingerprint
  const seen = new Set<string>();
  const selected: typeof scored = [];
  let totalTokens = 0;
  const TOKEN_LIMIT = 4000;

  for (const chunk of scored) {
    const fingerprint = chunk.content.slice(0, 80);
    if (seen.has(fingerprint)) continue;
    if (totalTokens + chunk.tokenEstimate > TOKEN_LIMIT) break;
    seen.add(fingerprint);
    selected.push(chunk);
    totalTokens += chunk.tokenEstimate;
  }

  return selected.map(c => c.content).join("\n\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 6: SYSTEM PROMPT WITH ANSWER BRIEF
// ═══════════════════════════════════════════════════════════════════════════════

function buildSystemPrompt(
  brief: AnswerBrief,
  memoryContext: string,
  context: string,
  isFact: boolean
): string {
  const modeInstructions: Record<AnswerMode, string> = {
    ranking: "RANKING: Lead with the top options. Use real GPA numbers, scores, prices to justify rankings. Name a clear winner. Don't hedge — students want a decisive answer.",
    comparison: "COMPARISON: Structure as clear A vs B with parallel criteria. Acknowledge the real tradeoffs. End with a concrete recommendation tailored to the implied student profile.",
    recommendation: "RECOMMENDATION: You detected specific constraints about this student. Use them. Give a direct, personalized answer — not 'it depends,' but 'given that you care about X and Y, here is what I recommend and why.'",
    logistics: "LOGISTICS: Be precise. Lead with exact addresses, phone numbers, deadlines, URLs, hours. Zero editorializing. Students need to act — give them exactly what they need.",
    planning: "PLANNING: Build a complete, specific semester-by-semester plan. Use real course codes. For all optional/elective slots, auto-select the easiest options from the GPA data. Present as a clean table.",
    discovery: "DISCOVERY: Give a rich, organized overview. Point to the most useful information. Be the knowledgeable friend who knows where everything is.",
    hybrid: "HYBRID: This is a multi-part question. Break it into organized sections. Answer each well. Synthesize with a crisp bottom line that ties it together.",
  };

  const constraintContext = brief.detectedConstraints.length > 0
    ? `\nDETECTED STUDENT CONSTRAINTS:\n${brief.detectedConstraints.map(c => `- ${c.type}: ${c.value} (importance: ${(c.weight * 100).toFixed(0)}%)`).join("\n")}\n`
    : "";

  const tradeoffContext = brief.tradeoffs.length > 0
    ? `\nKEY TRADEOFFS TO ACKNOWLEDGE:\n${brief.tradeoffs.map(t => `- ${t}`).join("\n")}\n`
    : "";

  const groundingInstruction = isFact
    ? `GROUNDING RULE — FACT LOOKUP: The retrieved data below contains the exact answer. Copy addresses, phone numbers, suite numbers, hours, and deadlines VERBATIM — do not paraphrase or approximate them. A wrong suite number or phone number is worse than no answer. If the fact is present, quote it exactly. Keep your answer to 1–3 sentences unless the student asked for more.`
    : `GROUNDING RULE: Synthesize the retrieved data into a clear, specific answer. Reason about it — don't just repeat it. Be specific: cite exact numbers, names, and dates from the data.`;

  const corePrinciples = isFact
    ? `CORE PRINCIPLES:
- Quote addresses, phone numbers, suite numbers, and deadlines exactly as they appear in the data
- Never paraphrase a location or contact detail — copy it word for word
- Answer in 1–3 sentences for simple fact questions
- If the specific fact is not in the retrieved data, say so and direct to the relevant UIC website`
    : `CORE PRINCIPLES:
- Synthesize — reason about the data, don't just repeat it
- Be specific: cite GPA numbers, dollar amounts, dates, building names, phone numbers
- Use **bold** for course codes, names, critical numbers
- Acknowledge real tradeoffs honestly when they exist
- Never hallucinate facts — if uncertain, say so and point to the right UIC page
- Zero filler phrases — students want answers, not preamble
- Think like the smartest UIC insider who knows every shortcut and real answer`;

  return `You are Sparky — the intelligence layer of UIC Sparky (uicratings.com). You are not a chatbot. You are a campus reasoning system with access to real, verified UIC data.

YOUR DATA COVERAGE:
- 2,696 courses with real grade distributions (GPA, A-rate, W-rate, difficulty, pass rate)
- 1,275 professors with RMP ratings and per-instructor grade data
- 4-year degree plans for 40+ majors
- All 10 residence halls with exact costs and policies
- Every dining location with hours
- 470+ student orgs, 30+ Greek life chapters across 5 councils
- All 16 Flames athletic teams with coaches, schedules, free ticket info
- Tuition, all scholarships and deadlines (2025-2026)
- Campus buildings, CTA routes, shuttles, parking, every key office
- Health clinic, counseling, CampusCare, DRC, Title IX
- Admissions, international student policies, CPT/OPT, study abroad
- Library services, career services, 140+ UIC Instagram accounts

INFERRED STUDENT GOAL: ${brief.inferredGoal}
ANSWER MODE: ${brief.answerMode.toUpperCase()}
${constraintContext}${tradeoffContext}
${groundingInstruction}

REASONING INSTRUCTION — ${brief.answerMode.toUpperCase()}:
${modeInstructions[brief.answerMode]}

${corePrinciples}

UIC: Chicago's only public Research I university. ~33,000 students. ~91% commuters. Majority-minority. Mascot: Sparky the Dragon. Navy and Flames Red. Missouri Valley Conference (MVC). Go Flames!
${memoryContext ? "\n" + memoryContext + "\n" : ""}
--- RETRIEVED DATA ---
${context}
--- END DATA ---`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN POST HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(req: Request) {
  // ── Input validation ──────────────────────────────────────────────────────
  let messages: ChatMessage[];
  let lastMsg: string;
  try {
    const body = await req.json();
    messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }
    lastMsg = messages[messages.length - 1]?.content?.trim() ?? "";
    if (!lastMsg) return NextResponse.json({ error: "Empty message" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  // ── Session & query analysis (parallel) ──────────────────────────────────
  const { sessionId, isNew } = resolveSession(req);
  const query = analyzeQuery(lastMsg, messages.slice(0, -1));

  // ── Parallel: memory + legacy intent classifiers ──────────────────────────
  const [memoryResult, aiIntentResult, regexIntentResult, regexCiResult] = await Promise.allSettled([
    getMemory(sessionId),
    classifyIntent(lastMsg, messages.slice(0, -1)),
    Promise.resolve(detectIntent(lastMsg)),
    Promise.resolve(detectCampusIntent(lastMsg)),
  ]);

  const userMemory = memoryResult.status === "fulfilled" ? memoryResult.value : null;
  const aiIntent = aiIntentResult.status === "fulfilled" ? aiIntentResult.value : null;
  const ri = regexIntentResult.status === "fulfilled" ? regexIntentResult.value : ({} as any);
  const rc = regexCiResult.status === "fulfilled" ? regexCiResult.value : ({} as any);

  // Merge AI + regex intent (AI wins, regex fills gaps)
  const intent = aiIntent ? {
    courseCode: aiIntent.courseCode ?? ri.courseCode,
    subjectCode: aiIntent.subjectCode ?? ri.subjectCode,
    major: (aiIntent as any).major ?? ri.major,
    deptName: aiIntent.deptName ?? ri.deptName,
    profNameHint: aiIntent.profNameHint ?? ri.profNameHint,
    isAboutProfessors: aiIntent.isAboutProfessors || ri.isAboutProfessors,
    isAboutCourses: aiIntent.isAboutCourses || ri.isAboutCourses,
    isAboutGenEd: aiIntent.isAboutGenEd || ri.isAboutGenEd,
    isAboutMajor: aiIntent.isAboutMajor || ri.isAboutMajor,
    isAboutRequirementType: aiIntent.isAboutRequirementType || ri.isAboutRequirementType,
    wantsEasiest: aiIntent.wantsEasiest || ri.wantsEasiest,
    wantsHardest: aiIntent.wantsHardest || ri.wantsHardest,
    wantsProfRanking: aiIntent.wantsProfRanking || ri.wantsProfRanking,
  } : ri;

  const ci = aiIntent ? {
    isAboutTuition: aiIntent.isAboutTuition || rc.isAboutTuition,
    isAboutFinancialAid: aiIntent.isAboutFinancialAid || rc.isAboutFinancialAid,
    isAboutResidency: aiIntent.isAboutResidency || rc.isAboutResidency,
    isAboutPayment: aiIntent.isAboutPayment || rc.isAboutPayment,
    isAboutCostComparison: aiIntent.isAboutCostComparison || rc.isAboutCostComparison,
    isAboutDebt: aiIntent.isAboutDebt || rc.isAboutDebt,
    isAboutHousing: aiIntent.isAboutHousing || rc.isAboutHousing,
    isAboutMealPlan: aiIntent.isAboutMealPlan || rc.isAboutMealPlan,
    isAboutDining: aiIntent.isAboutDining || rc.isAboutDining,
    isAboutOffCampus: aiIntent.isAboutOffCampus || rc.isAboutOffCampus,
    isAboutLLC: aiIntent.isAboutLLC || rc.isAboutLLC,
    isAboutStudentLife: aiIntent.isAboutStudentLife || rc.isAboutStudentLife,
    isAboutAthletics: aiIntent.isAboutAthletics || rc.isAboutAthletics,
    isAboutCampusMap: aiIntent.isAboutCampusMap || rc.isAboutCampusMap,
    isAboutBuildings: aiIntent.isAboutBuildings || rc.isAboutBuildings,
    isAboutTransportation: aiIntent.isAboutTransportation || rc.isAboutTransportation,
    isAboutHealth: aiIntent.isAboutHealth || rc.isAboutHealth,
    isAboutAcademicPolicies: aiIntent.isAboutAcademicPolicies || rc.isAboutAcademicPolicies,
    isAboutCalendar: aiIntent.isAboutCalendar || rc.isAboutCalendar,
    isAboutRecreation: aiIntent.isAboutRecreation || rc.isAboutRecreation,
    isAboutSafety: aiIntent.isAboutSafety || rc.isAboutSafety,
  } : rc;

  // ── Determine which domains to retrieve based on query analysis + legacy intents ──
  const dc = query.domainConfidence;
  const lower = lastMsg.toLowerCase();

  // ── Execute sync (JSON) retrievals immediately ────────────────────────────
  const syncChunks: RetrievedChunk[] = [];
  if ((dc["tuition"] ?? 0) > 0.5 || ci.isAboutTuition || ci.isAboutCostComparison) syncChunks.push(...retrieveTuition(ci, query));
  if ((dc["financial_aid"] ?? 0) > 0.5 || ci.isAboutFinancialAid) syncChunks.push(...retrieveTuition({ ...ci, isAboutTuition: false, isAboutCostComparison: false }, query));
  if ((dc["housing"] ?? 0) > 0.5 || ci.isAboutHousing || ci.isAboutLLC || ci.isAboutOffCampus) syncChunks.push(...retrieveHousing(ci, query));
  if ((dc["dining"] ?? 0) > 0.5 || ci.isAboutDining || ci.isAboutMealPlan) syncChunks.push(...retrieveDining(ci, query));
  if ((dc["student_life"] ?? 0) > 0.5 || (dc["greek_life"] ?? 0) > 0.5 || ci.isAboutStudentLife) syncChunks.push(...retrieveStudentLife(query));
  if ((dc["campus_map"] ?? 0) > 0.5 || (dc["transportation"] ?? 0) > 0.5 || ci.isAboutCampusMap || ci.isAboutTransportation || ci.isAboutBuildings) syncChunks.push(...retrieveCampusMap(query));
  if ((dc["health"] ?? 0) > 0.5 || (dc["recreation"] ?? 0) > 0.5 || ci.isAboutHealth || ci.isAboutRecreation) syncChunks.push(...retrieveHealth(query));
  if ((dc["calendar"] ?? 0) > 0.5 || (dc["academic_policy"] ?? 0) > 0.5 || ci.isAboutCalendar || ci.isAboutAcademicPolicies) syncChunks.push(...retrieveCalendar(query));
  if ((dc["academic_policy"] ?? 0) > 0.5 || ci.isAboutAcademicPolicies || lower.match(/\badvising\b|tutoring|mslc|writing center|my advisor|college office/)) syncChunks.push(...retrieveAdvising(query));
  if ((dc["admissions"] ?? 0) > 0.5) syncChunks.push(...retrieveAdmissions(query));
  if ((dc["careers"] ?? 0) > 0.5) syncChunks.push(...retrieveCareers(query));
  if ((dc["library"] ?? 0) > 0.5) syncChunks.push(...retrieveLibrary(query));
  if ((dc["international"] ?? 0) > 0.5) syncChunks.push(...retrieveInternational(query));
  if ((dc["safety"] ?? 0) > 0.5 || ci.isAboutSafety) syncChunks.push(...retrieveSafety(query));
  if ((dc["instagram"] ?? 0) > 0.5) syncChunks.push(...retrieveInstagram(query));
  if ((dc["recreation"] ?? 0) > 0.5 && !(dc["health"] ?? 0)) syncChunks.push(...retrieveRecreation(query));

  // ── Execute async (DB) retrievals in parallel ─────────────────────────────
  const asyncTasks: Promise<RetrievedChunk[]>[] = [];
  if (intent.courseCode) asyncTasks.push(retrieveCourseDetail(intent, query));
  if ((dc["courses"] ?? 0) > 0.5 || intent.isAboutCourses) asyncTasks.push(retrieveCourseList(intent, query));
  if ((dc["gen_ed"] ?? 0) > 0.5 || intent.isAboutGenEd) asyncTasks.push(retrieveGenEd(query));
  if ((dc["professors"] ?? 0) > 0.5 || intent.isAboutProfessors) asyncTasks.push(retrieveProfessors(intent, query));
  if ((dc["major_plan"] ?? 0) > 0.5 || query.answerMode === "planning") asyncTasks.push(retrieveMajorPlan(query));
  if ((dc["athletics"] ?? 0) > 0.5 || ci.isAboutAthletics) asyncTasks.push(retrieveAthletics(query));

  // Vector search in parallel — only for discovery/recommendation or when structured retrieval found nothing
  const vectorTask = (query.answerMode === "discovery" || query.answerMode === "recommendation" || syncChunks.length === 0)
    ? vectorSearch(lastMsg, 4).catch(() => [])
    : Promise.resolve([]);

  // Await all async work
  const [asyncResults, vectorResults] = await Promise.all([
    Promise.allSettled(asyncTasks),
    vectorTask,
  ]);

  const asyncChunks: RetrievedChunk[] = [];
  for (const r of asyncResults) {
    if (r.status === "fulfilled") asyncChunks.push(...r.value);
  }

  let allChunks = [...syncChunks, ...asyncChunks];

  // Add vector results only for domains not already covered by structured retrieval
  const coveredDomains = new Set(allChunks.map(c => c.domain));
  const relevantVectors = (vectorResults as any[]).filter((r: any) => r.similarity > 0.72);
  if (relevantVectors.length > 0 && !query.isFact) {
    const vectorContent = relevantVectors.map((r: any) => r.content).join("\n");
    const vectorChunk = makeChunk("courses", `=== SEMANTIC SUPPORT ===\n${vectorContent}`, 0.7, query);
    vectorChunk.relevanceScore *= 0.8;
    allChunks.push(vectorChunk);
  }
  void coveredDomains;

  // ── Fallback for completely unmatched queries ─────────────────────────────
  if (allChunks.length === 0) {
    const [topProfs, easyCourses] = await Promise.allSettled([
      fetchProfessorsByDept(null, 10),
      fetchCoursesBySubjectOrDept(null, null, 10, true),
    ]);
    if (topProfs.status === "fulfilled" && topProfs.value.length > 0) {
      const c = `=== TOP RATED PROFESSORS ===\n` + topProfs.value.map((p: any) => `${p.name} (${p.department}): ${p.rmpQuality}/5`).join("\n");
      allChunks.push(makeChunk("professors", c, 0.5, query));
    }
    if (easyCourses.status === "fulfilled" && easyCourses.value.length > 0) {
      const c = `=== EASIEST COURSES ===\n` + easyCourses.value.map((c: any) => `${c.subject} ${c.number} - ${c.title}: GPA ${c.avgGpa}`).join("\n");
      allChunks.push(makeChunk("courses", c, 0.5, query));
    }
    allChunks.push(...retrieveStudentLife(query));
    allChunks.push(...retrieveAdmissions(query));
    allChunks.push(makeChunk("student_life", `=== SPARKY COVERS ===\nCourses & grades, professors & RMP, 4-year plans, tuition & scholarships, housing & dining, student orgs & Greek life, athletics & tickets, campus map, health & counseling, library, international students, careers, safety, 140+ UIC Instagram accounts.`, 0.4, query));
  }

  // ── Build answer brief + assemble context ─────────────────────────────────
  const brief = buildAnswerBrief(query, allChunks);
  const context = assembleContext(allChunks, brief);
  const memoryContext = userMemory ? formatMemoryForPrompt(userMemory) : "";

  if (userMemory !== null && messages.length > 2) {
    updateMemory(sessionId, messages, userMemory).catch(() => {});
  }

  // ── Build prompt + call model ─────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(brief, memoryContext, context, query.isFact);
  const maxTokens = query.answerMode === "planning" ? 2800 : query.answerMode === "hybrid" ? 2200 : query.isFact ? 300 : 1800;

  try {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages.map((m: ChatMessage) => ({ role: m.role, content: m.content })),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    controller.enqueue(encoder.encode(event.delta.text));
  }
}
        } finally {
          controller.close();
        }
      },
    });

    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Accel-Buffering": "no",
    };
    if (isNew) {
      headers["Set-Cookie"] = `sparky_session=${sessionId}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    }
    return new Response(readable, { headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Chat API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}