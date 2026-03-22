export const dynamic = "force-dynamic";
export const runtime = "nodejs";  // ADD THIS
export const revalidate = 0;      // ADD
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getPostHogClient } from "@/app/lib/posthog-server";
import { detectIntent, detectCampusIntent } from "@/lib/chat/intent";
import { classifyIntent } from "@/lib/chat/classify";
import { vectorSearch, rerankChunks } from "@/lib/chat/vectors";
import { getSessionState, updateSessionState, extractEntitiesFromQuery } from "@/lib/chat/session-state";
import { getMemory, updateMemory, formatMemoryForPrompt } from "@/lib/chat/memory";
import { prisma } from "@/lib/prisma";
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
// ── Trust decision layer ──────────────────────────────────────────────────
import { makeTrustDecision, getTrustInstruction } from "@/lib/chat/trust-decision";
import tuitionData from "@/public/data/uic-knowledge/tuition.json";
import specialPopData from "@/public/data/uic-knowledge/special-populations.json";
import {
  fetchCourseDetail,
  fetchCoursesByCodesRanked,
  fetchCoursesBySubjectOrDept,
  fetchGenEdCourses,
  fetchProfessorsByDept,
  fetchProfessorWithCourseRankings,
  fetchRecentNews,
  fetchProfessorsForCourse,   // ADD
  fetchCourseGpaRanking,       // ADD
} from "@/lib/chat/data";


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
  const words = lower.split(/\s+/).map(w => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''));

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
  if (isPlanningQuery(lower)) domainConfidence["major_plan"] = 0.9;

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
  // ── Program / major / institutional structure ─────────────────────────
  if (
    lower.match(/\b(major|program|degree|school|college|department|dept)\b/) ||
    lower.match(/\b(switch|change|declare|add|double).{0,15}(major|minor|program|degree)\b/) ||
    lower.match(/\b(does uic (have|offer)|is there a|do you have).{0,25}(major|program|school|college|department)\b/) ||
    lower.match(/\b(does uic (have|offer)|is there|uic (have|offer)).{0,25}(phd|ph\.d|master|bachelor|mba|ms\b|ma\b|minor)\b/i) ||
    lower.match(/\b(phd|ph\.d|masters?\s+program|bachelor.s\s+degree)\b/i)
  ) {
    domainConfidence["admissions"] = Math.max(domainConfidence["admissions"] ?? 0, 0.80);
    domainConfidence["academic_policy"] = Math.max(domainConfidence["academic_policy"] ?? 0, 0.75);
  }

  // ── Subject-to-subject switch without "major" keyword ────────────────
  if (lower.match(/\b(switch|change|transfer|move).{0,20}(from|to).{0,30}(nursing|biology|engineering|computer science|cs\b|business|chemistry|physics|math|psychology|education|art|music|accounting|finance|kinesiology)\b/i)) {
    domainConfidence["admissions"] = Math.max(domainConfidence["admissions"] ?? 0, 0.82);
    domainConfidence["academic_policy"] = Math.max(domainConfidence["academic_policy"] ?? 0, 0.78);
  }

  // ── Graduation / credit hour requirements ─────────────────────────────
  if (
    lower.match(/\b(credits?|credit hours?)\b/) ||
    lower.match(/\b(requirements?|hours?).{0,10}(to |for )?(graduate|graduation|degree|finish|complete)\b/) ||
    lower.match(/\bhow (many|much).{0,15}(credit|hour)\b/) ||
    lower.match(/\bgraduation requirements?\b/)
  ) {
    domainConfidence["academic_policy"] = Math.max(domainConfidence["academic_policy"] ?? 0, 0.85);
    domainConfidence["calendar"] = Math.max(domainConfidence["calendar"] ?? 0, 0.80);
  }

  // ── U-Pass / Ventra ───────────────────────────────────────────────────
  if (lower.match(/\bu.?pass\b|transit pass|ventra/i)) {
    domainConfidence["transportation"] = Math.max(domainConfidence["transportation"] ?? 0, 0.92);
  }
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
    const pParts = p.split(/\s+/).filter(part => part.length >= 3 && !["ii","iii","jr","sr","iv"].includes(part));
    const qParts = lower.split(/\s+/).filter(w => w.length >= 5 && !["who","is","the","are","about","tell","me","many","need","does","have","available","credits","dorms","graduate"].includes(w));
    return pParts.some(part => lower.includes(part)) || qParts.some(w => p.includes(w));
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

// ── Abstention helper ─────────────────────────────────────────────────────
// Returns a specific redirect for each domain rather than a generic refusal.
// Never calls the model — this is hardcoded authoritative text.
function getAbstainResponse(query: QueryAnalysis): string {
  const domain = Object.entries(query.domainConfidence)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? "general";

  const responses: Partial<Record<string, string>> = {
    registration:
      "I don't have that registration detail. For course credit limits and " +
      "overload approvals, contact your college advising office or the Registrar: " +
      "registrar.uic.edu.",
    courses:
      "I don't have reliable data to answer that question. For course information, " +
      "check the UIC Schedule of Classes at registrar.uic.edu or the course catalog " +
      "at catalog.uic.edu.",

    professors:
      "I don't have enough information to answer that reliably. For professor reviews, " +
      "check RateMyProfessors.com. For office hours and contact info, check the " +
      "department's website or your course's Blackboard page.",

    gen_ed:
      "I couldn't find clear data for that Gen Ed question. The full Gen Ed course list " +
      "is at catalog.uic.edu — search by category under General Education requirements.",

    major_plan:
      "I don't have a complete answer for that major or program. Contact your college " +
      "advising office, or see the official degree requirements at catalog.uic.edu.",

    housing:
      "I don't have the specific housing information you need. Contact UIC Housing " +
      "directly: housing.uic.edu | 312-413-5255 | housing@uic.edu.",

    dining:
      "I don't have current dining details for that. Check dining.uic.edu for menus, " +
      "hours, and meal plan information.",

    tuition:
      "I can't confirm that tuition or billing detail. See current figures at " +
      "bursar.uic.edu or call the Bursar's Office: 312-996-8574.",

    financial_aid:
      "I can't confirm that financial aid detail. Contact the Office of Student " +
      "Financial Aid: SSB Suite 1800 | 312-996-3126 | financialaid.uic.edu.",

    health:
      "I don't have that health services information. For the health clinic: " +
      "campuscare.uic.edu | 312-996-7420. For counseling: 312-996-3490.",

    calendar:
      "I don't have that academic calendar detail. See the official calendar at " +
      "registrar.uic.edu/calendars.",

    academic_policy:
      "I don't have a reliable answer for that policy question. Contact the " +
      "Registrar's Office at registrar.uic.edu or your college advising office.",

    admissions:
      "I don't have that admissions detail. Contact Admissions: " +
      "admissions.uic.edu | 312-996-4350.",

    careers:
      "I don't have that career services detail. Contact Career Services: " +
      "SSB Suite 3050 | 312-996-2300 | uic.joinhandshake.com.",

    international:
      "I don't have that international student detail. Contact the Office of " +
      "International Services: SSB 2160 | 312-996-3121 | ois.uic.edu.",

    safety:
      "I don't have that policy detail. For campus safety: police.uic.edu | " +
      "Emergency: 312-996-2830. For Title IX: oae.uic.edu | 312-996-8670.",

    library:
      "I don't have that library detail. Contact Daley Library: " +
      "library.uic.edu | 312-996-2726.",

    athletics:
      "I don't have that athletics detail. Check UICFlames.com for schedules, " +
      "rosters, and ticket information.",

    transportation:
      "I don't have current transit details. Check transitchicago.com for CTA " +
      "schedules or transportation.uic.edu for campus shuttles.",
  };

  return (
    responses[domain] ??
    "I'm not sure I have reliable information on that. You can reach UIC at " +
    "312-996-7000 or visit uic.edu — most offices also have live chat on their pages."
  );
}

// ─── Planning query detector — single source of truth used in two places ──────
// Matches any question about degree requirements, course sequences, graduation
// plans, or semester scheduling — regardless of whether the user says "plan".
function isPlanningQuery(lower: string): boolean {
  return (
    // Explicit plan/schedule requests
    /\b(4.?year|four.?year|degree plan|course plan|semester.?plan|sequence)\b/.test(lower) ||
    // "what courses / classes do I need / should I take for [major]?"
    /\bwhat (courses?|classes?) (do|should|must) i (need|take|complete|finish)\b/.test(lower) ||
    // "required courses for nursing", "degree requirements for cs"
    /\b(required courses?|degree requirements?|major requirements?) (for|to)\b/.test(lower) ||
    // "what do I need to graduate / to finish my degree"
    /\bwhat do i need (to graduate|to finish|to complete (my|the) degree)\b/.test(lower) ||
    // "can I graduate in 3 years", "on track to graduate"
    /\bcan i graduate in\b/.test(lower) ||
    /\bon track to graduate\b/.test(lower) ||
    // "requirements left", "requirements remaining", "requirements still needed"
    /\brequirements? (left|remaining|still needed)\b/.test(lower) ||
    // "what should I take next semester / this semester"
    /\bwhat should i take (next|this) (semester|year|term)\b/.test(lower) ||
    // "my next semester schedule", "this semester plan"
    /\b(next|this) semester (schedule|plan|courses?|classes?)\b/.test(lower) ||
    // "can I fit a minor", "room for a minor"
    /\b(fit|room for|add) a minor\b/.test(lower)
  );
}

function detectAnswerMode(lower: string): AnswerMode {
  if (isPlanningQuery(lower)) return "planning";
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

function formatContent(text: string): string {
  let cleaned = text;

  // Remove accidental markdown table separator rows
  cleaned = cleaned.replace(/^\|?[\s\-:|]{3,}\|?$/gm, "");

  // Turn markdown table rows into plain lines if they ever appear
  cleaned = cleaned.replace(/^\|(.+)\|$/gm, (_, row) => {
    return row
      .split("|")
      .map((cell: string) => cell.trim())
      .filter(Boolean)
      .join("  •  ");
  });

  let html = cleaned.replace(/^### (.+)$/gm, "<h3 class='text-white font-bold text-base mt-4 mb-1.5'>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2 class='text-white font-bold text-[17px] mt-5 mb-2'>$1</h2>");
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong class='text-white font-semibold'>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code class='bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded text-[13px] font-mono'>$1</code>");
  html = html.replace(/^[•\-\*] (.+)$/gm, "<li class='flex gap-2 items-start'><span class='text-zinc-500 mt-0.5 shrink-0'>•</span><span>$1</span></li>");
  html = html.replace(/^(\d+)\. (.+)$/gm, "<li class='flex gap-2.5 items-start'><span class='text-zinc-500 font-mono text-xs mt-1 shrink-0 w-4'>$1.</span><span>$2</span></li>");

  const liBlockRegex = /<li[^>]*>[\s\S]*?<\/li>/g;
  const liBlocks = html.match(liBlockRegex);
  if (liBlocks) {
    html = html.replace(/<li/, "<ul class='space-y-1.5 my-2'><li");
    html = html.replace(/(<\/li>)(?!\s*<li)/, "$1</ul>");
  }

  html = html.replace(/\n\n/g, "</p><p class='mt-3'>");
  html = html.replace(/\n/g, "<br/>");
  return html;
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
  const significantWords = queryWords.map(w => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')).filter(w => w.length >= 3 && !STOPWORDS_SHORT.has(w));
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

// Short common words that carry no signal — excluded even when length >= 3.
// Does NOT exclude UIC acronyms (ARC, JST, GPA, RMP, IDS, CS, etc.).
const STOPWORDS_SHORT = new Set([
  "and","but","not","for","are","was","has","had","its","the","can",
  "did","how","his","her","our","you","all","any","one","who","get",
  "use","two","out","may","uic","they","them","that","this","with",
  "from","will","been","were","what","when","than","then","also",
]);

function scoreChunk(content: string, query: QueryAnalysis, domain: Domain): number {
  const lower = content.toLowerCase();
  const rawWords = query.rawQuery.toLowerCase().split(/\s+/).map(w => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''));
  // Also include any inherited entity from session (e.g. hall abbreviation for housing follow-ups)
  const inheritedHall = (query as any)._inheritedHall as string | undefined;
  if (inheritedHall) rawWords.push(inheritedHall.toLowerCase());
  const queryWords = rawWords.filter(w => w.length >= 3 && !STOPWORDS_SHORT.has(w));

  // Word overlap score
  const overlapCount = queryWords.filter(w => lower.includes(w)).length;
  const overlapScore = Math.min(overlapCount / Math.max(queryWords.length, 1), 1);

  // Domain confidence score
  const domainScore = query.domainConfidence[domain] ?? 0.2;

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
  
  // Prepend context sentence so the model knows provenance of every chunk
  const contextPrefix: Partial<Record<Domain, string>> = {
    courses: "[UIC course and grade data]",
    professors: "[UIC professor ratings and grade data]",
    housing: "[UIC housing and residence hall data 2025-2026]",
    dining: "[UIC dining locations and meal plan data]",
    tuition: "[UIC tuition and financial aid data 2025-2026]",
    financial_aid: "[UIC scholarships and financial aid 2025-2026]",
    athletics: "[UIC Flames athletics data]",
    health: "[UIC health and counseling services]",
    campus_map: "[UIC campus buildings and locations]",
    transportation: "[UIC transportation and CTA data]",
    student_life: "[UIC student organizations and campus life]",
    calendar: "[UIC academic calendar and policies 2025-2026]",
    admissions: "[UIC admissions data]",
    careers: "[UIC career services]",
    safety: "[UIC safety and campus police]",
    international: "[UIC international student services]",
    library: "[UIC library services]",
  };
  
  const prefix = contextPrefix[domain];
  if (prefix && !finalContent.startsWith("[")) {
    finalContent = `${prefix}\n${finalContent}`;
  }
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

function getVectorSourceTypes(query: QueryAnalysis): string[] {
  const dc = query.domainConfidence;
  const lower = query.rawQuery.toLowerCase();

  const sourceTypes = new Set<string>();

  // Always allow your core structured semantic support
  sourceTypes.add("course");
  sourceTypes.add("professor");
  sourceTypes.add("news");

  const isAthleticsLike =
    (dc["athletics"] ?? 0) > 0.5 ||
    lower.match(/\b(team|teams|athlete|athletes|softball|baseball|basketball|soccer|tennis|volleyball|swim|track|flames)\b/) !== null;

  const isStudentLifeLike =
    (dc["student_life"] ?? 0) > 0.5 ||
    (dc["instagram"] ?? 0) > 0.5 ||
    lower.match(/\b(club|clubs|org|organization|student life|campus vibe|what's happening|recently|lately|follow|instagram|insta|social media)\b/) !== null;

  const isRecentSocialQuery =
    lower.match(/\b(lately|recently|posting|posted|worth mentioning|active lately|current vibe|what are.*doing|who.*worth mentioning)\b/) !== null;

  // Only include Instagram for social / athletics / recent-activity style questions
  if (isAthleticsLike || isStudentLifeLike || isRecentSocialQuery) {
    sourceTypes.add("instagram_caption");
    sourceTypes.add("instagram_account");
  }

  return Array.from(sourceTypes);
}

function mapVectorSourceTypeToDomain(sourceType: string): Domain {
  if (sourceType === "instagram_caption" || sourceType === "instagram_account") return "instagram";
  if (sourceType === "news") return "news";
  if (sourceType === "professor") return "professors";
  return "courses";
}

function vectorSourceConfidence(sourceType: string, trustLevel?: string | null): number {
  if (sourceType === "course") return 0.82;
  if (sourceType === "professor") return 0.80;
  if (sourceType === "news") return 0.78;
  if (sourceType === "instagram_account") return 0.62;
  if (sourceType === "instagram_caption") return 0.58;
  if (trustLevel === "social") return 0.58;
  return 0.70;
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
// ─── Plan validation — runs before the chunk is sent to the model ─────────────
// Checks credit totals, per-semester consistency, and schedule existence.
// Returns warning strings injected into the planning context so the model
// (and the student) can see known data issues without the model hallucinating around them.
interface PlanValidation {
  warnings: string[];
  creditTotal: number;
  expectedTotal: number | null;
}

function validatePlanData(majorMatch: any): PlanValidation {
  const warnings: string[] = [];
  const sched: any[] = majorMatch.sampleSchedule ?? [];

  // No schedule at all
  if (sched.length === 0) {
    warnings.push("No official sample schedule on file — sequence below is generated from required course list; verify order with advisor");
    return { warnings, creditTotal: 0, expectedTotal: majorMatch.totalHours ?? null };
  }

  // Per-semester credit consistency
  let creditTotal = 0;
  for (const sem of sched) {
    const declared: number = sem.total_hours ?? 0;
    const courseSum: number = (sem.courses ?? []).reduce(
      (acc: number, c: any) => acc + (c.hours ?? 0), 0
    );
    // Use declared if present, otherwise sum from courses
    creditTotal += declared || courseSum;
    if (declared && courseSum > 0 && Math.abs(declared - courseSum) > 1) {
      warnings.push(`${sem.year} ${sem.semester}: schedule lists ${declared}h but individual courses sum to ${courseSum}h`);
    }
    // Flag unusually heavy/light semesters
    const semHours = declared || courseSum;
    if (semHours > 19) warnings.push(`${sem.year} ${sem.semester}: ${semHours}h is above normal full-time load (≤18h) — confirm with advisor`);
  }

  // Total credit check
  const expectedTotal: number | null = majorMatch.totalHours ?? null;
  if (expectedTotal && creditTotal > 0 && Math.abs(creditTotal - expectedTotal) > 3) {
    const delta = creditTotal - expectedTotal;
    warnings.push(`Schedule totals ${creditTotal} credits; degree requires ${expectedTotal} (${delta > 0 ? "+" : ""}${delta} delta — electives or gen-eds may account for gap)`);
  }

  return { warnings, creditTotal, expectedTotal };
}

async function retrieveMajorPlan(query: QueryAnalysis): Promise<RetrievedChunk[]> {
  try {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    // Load from individual major files via index
const indexPath = join(process.cwd(), "public/data/uic-knowledge/majors/_index.json");
const index = JSON.parse(readFileSync(indexPath, "utf8"));
const data = {
  majors: index.majors.map((m: any) => {
    try {
      const filePath = join(process.cwd(), "public/data/uic-knowledge", m.file);
      return JSON.parse(readFileSync(filePath, "utf8"));
    } catch {
      return { name: m.name, requiredCourses: [], sampleSchedule: [] };
    }
  })
};
    const lower = query.rawQuery.toLowerCase();
 
    const majorMatch = data.majors?.filter((m: any) => {
      // Normalize new "Name - DEGREE" format → "name degree" for substring matching
      const n = m.name.toLowerCase()
        .replace(/ - (bs|ba|bfa|bmus|ms|joint bs\/ms|joint degrees with ba)/gi, " $1")
        .replace(" with a major", "")
        .replace(" with a major", "")  // handle doubled
        .trim();

      // Direct name match (handles most cases automatically)
      if (lower.includes(n)) return true;

      // Also try matching just the base name without degree suffix
      const baseName = n.replace(/\s+(bs|ba|bfa|bmus|ms)$/, "").trim();
      if (baseName.length > 4 && lower.includes(baseName)) return true;

      // Explicit aliases for common queries / abbreviations
      if (n.includes("computer science") && !n.includes("design") && !n.includes("philosophy") && !n.includes("linguistics") && !n.includes("mathematics") &&
          (/\bcs\b/.test(lower) || lower.includes("computer science"))) return true;
      if (n.includes("computer science and design") && (lower.includes("cs and design") || lower.includes("computer science and design"))) return true;
      if (n.includes("information and decision sciences") && (lower.includes("ids") || lower.includes("information and decision"))) return true;
      if (n.includes("biochemistry") && lower.includes("biochem")) return true;
      if (n.includes("chemistry") && !n.includes("biochemistry") && lower.includes("chem") && !lower.includes("biochem")) return true;
      if (n.includes("biology") && (lower.includes("biol") || lower.includes("biology"))) return true;
      if (n.includes("psychology") && lower.includes("psych")) return true;
      if (n.includes("kinesiology") && (lower.includes("kin") || lower.includes("kinesiology"))) return true;
      if (n.includes("nursing") && lower.includes("nurs")) return true;
      if (n.includes("accounting") && lower.includes("account")) return true;
      if (n.includes("finance") && lower.includes("finance")) return true;
      if (n.includes("marketing") && lower.includes("marketing")) return true;
      if (n.includes("management") && !n.includes("engineering") && !n.includes("health") && lower.includes("management")) return true;
      if (n.includes("economics") && lower.includes("econ")) return true;
      if (n.includes("mechanical engineering") && lower.includes("mechanical")) return true;
      if (n.includes("electrical engineering") && lower.includes("electrical")) return true;
      if (n.includes("civil engineering") && lower.includes("civil")) return true;
      if (n.includes("biomedical engineering") && (lower.includes("biomed") || lower.includes("bme") || lower.includes("biomedical"))) return true;
      if (n.includes("environmental engineering") && lower.includes("environmental eng")) return true;
      if (n.includes("industrial engineering") && lower.includes("industrial")) return true;
      if (n.includes("computer engineering") && lower.includes("computer eng")) return true;
      if (n.includes("public health") && lower.includes("public health")) return true;
      if (n.includes("neuroscience") && lower.includes("neuro")) return true;
      if (n.includes("criminology") && (lower.includes("crim") || lower.includes("criminal justice"))) return true;
      if (n.includes("political science") && (lower.includes("poli sci") || lower.includes("political science"))) return true;
      if (n.includes("communication") && lower.includes("comm") && !lower.includes("telecomm")) return true;
      if (n.includes("mathematics") && !n.includes("computer") && (lower.includes("math") && !lower.includes("cs"))) return true;
      if (n.includes("statistics") && lower.includes("stat")) return true;
      if (n.includes("physics") && lower.includes("physics")) return true;
      if (n.includes("philosophy") && lower.includes("phil")) return true;
      if (n.includes("sociology") && lower.includes("sociol")) return true;
      if (n.includes("anthropology") && lower.includes("anthro")) return true;
      if (n.includes("english") && lower.includes("english") && !lower.includes("engineering")) return true;
      if (n.includes("history") && lower.includes("history")) return true;
      if (n.includes("architecture") && !n.includes("architectural studies") && lower.includes("architecture")) return true;
      if (n.includes("architectural studies") && lower.includes("architectural studies")) return true;
      if (n.includes("entrepreneurship") && (lower.includes("entrepreneur") || lower.includes("entrep"))) return true;
      if (n.includes("pharmaceutical sciences") && (lower.includes("pharm") || lower.includes("pharmaceutical"))) return true;
      if (n.includes("urban studies") && lower.includes("urban stud")) return true;
      if (n.includes("public policy") && lower.includes("public policy")) return true;

      return false;
    }).sort((a: any, b: any) => {
      // Prefer standalone BS/BA over joint or completion programs; break ties by course count
      const isStandard = (name: string) => /- (BS|BA|BFA|BMus)$/.test(name) ? 10 : 0;
      const scoreA = isStandard(a.name) + (a.requiredCourses?.length ?? 0);
      const scoreB = isStandard(b.name) + (b.requiredCourses?.length ?? 0);
      return scoreB - scoreA;
    })[0] ?? null;
 
    if (!majorMatch) {
      const list = data.majors?.map((m: any) => `- ${m.name}`).join("\n") || "";
      return [makeChunk("major_plan", `=== NO PLAN DATA FOUND ===
CRITICAL INSTRUCTION — DO NOT HALLUCINATE A PLAN:
The requested major was not found in the current dataset.
You MUST NOT generate, invent, or approximate a semester-by-semester plan.
You MUST NOT list courses from memory — your training data may be outdated or wrong.

Tell the student:
- Their major was not found in the current plan data
- Direct them to: catalog.uic.edu (search for their major)
- Direct them to: their academic advisor or the department advising office
- Offer to help with other topics (professors, courses, housing, etc.)

Available majors in data (suggest they check if their major appears under a different name):
${list}`, 0.7, query)];
    }
 
    // ── REQUIRED COURSES — with credit hours from source data ──────────────
    const required = majorMatch.requiredCourses.slice(0, 90).map((c: any) =>
      `${c.code}: ${c.title} — ${c.hours ?? "?"} credit hours`
    ).join("\n");

    // ── ELECTIVE RULES — 500+ filtered out, no GPA-optimization by default ──
    const slotTypeHint = (label: string) => {
      const l = label.toLowerCase();
      if (l.includes("free elective")) return " → fills [free_elective] slots";
      if (l.includes("rubric") || l.includes("technical")) return " → fills [technical_elective] slots";
      if (l.includes("math") || l.includes("stat")) return " → fills [required_math] slots";
      if (l.includes("science")) return " → fills [science_elective] slots";
      if (l.includes("humanities") || l.includes("social science")) return " → fills [humanities_elective] slots";
      return "";
    };

    // Set of required course codes — exempted from 500+ filter
    const requiredCodesSet = new Set(
      (majorMatch.requiredCourses ?? []).map((c: any) => c.code?.toUpperCase()).filter(Boolean)
    );

    // Fetch DB data — filter elective options to undergrad level (100-499) only
    const rankedGroups: Array<{ g: any; ranked: any[] }> = await Promise.all(
      (majorMatch.electiveGroups ?? []).map(async (g: any) => {
        if (!(g.options?.length > 0)) return { g, ranked: [] };
        const undergradCodes = (g.options as any[])
          .map((o: any) => o.code as string)
          .filter((code: string) => {
            const num = parseInt(code?.match(/\d+/)?.[0] ?? "0", 10);
            return num < 500 || requiredCodesSet.has(code?.toUpperCase());
          });
        if (undergradCodes.length === 0) return { g, ranked: [] };
        const ranked = await fetchCoursesByCodesRanked(undergradCodes, true).catch(() => []);
        return { g, ranked };
      })
    );

    // Only show GPA/difficulty data if student asked for easiest options
    const wantsEasy = (query as any).wantsEasiest === true;
    const electiveRules = rankedGroups.length > 0
      ? rankedGroups.map(({ g, ranked }) => {
          const label = g.label ?? g.name ?? "Elective group";
          const hint = slotTypeHint(label);
          const optStr = ranked.length > 0
            ? (wantsEasy
                ? `\n  ELIGIBLE COURSES — sorted by easiness (GPA/difficulty):\n` +
                  ranked.map((c: any) =>
                    `    ${c.subject} ${c.number} — ${c.title}: GPA ${c.avgGpa?.toFixed(2) ?? "N/A"}, ${diffLabel(c.difficultyScore ?? 0)}`
                  ).join("\n")
                : `\n  ELIGIBLE COURSES (all approved options for this slot):\n` +
                  ranked.map((c: any) =>
                    `    ${c.subject} ${c.number} — ${c.title}`
                  ).join("\n"))
            : `\n  No specific course list in data — pick any approved 100-499 level course; confirm with catalog`;
          return `${label}${hint}:\n  Choose ${g.credits ?? "?"} credit hours${optStr}`;
        }).join("\n\n")
      : majorMatch.electiveRequirements
        ? Object.entries(majorMatch.electiveRequirements as Record<string, any>).map(([group, rule]: [string, any]) =>
            `${group}: ${typeof rule === "object" ? `choose ${rule.choose ?? "?"} courses from ${rule.options?.join(", ") ?? "see catalog"}` : rule}`
          ).join("\n")
        : null;

    // ── PLAN TIER — determines what the model is allowed to generate ─────────
    const hasSchedule = (majorMatch.sampleSchedule?.length ?? 0) > 0;
    const hasElectiveOptions = rankedGroups.some(({ ranked }) => ranked.length > 0);
    const hasCourses = (majorMatch.requiredCourses?.length ?? 0) >= 5;
    const planTier: "full" | "schedule" | "courses_only" | "minimal" =
      hasSchedule && hasCourses && hasElectiveOptions ? "full"
      : hasSchedule && hasCourses ? "schedule"
      : hasCourses ? "courses_only"
      : "minimal";

    // ── SAMPLE SCHEDULE — semester by semester with real course objects ──────
    const courseHourMap: Record<string, number> = {};
    for (const c of majorMatch.requiredCourses ?? []) {
      if (c.code && c.hours) courseHourMap[c.code] = c.hours;
    }

    const schedule = hasSchedule
      ? majorMatch.sampleSchedule.map((s: any) => {
          const lines = (s.courses ?? []).map((c: any) => {
            if (c.isElective) {
              return `  [${c.electiveType ?? "elective"}] ${c.title ?? "Elective"} — ${c.hours ?? "?"}h`;
            }
            const hrs = c.hours ?? courseHourMap[c.code] ?? "?";
            return `  ${c.code} — ${c.title} (${hrs}h)`;
          });
          return `${s.year} ${s.semester} [${s.total_hours ?? "?"}h total]:\n${lines.join("\n")}`;
        }).join("\n\n")
      : null;

    // ── VALIDATE PLAN DATA ───────────────────────────────────────────────────
    const validation = validatePlanData(majorMatch);

    // ── ASSEMBLE CONTENT ────────────────────────────────────────────────────
    let content = `=== ${majorMatch.name.toUpperCase()} — OFFICIAL DEGREE REQUIREMENTS ===\n`;
    content += `Total credits required: ${majorMatch.totalHours ?? "see catalog"} | College: ${majorMatch.college ?? "N/A"}\n`;
    content += `PLAN TIER: ${planTier.toUpperCase()}\n`;

    // Credit breakdown by category
    const summaryEntries = Object.entries(majorMatch.summaryRequirements ?? {})
      .filter(([k]) => k !== "Total Hours")
      .map(([k, v]) => `${k}: ${v}h`);
    if (summaryEntries.length > 0) {
      content += `Credit breakdown: ${summaryEntries.join(" | ")}\n`;
    }
    content += "\n";

    // Enumerate all required course codes explicitly so model can cross-check
    const requiredCourseCodes = (majorMatch.requiredCourses ?? [])
      .filter((c: any) => c.code && !/^\[/.test(c.code.trim()))
      .map((c: any) => c.code);
    content += `MANDATORY REQUIRED COURSES — ALL MUST APPEAR IN YOUR PLAN:\n${required}\n`;
    content += `REQUIRED COURSE CODE MANIFEST: ${requiredCourseCodes.join(", ")}\n\n`;

    if (electiveRules) {
      const electiveHeader = (planTier === "full" || planTier === "schedule")
        ? "ELECTIVE REQUIREMENTS (use these to fill elective slots in the schedule):"
        : "ELECTIVE REQUIREMENTS (available options — include only if data supports it):";
      content += `${electiveHeader}\n${electiveRules}\n\n`;
    }

    if (schedule) {
      content += `OFFICIAL SAMPLE SCHEDULE (semester by semester):\n${schedule}\n`;
    }

    // ── VALIDATION WARNINGS ──────────────────────────────────────────────────
    if (validation.warnings.length > 0) {
      content += `\nDATA NOTES (surface these to the student):\n${validation.warnings.map(w => `\u26a0 ${w}`).join("\n")}\n`;
    }

    // ── TIER-BASED PLANNING RULES ────────────────────────────────────────────
    if (planTier === "full") {
      content += `
PLAN TIER: FULL — schedule + required courses + elective options all present.
PLANNING RULES — FOLLOW STRICTLY:
1. Reproduce the OFFICIAL SAMPLE SCHEDULE semester by semester as the backbone
2. For required course slots: use ONLY codes from REQUIRED COURSE CODE MANIFEST — never invent a course
3. For elective slots [technical_elective], [required_math], [free_elective], etc:
   - Fill from the ELECTIVE REQUIREMENTS list matching that slot type
   - Use ONLY 100-499 level courses unless the 500+ code is in REQUIRED COURSE CODE MANIFEST
   - Do NOT write placeholder text like "Technical Elective" — use a real course code and title
4. Cross-check: every code in REQUIRED COURSE CODE MANIFEST must appear somewhere in your plan
5. Use credit hours exactly as listed — write "?" if unknown, never guess
6. After the plan: count total credits and compare to ${majorMatch.totalHours ?? "?"} required
7. End with: "This is a draft based on official UIC requirements. Verify with your academic advisor before registering."`;
    } else if (planTier === "schedule") {
      content += `
PLAN TIER: SCHEDULE — official schedule exists but elective course lists are not in data.
PLANNING RULES — FOLLOW STRICTLY:
1. Reproduce the OFFICIAL SAMPLE SCHEDULE semester by semester as the backbone
2. For required course slots: use ONLY codes from REQUIRED COURSE CODE MANIFEST
3. For elective slots: show the slot label (e.g., [technical_elective]) and note:
   "Approved courses for this slot require advisor confirmation — see catalog"
   Do NOT invent course names or codes for elective slots
4. Do NOT include 500+ level courses unless in REQUIRED COURSE CODE MANIFEST
5. Cross-check: every code in REQUIRED COURSE CODE MANIFEST must appear in your plan
6. After the plan: count total credits and compare to ${majorMatch.totalHours ?? "?"} required
7. End with: "This is a draft based on official UIC requirements. Elective slots require advisor confirmation."`;
    } else if (planTier === "courses_only") {
      content += `
PLAN TIER: COURSES ONLY — required courses exist but NO official semester schedule is on file.
PLANNING RULES — FOLLOW STRICTLY:
\u26a0 CRITICAL: No official semester-by-semester sequence exists for this major in the current data.
   You MUST NOT generate, invent, or improvise a semester sequence.
   Doing so would produce an unreliable plan that could mislead the student.

Instead, present requirements in this exact structure:

SECTION 1 — CORE REQUIRED COURSES
  List every course from REQUIRED COURSE CODE MANIFEST with: code | title | credit hours
  Do NOT skip any course from the manifest.

SECTION 2 — ELECTIVE REQUIREMENTS
  For each elective group: state the credit requirement and list available courses (if any).
  If no options are in data, say: "See catalog or advisor for approved options — do not guess."

SECTION 3 — PLANNING NOTES
  - State total credit requirement (${majorMatch.totalHours ?? "see catalog"} credits for this degree)
  - Write explicitly: "No official semester sequence is available for this major. Work with your academic advisor to determine the best course order and prerequisites."
  - Do NOT write "Year 1", "Year 2", "Semester 1", or any semester-by-semester structure.

Additional constraints:
- Do NOT include any 500+ level courses
- Do NOT write placeholder text like "General Education Course" or "Elective TBD"
- Do NOT invent prerequisites or course sequences`;
    } else {
      content += `
PLAN TIER: MINIMAL — insufficient course data for this major.
PLANNING RULES — FOLLOW STRICTLY:
\u26a0 CRITICAL: Course data for this major is too limited to construct any plan.
   You MUST NOT generate a course list, semester sequence, or credit breakdown.

Respond with:
  "Official course data for this major is not yet fully available in my system.
   For an accurate 4-year plan, please:
   \u2022 Visit catalog.uic.edu and search for [major name]
   \u2022 Contact your academic advisor or the department directly
   \u2022 Visit the UIC advising center (SSB 1220)"

Do NOT invent courses. Do NOT show any plan structure.`;
    }

    return [makeChunk("major_plan", content, 0.97, query)];
  } catch (err) {
    console.error("[retrieveMajorPlan] ERROR:", err);
    return [makeChunk("major_plan", "Visit catalog.uic.edu for official degree requirements. I was unable to retrieve the specific requirement data.", 0.3, query)];
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

  const aspire = (tuitionData as any).financial_aid?.aspire_grant;

if (aspire && (ci.isAboutFinancialAid || query.rawQuery.toLowerCase().includes("aspire"))) {  chunks.push(makeChunk("financial_aid", 
    `ASPIRE GRANT: ${aspire.what_it_is}\nEligibility: ${aspire.eligibility}\nDeadline: ${aspire.deadline}\nApply: ${aspire.how_to_apply}`,
    0.99, query));
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

  if (lower.match(/newspaper|publication|student media|the flame|wuic|student radio|student paper/)) {
    return [makeChunk("student_life",
      `UIC STUDENT MEDIA: Yes, UIC has a student newspaper — The Flame (theflame.uic.edu | @theflameuic). Independent student-run publication covering UIC news, campus events, sports, and opinion. Free print copies on campus. Also: WUIC (student radio). Both operate under the UIC Student Media Board.`,
      0.99, query)];
  }
  if (lower.match(/spark.?fest|spark festival|homecoming|weeks of welcome|wow event|involvement fair|major event/)) {
    return [makeChunk("student_life",
      `UIC MAJOR EVENTS:\nSpark Festival (Spark Fest) — annual fall music festival, free for students. Past headliners: ${sparkArtists}. Held on campus each fall.\nHomecoming — fall. Includes Homecoming Parade, tailgates, alumni events.\nWeeks of Welcome (WOW) — start of semester orientation events.\nInvolvement Fair — each semester, discover 470+ student orgs.\nFlames Finish Strong — finals week study support events.\nInstagram: @thisisuic for announcements.`,
      0.99, query)];
  }
  c += `STUDENT MEDIA: The Flame (student newspaper) — theflame.uic.edu | @theflameuic on Instagram/X. Independent student-run publication covering UIC news, campus events, sports, opinion. Free print copies on campus. Also: WUIC student radio.\n\n`;
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

    // ── Fast-path: specific coach query ───────────────────────────────────
    if (lower.match(/\bcoach\b|\bhead coach\b|\bwho coach/)) {
      const coachSportMatch = allTeams.find((t: any) =>
        lower.includes(t.sport.toLowerCase()) ||
        (t.sport.toLowerCase().includes("volleyball") && lower.includes("volleyball")) ||
        (t.sport.toLowerCase().includes("basketball") && lower.match(/basketball|mbb|wbb/)) ||
        (t.sport.toLowerCase().includes("soccer") && lower.includes("soccer")) ||
        (t.sport.toLowerCase().includes("baseball") && lower.includes("baseball")) ||
        (t.sport.toLowerCase().includes("softball") && lower.includes("softball")) ||
        (t.sport.toLowerCase().includes("tennis") && lower.includes("tennis")) ||
        (t.sport.toLowerCase().includes("swimming") && lower.match(/swim|diving/)) ||
        (t.sport.toLowerCase().includes("golf") && lower.includes("golf")) ||
        (t.sport.toLowerCase().includes("cross country") && lower.match(/cross country|track/)));
      if (coachSportMatch) {
        const gender = ath.teams.mens.includes(coachSportMatch) ? "Men's" : "Women's";
        return [makeChunk("athletics",
          `${gender} ${coachSportMatch.sport}: Head Coach ${coachSportMatch.coach}${coachSportMatch.venue ? ` | Venue: ${coachSportMatch.venue}` : ""}${coachSportMatch.notes ? `\n${coachSportMatch.notes}` : ""}`,
          0.99, query)];
      }
      // No specific sport — return all coaches list
      return [makeChunk("athletics",
        `UIC FLAMES COACHING STAFF:\n` +
        allTeams.map((t: any) => {
          const g = ath.teams.mens.includes(t) ? "Men's" : "Women's";
          return `${g} ${t.sport}: Coach ${t.coach}`;
        }).join("\n"),
        0.95, query)];
    }

    // ── Fast-path: walk-on / tryout queries ───────────────────────────────
    if (lower.match(/walk.?on|tryout|try out|how.*(make|join).*(team)/)) {
      const sportTeam = allTeams.find((t: any) =>
        lower.includes(t.sport.toLowerCase()) ||
        (t.sport.toLowerCase().includes("basketball") && lower.match(/basketball|mbb|wbb/)) ||
        (t.sport.toLowerCase().includes("soccer") && lower.includes("soccer")) ||
        (t.sport.toLowerCase().includes("baseball") && lower.includes("baseball")) ||
        (t.sport.toLowerCase().includes("softball") && lower.includes("softball")) ||
        (t.sport.toLowerCase().includes("volleyball") && lower.includes("volleyball")));
      const teamName = sportTeam ? `${ath.teams.mens.includes(sportTeam) ? "Men's" : "Women's"} ${sportTeam.sport}` : "the team";
      const coachName = sportTeam?.coach ?? "the coaching staff";
      return [makeChunk("athletics",
        `UIC WALK-ON / TRYOUT INFO:\n` +
        `To walk on to the UIC ${teamName}: contact Head Coach ${coachName} directly.\n` +
        `Typical process: (1) email the coaching staff expressing interest, (2) request to attend a practice or open tryout, (3) demonstrate skills.\n` +
        `Find coach contact details at UICFlames.com → [sport page] → Coaching Staff.\n` +
        `UIC Athletics main office: Flames Athletics Center (FAC), 901 W Roosevelt Rd.`,
        0.92, query)];
    }

    const isPersonQuery = lower.match(/\bwho is\b|\bwho('s| is)\b|\btell me about\b|\babout\b/);

    // Search rosters for the person
    const allRosters: Record<string, string[]> = ath.current_rosters_2025_2026 ?? {};
    for (const [rosterKey, players] of Object.entries(allRosters)) {
      if (rosterKey === "note") continue;
      const playerList = players as string[];
      const matched = playerList.filter((p: string) => {
  const pLower = p.toLowerCase();
  const pParts = pLower.split(/\s+/).filter(part => part.length >= 3 && !["ii","iii","jr","sr","iv"].includes(part));
  const qParts = lower.split(/\s+/).filter((w: string) => w.length >= 3);
  // Match if any meaningful part of the player name appears anywhere in the query
  const anyPartMatch = pParts.some(part => lower.includes(part));
  // Match if query words appear in player name (handles reversed names like "nokic eldin" = "eldin nokic")
  const reversedMatch = qParts.filter((w: string) => !["who","is","the","are","about","tell","me","a","an"].includes(w))
    .some((w: string) => pLower.includes(w));
  return anyPartMatch || reversedMatch || lower.includes(pLower);
});
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

    // ── Ticket / cost queries ──────────────────────────────────────────────
    if (lower.match(/ticket|free|cost|price|pay|admission|how much/)) {
      const ticketContent =
        `UIC FLAMES TICKETS:\n` +
        `STUDENTS: FREE with valid UIC student ID for regular season home events.\n` +
        `Flames Fast Pass: $50/year — covers ALL home events EXCEPT basketball (for non-students wanting a season pass).\n` +
        `Basketball: Students use the Flame Force student section — Gate 3, Credit Union 1 Arena, sections 110-112. Follow @uic_studentsection for access details.\n` +
        `Basketball non-student prices: lower/baseline $18, lower/sideline $28, Women's GA $12 adult / $6 youth.\n` +
        `Buy tickets: Ticketmaster, UICFlames.com/Tickets, or call 312-413-UIC1.`;
      chunks.push(makeChunk("athletics", ticketContent, 0.95, query));
    }

    // ── General overview if nothing specific matched ───────────────────────
    if (chunks.length === 0) {
      const content = `UIC FLAMES ATHLETICS — Conference: MVC | Website: UICFlames.com\n` +
        `TICKETS: FREE for students with UIC ID — regular season home events.\n` +
        `Flames Fast Pass: $50 — non-student season pass covering all home events except basketball.\n\n` +
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
  // ── U-Pass / Ventra ───────────────────────────────────────────────────────
  if (lower.match(/\bu.?pass\b|transit pass|ventra/i)) {
    chunks.push(makeChunk("transportation",
      `CTA U-PASS (UIC Ventra Transit Pass):
All UIC students enrolled in 6+ credit hours automatically receive a U-Pass as part of their semester fees.
Cost: $163/semester — already included in mandatory fees. No extra charge.
What it covers: Unlimited rides on all CTA buses and rail lines (Blue Line, Pink Line, Red Line, all buses) for the full semester.
How to get it: Your Ventra card is automatically activated each semester when enrolled and fees are paid. Pick up a new Ventra card at the UIC Card Office in Student Center East (750 S Halsted St) or any CTA station.
Renewal: Reactivates automatically every semester you're enrolled and fees are current.
Lost card: Replace at any CTA customer service location ($5 replacement fee).
Questions: transportation.uic.edu | CTA: 888-968-7282`,
      0.97, query));
  }
  // ── Transportation ────────────────────────────────────────────────────────
  if (lower.match(/\bcta\b|blue line|pink line|\bbus\b|train|transit|how (do i )?get (to|there)|o.?hare|midway|airport|getting.?to.?uic|from.?airport/)) {
    const t = b.transportation;
    const trains = t.cta_trains.map((s: any) => `${s.line} — ${s.station}: closest to ${s.closest_to}`).join("\n");
    const buses = t.key_cta_buses.slice(0, 4).map((s: any) => `${s.route}: ${s.notes}`).join("\n");
    const airportDirections = lower.match(/o.?hare|airport|midway/)
      ? `\n\nFROM O'HARE AIRPORT: Take the Blue Line (Forest Park direction) → ride to UIC-Halsted station (~45 min, $2.50 fare or use U-Pass). UIC-Halsted is the main east campus stop.\nFROM MIDWAY AIRPORT: Take Orange Line → transfer at Harold Washington Library or Roosevelt → connect to Pink Line → Polk station (west campus). Or take the #60 bus to UIC.`
      : "";
    chunks.push(makeChunk("transportation",
      `CTA TO UIC:\n${trains}\n\nKEY BUSES:\n${buses}${airportDirections}`,
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
  const lower = query.rawQuery.toLowerCase();
  const isGraduationQuery = lower.match(
    /\b(how many|credit|credits|hours?|requirements?).{0,25}(graduate|graduation|degree|finish|complete)\b/
  ) || lower.match(/\bgraduation requirements?\b/);

  if (isGraduationQuery) {
    const ha2 = healthData as any;
    const ap = ha2?.academic_policies;
    const gr = ap?.graduation_requirements;
    const lh = ap?.latin_honors;

    const gradContent = gr
      ? `GRADUATION REQUIREMENTS AT UIC:
Minimum credit hours: 120 (most undergraduate programs; some require more)
Minimum cumulative GPA: ${gr.minimum_gpa}
General Education: ${gr.gen_ed}
Residency: Last 30 credit hours must be completed at UIC.
Latin Honors: Cum Laude ${lh?.cum_laude ?? "3.50+"} | Magna Cum Laude ${lh?.magna_cum_laude ?? "3.75+"} | Summa Cum Laude ${lh?.summa_cum_laude ?? "3.90+"}
Apply to graduate: registrar.uic.edu — apply by the deadline each semester.
Contact: Registrar's Office, SSB Suite 1200 | registrar.uic.edu | 312-996-4350`
      : `GRADUATION REQUIREMENTS AT UIC:
Minimum credit hours: 120 (most undergraduate programs; some require more)
Minimum cumulative GPA: 2.00
General Education: 24+ credit hours across 6 gen ed categories
Residency: Last 30 credit hours must be completed at UIC.
Latin Honors: Cum Laude 3.50+ | Magna Cum Laude 3.75+ | Summa Cum Laude 3.90+
Apply to graduate: registrar.uic.edu — apply by the deadline each semester.
Contact: Registrar's Office, SSB Suite 1200 | registrar.uic.edu | 312-996-4350`;

    return [makeChunk("academic_policy", gradContent, 0.97, query)];
  }

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
  const adm = admissionsData as any;
  const fy = adm.first_year;
  const tr = adm.transfer;
  const sc = adm.scholarships;
  const lower = query.rawQuery.toLowerCase();

  // ── Fast-path: English proficiency / Duolingo queries ─────────────────────
  const chunks: RetrievedChunk[] = [];
  if (lower.match(/duolingo|english proficiency|toefl|ielts|language test|esl|english.*test|test.*english/)) {
    const intl = (admissionsData as any).international ?? {};
    return [makeChunk("admissions",
      `UIC ENGLISH PROFICIENCY REQUIREMENTS:\n` +
      `Accepted tests: TOEFL (minimum ${intl.toefl_minimum ?? "80"} iBT), IELTS (minimum ${intl.ielts_minimum ?? "6.5"}), Duolingo English Test (minimum ${intl.duolingo_minimum ?? "105"}).\n` +
      `${intl.english_proficiency_note ?? ""}\n` +
      `For more info: oaa.uic.edu/undergraduate-admissions or contact the Office of Admissions.`,
      0.99, query)];
  }

  // ── Fast-path: college/school existence queries ──────────────────────────
  if (lower.match(/\b(law school|john marshall|college of|school of|colleges|schools|nursing school|medical school|dental school|pharmacy school|architecture school|education school|public health|social work|engineering school|business school)\b/)) {
    chunks.push(makeChunk("admissions",
      `UIC COLLEGES & SCHOOLS: UIC has 16 colleges and schools:\n` +
      `Liberal Arts and Sciences (LAS) | Engineering | Business Administration (UIC Business) | Architecture Design and the Arts (CADA) | Education | Applied Health Sciences | Nursing | Public Health | Pharmacy | Medicine (UIC College of Medicine) | Dentistry | Social Work | Urban Planning and Public Affairs (CUPPA) | School of Law (UIC John Marshall Law School, downtown Chicago, 300 S State St — full JD program, LLM, law clinics, founded 1899 merged with UIC 2015) | Honors College | Graduate College`,
      0.99, query));
    if (chunks.length > 0 && !lower.match(/\b(deadline|apply|application|scholarship|transfer|aspire|gpa|test|sat|act)\b/)) {
      return chunks; // College existence query — return fast, no need for full admissions chunk
    }
  }

  const content = `=== UIC ADMISSIONS 2025-2026 ===\n` +
    `Platform: ${fy.application_platform} | Test policy: ${fy.test_policy} | ${fy.no_enrollment_deposit}\n` +
    `First-Year deadlines: Priority ${fy.deadlines.priority} | Regular ${fy.deadlines.regular} | Spring ${fy.deadlines.spring}\n` +
    `Transfer: Fall ${tr.regular_deadline} | Spring ${adm.readmission?.deadline?.split(",")[1]?.trim() ?? "Oct 15"} | Min ${tr.minimum_credits} | GPA: ${tr.minimum_gpa}\n` +
    `Guaranteed Transfer: ${tr.community_college_pathway}\n\n` +
    `SCHOLARSHIPS:\n` +
    `Aspire Grant: ${sc.aspire_grant.amount}. Deadline ${sc.aspire_grant.deadline}\n` +
    `Chancellor's Fellows: ${sc.chancellors_fellows.amount}. Deadline ${sc.chancellors_fellows.deadline}\n` +
    `President's Award: ${sc.presidents_award.amount}. Deadline ${sc.presidents_award.deadline}\n` +
    `Merit Tuition Award: ${sc.merit_tuition_award.amount}\n\n` +
    `AFTER ADMISSION: Activate NetID | Placement tests by June 30 | Apply housing (housing.uic.edu) | File FAFSA | Register orientation\n` +
    `Visits: ${adm.campus_visits.url} | Admitted hub: ${adm.campus_visits.admitted_students}\n\n` +
      `UIC COLLEGES & SCHOOLS: Liberal Arts and Sciences (LAS) | Engineering | Business Administration | Architecture Design and the Arts (CADA) | Education | Applied Health Sciences | Nursing | Public Health | Pharmacy | Medicine | Dentistry | Social Work | Urban Planning and Public Affairs | School of Law (formerly John Marshall Law School) | Honors College`;

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
  const lib = libraryData as any;
  // libraries is an array — find by name/abbreviation
  const libraries: any[] = Array.isArray(lib.libraries) ? lib.libraries : Object.values(lib.libraries ?? {});
  const daley = libraries.find((l: any) => l.abbreviation === "Daley" || l.name?.includes("Daley")) ?? {};
  const lhs = libraries.find((l: any) => l.abbreviation?.includes("LHS") || l.name?.includes("Health Sciences")) ?? {};
  const borrowing = lib.borrowing ?? lib.borrowing_policies ?? {};
  const research = lib.research_support ?? lib.research_help ?? {};

  const content = `=== LIBRARY ===\n` +
    `Daley Library: ${daley.address ?? "801 S Morgan"} | ${daley.phone ?? "(312) 996-2724"} | Hours: ${daley.hours?.regular_semester ?? "Mon-Thu 8AM-midnight, Fri 8AM-10PM, Sat 10AM-8PM, Sun 10AM-midnight"}\n` +
    `Finals week: ${daley.hours?.finals_week ?? "24/7 extended hours"}. Breaks: ${daley.hours?.breaks ?? "Mon-Fri 8AM-5PM"}\n` +
    `Quiet areas: ${(daley.quiet_floors ?? daley.quiet_areas ?? ["3rd floor", "4th floor", "Circle Reading Room"]).join(", ")}\n` +
    `LHS Chicago: ${lhs.address ?? "1750 W Polk St"} | ${lhs.phone ?? "(312) 996-8966"} | Hours: ${lhs.hours?.regular_semester ?? "Mon-Thu 7:30AM-10PM, Fri 7:30AM-7PM, Sat-Sun 11AM-7PM"}\n` +
    `Study rooms: libcal.uic.edu | Current hours: library.uic.edu/hours\n\n` +
    `BORROWING:\n` +
    `${Object.entries(borrowing?.loan_periods ?? {}).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" | ")}\n` +
    `Fines: ${borrowing?.fines ?? "No fines until 39 days past due"}. Lost item: ${borrowing?.lost_item_fee ?? "$125+"}\n` +
    `PRINTING: Wepa stations campus-wide\n` +
    `ILL: I-Share 3-5 days | ILLiad 7-10 days\n` +
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

function assembleContext(
  chunks: RetrievedChunk[],
  brief: AnswerBrief,
  isFact = false,
  domainConfidence: Partial<Record<string, number>> = {}
): string {
  // P2.4: Domain isolation — filter noise from unrelated domains when one domain is clearly dominant.
  // "Dominant" = single domain >= 0.80 confidence, no co-domain >= 0.60.
  const dcEntries = Object.entries(domainConfidence).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
  const topScore = dcEntries[0]?.[1] ?? 0;
  const codomainCount = dcEntries.filter(([, s]) => (s ?? 0) >= 0.60).length;
  const isDominant = topScore >= 0.80 && codomainCount <= 1;

  const eligible = isDominant
    ? chunks.filter(c => (domainConfidence[c.domain] ?? 0) >= 0.25)
    : chunks;
  // Safety: if filtering removes everything, fall back to all chunks
  const filtered = eligible.length > 0 ? eligible : chunks;

  // For fact queries: trust the source more than keyword overlap.
  // For all others: relevance leads.
  const scored = filtered.map(c => ({
    ...c,
    finalScore: isFact
      ? c.relevanceScore * 0.4 + c.sourceConfidence * 0.6
      : c.relevanceScore * 0.6 + c.sourceConfidence * 0.4,
  })).sort((a, b) => b.finalScore - a.finalScore);

  // Deduplicate by content fingerprint
  const seen = new Set<string>();
  const selected: typeof scored = [];
  let totalTokens = 0;
  const TOKEN_LIMIT = 4000;

  for (const chunk of scored) {
    // Normalize whitespace before fingerprinting so domain-prefix variations
    // don't mask true duplicates, and increase length to 150 so near-identical
    // chunks with different prefixes are distinguished correctly.
    const fingerprint = chunk.content.replace(/\s+/g, " ").slice(0, 150);
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

// ═══════════════════════════════════════════════════════════════════════════════
// ANSWER PACK BUILDER — converts retrieval output into typed evidence pack
// This is what the final model writes from, not raw chunks
// ═══════════════════════════════════════════════════════════════════════════════

interface AnswerPack {
  answerMode: AnswerMode;
  resolvedIntent: string;
  resolvedEntities: { type: string; value: string }[];
  directFacts: string[];
  rankedEvidence: { source: string; content: string; trust: "official" | "review" | "generated" }[];
  caveats: string[];
  maxResponseShape: string;
}

function buildAnswerPack(
  query: QueryAnalysis,
  chunks: RetrievedChunk[],
  intent: any,
  sessionState: any
): AnswerPack {
  // Resolve entities
  const resolvedEntities: { type: string; value: string }[] = [];
  if (intent.courseCode) resolvedEntities.push({ type: "course", value: `${intent.courseCode.subject} ${intent.courseCode.number}` });
  if (intent.profNameHint) resolvedEntities.push({ type: "professor", value: intent.profNameHint });
  if (intent.subjectCode) resolvedEntities.push({ type: "subject", value: intent.subjectCode });
  if (sessionState?.activeCourseCode && !intent.courseCode) resolvedEntities.push({ type: "course_from_session", value: sessionState.activeCourseCode });
  if (sessionState?.activeProfessorName && !intent.profNameHint) resolvedEntities.push({ type: "professor_from_session", value: sessionState.activeProfessorName });

  // Extract direct facts from chunks — lines with numbers, names, specifics
  const directFacts: string[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks.slice(0, 5)) {
    const lines = chunk.content.split("\n").filter(l => l.trim() && !l.startsWith("===") && !l.startsWith("["));
    for (const line of lines.slice(0, 3)) {
      const key = line.trim().slice(0, 60);
      if (!seen.has(key) && line.match(/\d|GPA|%|Prof|Course|\$|deadline|hours/i)) {
        seen.add(key);
        directFacts.push(line.trim());
      }
    }
    if (directFacts.length >= 6) break;
  }

  // Rank evidence by trust level
  const rankedEvidence = chunks.slice(0, 6).map(chunk => {
    let trust: "official" | "review" | "generated" = "official";
    if (chunk.domain === "professors" && chunk.content.includes("Student reviews")) trust = "review";
    else if (chunk.content.includes("consensus") || chunk.content.includes("students say")) trust = "review";
    else if (chunk.content.includes("SEMANTIC SUPPORT")) trust = "generated";
    return {
      source: chunk.domain,
      content: chunk.content.slice(0, 400),
      trust,
    };
  });

  // Detect caveats
  const caveats: string[] = [];
  if (chunks.length === 0) caveats.push("No direct data found — answer from general knowledge only");
  if (chunks.every(c => c.relevanceScore < 0.6)) caveats.push("Retrieved data is loosely related — answer with caution");
  if (intent.courseCode && !chunks.some(c => c.domain === "courses" || c.domain === "professors")) {
    caveats.push(`Specific data for ${intent.courseCode.subject} ${intent.courseCode.number} may be limited`);
  }

  // Response shape by mode
  const shapeMap: Record<AnswerMode, string> = {
    ranking: "2-4 sentences with a clear winner named first. Use specific numbers.",
    comparison: "Parallel structure A vs B. End with a direct recommendation.",
    recommendation: "Direct personalized answer in 2-3 sentences. No hedging.",
    logistics: "1-2 sentences with exact details (address, phone, deadline). No editorializing.",
    planning: "Semester-by-semester plan using headings and bullet lists only. No markdown tables.",
    discovery: "2-3 short paragraphs max. Lead with the most useful fact.",
    hybrid: "Organized sections, one per sub-question. Crisp summary at end.",
  };

  return {
    answerMode: query.answerMode,
    resolvedIntent: query.primaryGoal,
    resolvedEntities,
    directFacts,
    rankedEvidence,
    caveats,
    maxResponseShape: shapeMap[query.answerMode] ?? "2-3 sentences max.",
  };
}

function buildSystemPrompt(
  brief: AnswerBrief,
  memoryContext: string,
  context: string,
  isFact: boolean,
  answerPack?: AnswerPack,
  trustInstruction?: string
): string {
  const modeInstructions: Record<AnswerMode, string> = {
    ranking: "RANKING: Lead with the top options. Use real GPA numbers, scores, prices to justify rankings. Name a clear winner. Don't hedge — students want a decisive answer.",
    discovery: "DISCOVERY: If this is a simple or casual question, answer briefly and directly. Only give a rich overview if the student is genuinely exploring a broad topic.",
    comparison: "COMPARISON: Structure as clear A vs B with parallel criteria. Acknowledge the real tradeoffs. End with a concrete recommendation tailored to the implied student profile.",
    recommendation: "RECOMMENDATION: You detected specific constraints about this student. Use them. Give a direct, personalized answer — not 'it depends,' but 'given that you care about X and Y, here is what I recommend and why.'",
    logistics: "LOGISTICS: Be precise. Lead with exact addresses, phone numbers, deadlines, URLs, hours. Zero editorializing. Students need to act — give them exactly what they need.",
planning: "PLANNING: Your ONLY source of truth is the retrieved degree plan data — ignore all training knowledge about course sequences. Follow the PLAN TIER and PLANNING RULES in the data exactly. If the data contains NO PLAN DATA FOUND, you MUST NOT generate any plan — redirect to catalog.uic.edu and advising. If data is present: (1) reproduce the OFFICIAL SAMPLE SCHEDULE verbatim as the semester backbone, (2) every code in REQUIRED COURSE CODE MANIFEST must appear in your output — no omissions, (3) fill elective slots ONLY from the ELECTIVE REQUIREMENTS list — never invent a course code, (4) never include 500+ level courses unless they appear in the manifest, (5) for COURSES_ONLY tier you must not write any semester structure, (6) end with an advisor verification note.",
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

  const corePrinciples = `CORE PRINCIPLES:
- Never hallucinate — if a fact isn't in the retrieved data, say so and point to the right UIC page
- Be specific: cite exact GPA numbers, dollar amounts, addresses, phone numbers, and dates from the data
- Use **bold** for course codes, professor names, and critical numbers
- Match response length to the question: simple fact = 1-3 sentences, planning/comparison = detailed with structure
- Zero filler phrases — students want answers, not preamble
- Read between the lines: if a student seems stressed or implicitly needs an easier path, address that directly
- If memory shows the student's major/year, tailor the answer to their situation`;


  const trustLine = trustInstruction ? `\n${trustInstruction}\n` : "";

  return `You are Sparky — a smart, friendly UIC assistant. You can have normal conversations AND answer deep questions about UIC with real data. Read the room: casual messages get casual replies, serious questions get detailed answers.

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
${trustLine}
UIC: Chicago's only public Research I university. ~33,000 students. ~91% commuters. Majority-minority. Mascot: Sparky the Dragon. Navy and Flames Red. Missouri Valley Conference (MVC). Go Flames!
${memoryContext ? "\n" + memoryContext + "\n" : ""}
${answerPack ? `
--- ANSWER PACK ---
INTENT: ${answerPack.resolvedIntent}
ENTITIES: ${answerPack.resolvedEntities.map(e => `${e.type}=${e.value}`).join(", ") || "none"}
RESPONSE SHAPE: ${answerPack.maxResponseShape}
${answerPack.caveats.length > 0 ? `CAVEATS: ${answerPack.caveats.join(" | ")}` : ""}

KEY FACTS (use these first):
${answerPack.directFacts.slice(0, 5).join("\n") || "none extracted"}

EVIDENCE (official > review > generated):
${answerPack.rankedEvidence.map(e => `[${e.trust.toUpperCase()}/${e.source}] ${e.content}`).join("\n\n")}
--- END ANSWER PACK ---` : `
--- RETRIEVED DATA ---
${context}
--- END DATA ---`}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN POST HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(req: Request) {
  const requestStartMs = Date.now();

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

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: "anonymous",
    event: "chat_api_request",
    properties: {
      message_count: messages.length,
      last_message_length: lastMsg.length,
    },
  });

// ── Session & query analysis ──────────────────────────────────────────────
// ── Casual message fast path ──────────────────────────────────────────────
  const { sessionId, isNew } = resolveSession(req);
  const casualPatterns = /^(hey|hi|hello|sup|yo|what'?s? ?up|how are you|how r u|thanks|thank you|thx|ok|okay|cool|nice|great|lol|haha|lmao|😂|👍|k|kk|gotcha|got it|makes sense|sounds good|perfect|awesome|sure|np|no problem|good|good morning|good afternoon|good evening|morning|night|bye|goodbye|see ya|later)[\s!?.]*$/i;

  if (casualPatterns.test(lastMsg.trim())) {
    const casualResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      system: `You are Sparky, a friendly UIC assistant. The student just sent a casual message. Reply casually and briefly like a friend would — 1 sentence max. No UIC data, no lists, no preamble. Just be natural and warm.`,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const casualText = (casualResponse.content[0] as any)?.text ?? "Hey!";
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(casualText));
        controller.close();
      },
    });
    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  // ── Follow-up fast path ───────────────────────────────────────────────────
const followUpPatterns = /^(tell me more|more info|elaborate|explain more|what about (that|this|him|her|it|them)|and (him|her|it|them|that|this)|what else|any other|go on|continue|what do you mean|how so|why|really\??|interesting|what about his|what about her|what about their|and (what about)?|more details?|can you elaborate|expand on that|what does that mean)[\s?!.]*$/i;

if (followUpPatterns.test(lastMsg.trim()) && messages.length >= 3) {
  const recentContext = messages.slice(-4).map(m => `${m.role}: ${m.content}`).join("\n");
  const followUpResponse = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 600,
    system: `You are Sparky, a UIC assistant. The student is following up on a previous answer. Use the conversation context to give a natural, relevant continuation. Be concise. Don't repeat what you already said.`,
    messages: [
      { role: "user", content: `Conversation so far:\n${recentContext}\n\nStudent's follow-up: "${lastMsg}"\n\nContinue naturally.` }
    ],
  });

  const followUpText = (followUpResponse.content[0] as any)?.text ?? "Could you be more specific?";
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(followUpText));
      controller.close();
    },
  });
  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

  const query = analyzeQuery(lastMsg, messages.slice(0, -1));

// ── Fetch memory first, then classify with it ─────────────────────────────
const userMemory = await getMemory(sessionId).catch(() => null);

const sessionState = await getSessionState(sessionId).catch(() => ({
  activeCourseId: null, activeCourseCode: null,
  activeProfessorId: null, activeProfessorName: null,
  activeHall: null,
  activeDomain: null, lastAnswerType: null, lastTopics: [],
}));

const [aiIntentResult, regexIntentResult, regexCiResult] = await Promise.allSettled([
  classifyIntent(lastMsg, messages.slice(0, -1), userMemory),
  Promise.resolve(detectIntent(lastMsg)),
  Promise.resolve(detectCampusIntent(lastMsg)),
]);

const aiIntent = aiIntentResult.status === "fulfilled" ? aiIntentResult.value : null;

// P2.2: Semantic answerMode override — AI classification wins over regex when available.
// Regex stays as fallback (already set in query.answerMode via detectAnswerMode).
const semanticMode = aiIntent?.answerMode;
if (semanticMode && semanticMode !== query.answerMode) {
  // Regex has strong signal for planning/comparison — only override for weaker cases
  const regexIsStrong = query.answerMode === "planning" || query.answerMode === "comparison";
  if (!regexIsStrong) {
    query.answerMode = semanticMode;
  }
}
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

// ── Multi-turn entity inheritance — resolve ambiguous follow-ups ──────────────
const lower2 = lastMsg.toLowerCase();

// Inherit active course when query is about courses/professors and no explicit course given
if (!intent.courseCode && !intent.subjectCode && sessionState.activeCourseCode &&
    (intent.isAboutCourses || intent.isAboutProfessors || intent.wantsEasiest || intent.wantsProfRanking)) {
  const parts = sessionState.activeCourseCode.split(" ");
  if (parts.length >= 2) {
    intent.courseCode = { subject: parts[0], number: parts[1] };
  }
}

// Inherit active professor — pronouns OR any professor-specific query with no name given
if (!intent.profNameHint && sessionState.activeProfessorName) {
  const profFollowUp =
    lower2.match(/\b(him|her|that prof|that professor|same prof|they|their|his|her)\b/) ||
    lower2.match(/^(what about|tell me more|more about|and him|and her|how about)[\s?!.]*$/i) ||
    // Also inherit when clearly asking about professor attributes without naming one
    (intent.wantsProfRanking && !intent.profNameHint) ||
    lower2.match(/\b(their (rating|score|gpa|difficulty|reviews?|rmp|grade|class))\b/);
  if (profFollowUp) {
    intent.profNameHint = sessionState.activeProfessorName;
  }
}

// Inject active hall into query for housing follow-ups ("does it have a gym?", "how much is it?")
if (!lower2.match(/\b(arc|jst|cmw|cms|cmn|mrh|tbh|ssr|psr|cty)\b/i) &&
    sessionState.activeHall &&
    (ci.isAboutHousing || ci.isAboutMealPlan || ci.isAboutDining || ci.isAboutLLC ||
     lower2.match(/\b(it|that|there|the dorm|the hall|the res(idence)?)\b/)) &&
    sessionState.activeDomain === "housing") {
  // Append hall to query so scoreChunk can match it in housing chunk content
  (query as any)._inheritedHall = sessionState.activeHall;
}

  // Memory-boosted retrieval — inject user's known major/interests into intent
if (userMemory?.major && !intent.subjectCode && !intent.deptName) {
  const m = userMemory.major.toLowerCase();
  if (m.includes("computer science") || m.includes(" cs")) intent.subjectCode = "CS";
  else if (m.includes("ece") || m.includes("electrical")) intent.subjectCode = "ECE";
  else if (m.includes("math")) intent.subjectCode = "MATH";
  else if (m.includes("biology")) intent.subjectCode = "BIOS";
  else if (m.includes("chemistry")) intent.subjectCode = "CHEM";
  else if (m.includes("physics")) intent.subjectCode = "PHYS";
  else if (m.includes("psychology")) intent.subjectCode = "PSCH";
  else if (m.includes("nursing")) intent.subjectCode = "NURS";
  else if (m.includes("accounting")) intent.subjectCode = "ACTG";
  else if (m.includes("finance")) intent.subjectCode = "FIN";
}

// Boost domain confidence for known interests
if (userMemory?.interests?.some(i => i.toLowerCase().includes("greek") || i.toLowerCase().includes("sport"))) {
  if (!dc["student_life"]) dc["student_life"] = 0.6;
}
if (userMemory?.interests?.some(i => i.toLowerCase().includes("sport") || i.toLowerCase().includes("basketball"))) {
  if (!dc["athletics"]) dc["athletics"] = 0.6;
}

// ── Boost domain confidence from AI intent signals ─────────────────────────
// AI classifier correctly detects domains that regex keywords miss (e.g. "sports" ≠ "sport",
// "safe?" trailing punctuation, O'Hare not in transport keywords, etc.).
// Without this boost, scoreChunk under-scores the retrieved chunk → insufficient_evidence → wrong abstain.
if (ci.isAboutAthletics)        dc["athletics"]       = Math.max(dc["athletics"] ?? 0, 0.90);
if (ci.isAboutSafety)           dc["safety"]          = Math.max(dc["safety"] ?? 0, 0.90);
if (ci.isAboutTransportation)   dc["transportation"]  = Math.max(dc["transportation"] ?? 0, 0.90);
if (ci.isAboutCampusMap)        dc["campus_map"]      = Math.max(dc["campus_map"] ?? 0, 0.82);
if (ci.isAboutStudentLife)      dc["student_life"]    = Math.max(dc["student_life"] ?? 0, 0.82);
if (ci.isAboutHealth)           dc["health"]          = Math.max(dc["health"] ?? 0, 0.88);
if (ci.isAboutRecreation)       dc["recreation"]      = Math.max(dc["recreation"] ?? 0, 0.85);
if (ci.isAboutAcademicPolicies) dc["academic_policy"] = Math.max(dc["academic_policy"] ?? 0, 0.82);
if (ci.isAboutCalendar)         dc["calendar"]        = Math.max(dc["calendar"] ?? 0, 0.82);
if (ci.isAboutHousing)          dc["housing"]         = Math.max(dc["housing"] ?? 0, 0.88);
if (ci.isAboutDining)           dc["dining"]          = Math.max(dc["dining"] ?? 0, 0.85);
if (ci.isAboutTuition)          dc["tuition"]         = Math.max(dc["tuition"] ?? 0, 0.85);
if (ci.isAboutFinancialAid)     dc["financial_aid"]   = Math.max(dc["financial_aid"] ?? 0, 0.88);
// Admissions + international have no ci flags — detect via broader keyword patterns
if ((dc["admissions"] ?? 0) < 0.5 && lower.match(/\b(sat|act|test.?optional|admit|accept|waitlist|defer|enroll(?:ment)?|application|apply|admission|require(?:ment)?|deadline|acceptance|incoming|first.?year|transfer student|deposit|orientation|law school|college of|school of|colleges|schools at|programs offered)\b/)) {
  dc["admissions"] = Math.max(dc["admissions"] ?? 0, 0.82);
}
if ((dc["international"] ?? 0) < 0.5 && lower.match(/\bi.?20\b|opt\b|cpt\b|f.?1\b|international student|ois\b|sevis|renew.*visa|visa.*renew|study abroad/i)) {
  dc["international"] = Math.max(dc["international"] ?? 0, 0.85);
}

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
  if (((dc["athletics"] ?? 0) > 0.5 || (dc["student_life"] ?? 0) > 0.5) && (dc["instagram"] ?? 0) <= 0.5) {
  syncChunks.push(...retrieveInstagram(query));
}
  if ((dc["recreation"] ?? 0) > 0.5 && !(dc["health"] ?? 0)) syncChunks.push(...retrieveRecreation(query));
  // ── Program/major queries: force admissions + advising ───────────────
  if (
    lower.match(/\b(major|program|degree|school|college|department)\b/) &&
    lower.match(/\b(does|have|offer|switch|change|declare|add|double|what|which|how)\b/)
  ) {
    if (!syncChunks.some(c => c.domain === "admissions")) {
      syncChunks.push(...retrieveAdmissions(query));
    }
    if (!syncChunks.some(c => c.domain === "academic_policy")) {
      syncChunks.push(...retrieveAdvising(query));
    }
  }

  // ── Graduation credit queries: force calendar ─────────────────────────
  if (
    lower.match(/\b(credits?|credit hours?|requirements?).{0,20}(graduate|graduation|degree|finish)\b/) ||
    lower.match(/\bhow (many|much).{0,15}(credit|hour)\b/)
  ) {
    if (!syncChunks.some(c => c.domain === "calendar" || c.domain === "academic_policy")) {
      syncChunks.push(...retrieveCalendar(query));
    }
  }
  if (lower.match(/\bhonors\b|veteran|commuter|first.?gen|bridge program|academic recovery|eop\b/)) {
  const sp = specialPopData as any;
  const lower2 = lower;
  let spContent = "";
  if (lower2.includes("honors")) spContent = `HONORS COLLEGE: GPA to maintain ${sp.honors_college.gpa_to_maintain} | Required: ${sp.honors_college.honors_units_required} | ${sp.honors_college.url}`;
  else if (lower2.includes("veteran")) spContent = `VETERANS: ${JSON.stringify(sp.veterans).slice(0, 300)}`;
  else if (lower2.includes("commuter")) spContent = `COMMUTER RESOURCES: ${JSON.stringify(sp.commuter).slice(0, 300)}`;
  else if (lower2.match(/first.?gen/)) spContent = `FIRST-GEN RESOURCES: ${JSON.stringify(sp.first_gen).slice(0, 300)}`;
  else if (lower2.includes("bridge")) spContent = `BRIDGE PROGRAMS: ${JSON.stringify(sp.bridge_programs).slice(0, 300)}`;
  if (spContent) syncChunks.push(makeChunk("student_life", spContent, 0.95, query));
}

  // ── Execute async (DB) retrievals in parallel ─────────────────────────────
  const asyncTasks: Promise<RetrievedChunk[]>[] = [];
  // Typed SQL routing — "who's easiest for CS 211?" never hits vector search
if (intent.courseCode && (intent.isAboutProfessors || intent.wantsEasiest || intent.wantsProfRanking || intent.wantsHardest)) {
  asyncTasks.push((async () => {
    const result = await fetchProfessorsForCourse(
      intent.courseCode!.subject,
      intent.courseCode!.number,
      !intent.wantsHardest
    );
    if (!result) return [];
    const { course, instructors } = result;
    if (instructors.length === 0) return [];
    const content = `=== PROFESSORS FOR ${course.subject} ${course.number}: ${course.title} (ranked by ${intent.wantsHardest ? "hardest" : "easiest"} grader) ===\n` +
      `Course avg GPA: ${course.avgGpa ?? "N/A"}\n\n` +
      instructors.slice(0, 8).map((i, idx) =>
        `${idx + 1}. ${i.name} | GPA: ${i.gpa?.toFixed(2) ?? "N/A"} | A-rate: ${i.aRate ?? "N/A"}% | W-rate: ${i.wRate ?? "N/A"}%` +
        (i.rmpQuality ? ` | RMP: ${i.rmpQuality}/5 (${i.rmpRatingsCount} reviews)` : "") +
        ` | ${i.totalStudents} students` +
        (i.aiSummary ? `\n   "${i.aiSummary.slice(0, 150)}"` : "")
      ).join("\n");
    return [makeChunk("professors", content, 0.99, query)];
  })());
}

// Typed SQL routing — "easiest CS courses", "highest GPA math classes"
if ((intent.isAboutCourses || intent.wantsEasiest || intent.wantsHardest) && !intent.courseCode && (intent.subjectCode || intent.deptName)) {
  asyncTasks.push((async () => {
    const courses = await fetchCourseGpaRanking(
      intent.subjectCode ?? null,
      intent.deptName ?? null,
      !intent.wantsHardest,
      intent.isAboutGenEd,
      20
    );
    if (!courses.length) return [];
    const label = intent.subjectCode || intent.deptName || "UIC";
    const content = `=== ${label.toUpperCase()} COURSES RANKED BY GPA (${intent.wantsHardest ? "hardest" : "easiest"} first) ===\n` +
      courses.map((c: any) =>
        `${c.subject} ${c.number} — ${c.title}: GPA ${c.avgGpa?.toFixed(2) ?? "N/A"}${c.isGenEd ? ` [Gen Ed: ${c.genEdCategory}]` : ""}`
      ).join("\n");
    return [makeChunk("courses", content, 0.97, query)];
  })());
}
  if (intent.courseCode) asyncTasks.push(retrieveCourseDetail(intent, query));
  if ((dc["courses"] ?? 0) > 0.5 || intent.isAboutCourses) asyncTasks.push(retrieveCourseList(intent, query));
  if ((dc["gen_ed"] ?? 0) > 0.5 || intent.isAboutGenEd) asyncTasks.push(retrieveGenEd(query));
  if ((dc["professors"] ?? 0) > 0.5 || intent.isAboutProfessors) asyncTasks.push(retrieveProfessors(intent, query));
  if ((dc["major_plan"] ?? 0) > 0.5 || query.answerMode === "planning") asyncTasks.push(retrieveMajorPlan(query));
  if ((dc["athletics"] ?? 0) > 0.5 || ci.isAboutAthletics) asyncTasks.push(retrieveAthletics(query));

  // Vector search in parallel — only for discovery/recommendation or when structured retrieval found nothing
const vectorSourceTypes = getVectorSourceTypes(query);

const vectorTask = syncChunks.length < 2
  ? vectorSearch(lastMsg, 8, { sourceTypes: vectorSourceTypes }).catch(() => [])
  : vectorSearch(lastMsg, 4, { sourceTypes: vectorSourceTypes }).catch(() => []);

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
const relevantVectors = (vectorResults as any[]).filter((r: any) => r.similarity > 0.52);

// Planning mode: skip vector chunks — retrieveMajorPlan() provides authoritative
// structured data; professor reviews and vector hits would only contaminate.
if (relevantVectors.length > 0 && !query.isFact && query.answerMode !== "planning") {
  const perVectorChunks: RetrievedChunk[] = relevantVectors.map((r: any) => {
    const domain = mapVectorSourceTypeToDomain(r.sourceType);
    const confidence = vectorSourceConfidence(r.sourceType, r.trustLevel);

    const chunk = makeChunk(
      domain,
      r.content,
      confidence,
      query
    );

    // semantic hits should not overpower official JSON / SQL
    chunk.relevanceScore = Math.min(chunk.relevanceScore, r.similarity);

    return chunk;
  });

  allChunks.push(...perVectorChunks);
}

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
  // Rerank all chunks before assembly — never pass raw nearest neighbors to the model
const rerankTopK = query.isFact ? 3 : query.answerMode === "planning" ? 10 : query.answerMode === "comparison" ? 8 : query.answerMode === "ranking" ? 6 : 7;
const rerankedChunks = allChunks.length > rerankTopK ? await rerankChunks(lastMsg, allChunks, rerankTopK) : allChunks;

// ── Abstention gate ───────────────────────────────────────────────────────
// Runs after reranking, before any model call.
// If evidence is too weak, return a helpful redirect without calling Sonnet.

const ABSTAIN_SCORE_THRESHOLD = 0.38;

// High-trust sources: SQL grade data and official JSON retrievers.
// Vector results (max 0.70) and generated aiSummary (0.40) never qualify.
// A chunk is high-trust when its sourceConfidence >= 0.90.
const hasHighTrustSource = rerankedChunks.some(
  c => c.sourceConfidence >= 0.90
);

const topChunkScore = rerankedChunks.length > 0
  ? Math.max(...rerankedChunks.map(c => c.relevanceScore))
  : 0;

// Trigger conditions — any one is sufficient to abstain:
//   1. No chunks came back at all after the full pipeline.
//   2. No high-trust source AND best relevance score is below threshold.
//   3. Primary domain was clearly detected but zero chunks match it.
const noChunks = rerankedChunks.length === 0;

const evidenceTooWeak =
  !hasHighTrustSource &&
  topChunkScore < ABSTAIN_SCORE_THRESHOLD;

const primaryDomainEntry = Object.entries(query.domainConfidence)
  .sort(([, a], [, b]) => b - a)[0];
const primaryDomainName  = primaryDomainEntry?.[0] ?? null;
const primaryDomainConf  = primaryDomainEntry?.[1] ?? 0;
const primaryDomainCovered = primaryDomainName
  ? rerankedChunks.some(c => c.domain === primaryDomainName)
  : true;
const domainMismatch =
  primaryDomainConf > 0.75 &&
  !primaryDomainCovered &&
  rerankedChunks.length < 2;

// Live/personal/external data detector — catches questions the abstention
// score thresholds miss because adjacent domain chunks score adequately.
// These question patterns have no reliable data source in the system.
const lowerQuery = lastMsg.toLowerCase();
const isLiveDataQuery =
  // Real-time queries — no live feeds exist
  lowerQuery.match(/right now|today|tonight|this morning|currently|at the moment|live score|last night.{0,20}game|last game|current score/) !== null ||
  // Personal academic record queries — no student record access
  lowerQuery.match(/my gpa|my grade|my transcript|my record|my financial aid|my account|my schedule|my classes|what (did|do) i (get|have|owe)|how (am|are) i doing/) !== null ||
  // External institution queries — data only covers UIC
  lowerQuery.match(/transfer to (uiuc|northwestern|depaul|loyola|niu|illinois state|chicago state|purdue|indiana|michigan)|gpa (to|for) (transfer|uiuc|northwestern)/) !== null ||
  // Syllabus/professor-specific policy queries — no syllabus data ingested
  lowerQuery.match(/syllabus|late (work|policy|submission|assignment)|makeup (exam|test|quiz)|office hours (today|this week)|does (prof|professor|instructor).{0,30}(allow|accept|give|offer)/) !== null;

const trust = makeTrustDecision(
  {
    rawQuery:         lastMsg,
    isFact:           query.isFact,
    answerMode:       query.answerMode,
    domainConfidence: query.domainConfidence,
  },
  rerankedChunks.map(c => ({
    domain:           c.domain,
    content:          c.content,
    relevanceScore:   c.relevanceScore,
    sourceConfidence: c.sourceConfidence,
    publishedAt:      null, // extend later when chunks carry dates
  }))
);
// ── QueryLog ──────────────────────────────────────────────────────────────
const domainsTriggered = Object.entries(query.domainConfidence)
  .filter(([, score]) => score > 0.5)
  .map(([domain]) => domain);

const retrievalSources: string[] = [
  ...(syncChunks.length > 0                                                   ? ["json"]   : []),
  ...(asyncChunks.length > 0                                                   ? ["sql"]    : []),
  ...((vectorResults as any[]).some((r: any) => r.similarity > 0.65)         ? ["vector"] : []),
];

// Structured per-request log — one JSON line, stable fields for log aggregators.
const top3Chunks = rerankedChunks.slice(0, 3).map(c => ({
  domain: c.domain,
  relevance: Math.round(c.relevanceScore * 100) / 100,
  confidence: Math.round(c.sourceConfidence * 100) / 100,
}));
console.log(JSON.stringify({
  sparky: true,
  sessionId: sessionId.slice(-8),       // last 8 chars — enough to correlate, not PII
  query: lastMsg.slice(0, 80),
  answerMode: query.answerMode,
  trustDecision: trust.decision,
  trustConfidence: trust.confidence,
  trustClass: trust.explanation.query_class,
  primaryDomain: trust.explanation.primary_domain,
  topScore: trust.explanation.top_score,
  chunkCount: rerankedChunks.length,
  top3Chunks,
  retrievalSources,
  ms: Date.now() - requestStartMs,
}));

prisma.queryLog.create({
  data: {
    id:               `ql_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    sessionId,
    query:            lastMsg,
    answerMode:       query.answerMode,
    domainsTriggered: JSON.stringify(domainsTriggered),
    retrievalSources: JSON.stringify(retrievalSources),
    topChunkScore:    trust.explanation.top_score > 0 ? trust.explanation.top_score : null,
    chunkCount:       rerankedChunks.length,
    abstained:        trust.decision === "abstain",
    abstainReason:    trust.decision !== "answer" ? trust.reason : null,
    responseMs:       Date.now() - requestStartMs,
  },
}).catch(() => {});

// ── Abstain gate ──────────────────────────────────────────────────────────
if (trust.decision === "abstain") {
  const abstainText = getAbstainResponse(query);
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(abstainText));
      controller.close();
    },
  });
  const headers: Record<string, string> = {
    "Content-Type":     "text/plain; charset=utf-8",
    "Cache-Control":    "no-store",
    "X-Abstained":      "true",
    "X-Abstain-Reason": trust.reason,
  };
  if (isNew) {
    headers["Set-Cookie"] = `sparky_session=${sessionId}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  }
  return new Response(readable, { headers });
}

const brief = buildAnswerBrief(query, rerankedChunks);
const context = assembleContext(rerankedChunks, brief, query.isFact, query.domainConfidence);
const memoryContext = userMemory ? formatMemoryForPrompt(userMemory) : "";
const answerPack = buildAnswerPack(query, rerankedChunks, intent, sessionState);

  if (userMemory !== null && messages.length > 2) {
    updateMemory(sessionId, messages, userMemory).catch(() => {});
  }

  // Update session entity state
const stateUpdates = extractEntitiesFromQuery(lastMsg, intent, sessionState);
if (Object.keys(stateUpdates).length > 0) {
  updateSessionState(sessionId, stateUpdates).catch(() => {});
}


  // ── Build prompt + call model ─────────────────────────────────────────────
const trustInstruction = getTrustInstruction(trust);
const systemPrompt = buildSystemPrompt(brief, memoryContext, context, query.isFact, answerPack, trustInstruction);
const maxTokens = query.answerMode === "planning" ? 2800 
  : query.answerMode === "hybrid" ? 1800 
  : query.isFact ? 300 
  : query.answerMode === "ranking" ? 800
  : query.answerMode === "logistics" ? 400
  : query.answerMode === "recommendation" ? 900
  : query.answerMode === "comparison" ? 900
  : 600; // discovery default
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