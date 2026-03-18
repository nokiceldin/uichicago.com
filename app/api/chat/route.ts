
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
async function retrieveMajorPlan(query: QueryAnalysis): Promise<RetrievedChunk[]> {
  try {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const data = JSON.parse(readFileSync(join(process.cwd(), "public/data/uic-knowledge/major-requirements.json"), "utf8"));
    const lower = query.rawQuery.toLowerCase();
 
    const majorMatch = data.majors?.filter((m: any) => {
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
        (n.includes("management") && lower.includes("management")) ||
        (n.includes("economics") && lower.includes("econ")) ||
        (n.includes("chemistry") && lower.includes("chem") && !lower.includes("biochem")) ||
        (n.includes("mechanical engineering") && lower.includes("mechanical")) ||
        (n.includes("electrical engineering") && lower.includes("electrical")) ||
        (n.includes("civil engineering") && lower.includes("civil")) ||
        (n.includes("biomedical engineering") && lower.includes("bioengin")) ||
        (n.includes("public health") && lower.includes("public health"));
    }).sort((a: any, b: any) => {
      const scoreA = (a.name.includes(" BS") || a.name.includes(" BA") ? 10 : 0) + (a.requiredCourses?.length ?? 0);
      const scoreB = (b.name.includes(" BS") || b.name.includes(" BA") ? 10 : 0) + (b.requiredCourses?.length ?? 0);
      return scoreB - scoreA;
    })[0] ?? null;
 
    if (!majorMatch) {
      const list = data.majors?.slice(0, 40).map((m: any) => `- ${m.name}`).join("\n") || "";
      return [makeChunk("major_plan", `=== AVAILABLE MAJORS FOR 4-YEAR PLANS ===\n${list}\n\nSpecify your major for a detailed plan.`, 0.7, query)];
    }
 
    // ── REQUIRED COURSES — with credit hours from source data ──────────────
    const required = majorMatch.requiredCourses.slice(0, 60).map((c: any) =>
      `${c.code}: ${c.title} — ${c.hours ?? "?"} credit hours`
    ).join("\n");
 
    // ── ELECTIVE RULES — pulled directly from majorMatch if available ───────
    const electiveRules = majorMatch.electiveRequirements
      ? Object.entries(majorMatch.electiveRequirements as Record<string, any>).map(([group, rule]: [string, any]) =>
          `${group}: ${typeof rule === "object" ? `choose ${rule.choose ?? "?"} courses from ${rule.options?.join(", ") ?? "see catalog"}` : rule}`
        ).join("\n")
      : majorMatch.electiveGroups
        ? majorMatch.electiveGroups.map((g: any) =>
            `${g.label ?? g.name ?? "Elective group"}: choose ${g.credits ?? g.count ?? "?"} credit hours`
          ).join("\n")
        : null;
 
    // ── SAMPLE SCHEDULE — include credit hours per semester ─────────────────
    // Enrich each course code in the schedule with hours from requiredCourses lookup
    const courseHourMap: Record<string, number> = {};
    for (const c of majorMatch.requiredCourses ?? []) {
      if (c.code && c.hours) courseHourMap[c.code] = c.hours;
    }
 
    const schedule = majorMatch.sampleSchedule?.length > 0
      ? majorMatch.sampleSchedule.map((s: any) => {
          const coursesWithHours = (s.courses ?? []).map((code: string) => {
            const hrs = courseHourMap[code];
            return hrs ? `${code} (${hrs} hrs)` : code;
          });
          return `${s.year} ${s.semester} [${s.total_hours ?? "?"} hrs total]: ${coursesWithHours.join(", ")}`;
        }).join("\n")
      : "No official sample schedule available. Use REQUIRED COURSES list above to build semester by semester.";
 
    // ── UNDERGRAD-ONLY ELECTIVES — filter out 500+ level ──────────────────
    // 500+ courses are graduate level. An undergrad plan must not default to them.
    let electiveSuggestions = "";
    try {
      const subj = majorMatch.requiredCourses[0]?.code?.split(" ")[0];
      if (subj) {
        const allDeptCourses = await fetchCoursesBySubjectOrDept(subj, null, 20, true);
        // Filter: only include courses numbered 100–499 (undergrad level)
        const undergradOnly = allDeptCourses.filter((c: any) => {
          const num = parseInt(String(c.number), 10);
          return !isNaN(num) && num < 500;
        }).slice(0, 8);
 
        if (undergradOnly.length > 0) {
          electiveSuggestions = undergradOnly
            .map((c: any) => `${c.subject} ${c.number} — ${c.title}: ${c.avgGpa?.toFixed(2) ?? "N/A"} avg GPA, ${c.totalRegsAllTime ?? "?"} students`)
            .join("\n");
        }
      }
    } catch { /* tolerate */ }
 
    // ── ASSEMBLE CONTENT ────────────────────────────────────────────────────
    let content = `=== ${majorMatch.name.toUpperCase()} — OFFICIAL DEGREE REQUIREMENTS ===\n`;
    content += `Total credits required: ${majorMatch.totalHours ?? "see catalog"} | College: ${majorMatch.college ?? "N/A"}\n\n`;
 
    content += `MANDATORY REQUIRED COURSES (must complete all):\n${required}\n\n`;
 
    if (electiveRules) {
      content += `ELECTIVE REQUIREMENTS:\n${electiveRules}\n\n`;
    }
 
    content += `OFFICIAL SAMPLE SCHEDULE (semester by semester):\n${schedule}\n`;
 
    if (electiveSuggestions) {
      content += `\nUNDERGRAD ELECTIVE OPTIONS (courses 100-499 only, sorted by avg GPA):\n${electiveSuggestions}\n`;
    }
 
    // ── PLANNING INSTRUCTION — strict grounding, no invention ───────────────
    content += `
PLANNING RULES — FOLLOW STRICTLY:
1. Use ONLY courses listed in MANDATORY REQUIRED COURSES and OFFICIAL SAMPLE SCHEDULE above
2. Use credit hours EXACTLY as listed in the source data — do NOT guess or change them
3. If a course has no credit hours listed, write "? hrs" — do not invent a number
4. Do NOT add courses not in the retrieved data — not even high-GPA ones
5. Do NOT include any course numbered 500 or above unless it appears in MANDATORY REQUIRED COURSES
6. Use OFFICIAL SAMPLE SCHEDULE as the primary semester layout — only deviate if truly necessary
7. Fill elective slots with courses from UNDERGRAD ELECTIVE OPTIONS (100-499 level only)
8. If elective requirements specify group rules, follow them — do not freely choose any course
9. After building the plan, state total credit count and flag if it doesn't match required total
10. End with: "This is a draft plan based on official requirements. Verify with your academic advisor before registering."`;
 
    return [makeChunk("major_plan", content, 0.97, query)];
  } catch {
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
    `Visits: ${adm.campus_visits.url} | Admitted hub: ${adm.campus_visits.admitted_students}`;
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
  const daley = lib.libraries?.daley_library;
  const lhs = lib.libraries?.lhs_chicago;
  const borrowing = lib.borrowing_policies;
  const research = lib.research_help;

  const content = `=== LIBRARY ===\n` +
    `Daley: ${daley?.address} | ${daley?.phone} | Hours: ${daley?.hours?.regular_semester ?? "see library.uic.edu"}\n` +
    `Quiet floors: ${daley?.quiet_areas?.join(", ") ?? "3rd+4th floors, Circle Reading Room"}\n` +
    `LHS Chicago: ${lhs?.address} | ${lhs?.phone} | Hours: ${lhs?.hours?.regular_semester ?? "see library.uic.edu"}\n` +
    `Study rooms: libcal.uic.edu\n\n` +
    `BORROWING:\n` +
    `${Object.entries(borrowing?.loan_periods ?? {}).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" | ")}\n` +
    `Fines: ${borrowing?.fines ?? "No fines until 39 days past due"}. Lost item: ${borrowing?.lost_item_fee ?? "$125+"}\n` +
    `PRINTING: ${lib.printing?.system ?? "Wepa stations campus-wide"}\n` +
    `ILL: ${lib.interlibrary_loan?.i_share ?? "I-Share 3-5 days"} | ${lib.interlibrary_loan?.illiad ?? "ILLiad 7-10 days"}\n` +
    `Research help: ${research?.ask_a_librarian ?? "ask.library.uic.edu"} | Guides: ${research?.research_guides ?? "researchguides.uic.edu"}`;
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
  answerPack?: AnswerPack
): string {
  const modeInstructions: Record<AnswerMode, string> = {
    ranking: "RANKING: Lead with the top options. Use real GPA numbers, scores, prices to justify rankings. Name a clear winner. Don't hedge — students want a decisive answer.",
    discovery: "DISCOVERY: If this is a simple or casual question, answer briefly and directly. Only give a rich overview if the student is genuinely exploring a broad topic.",
    comparison: "COMPARISON: Structure as clear A vs B with parallel criteria. Acknowledge the real tradeoffs. End with a concrete recommendation tailored to the implied student profile.",
    recommendation: "RECOMMENDATION: You detected specific constraints about this student. Use them. Give a direct, personalized answer — not 'it depends,' but 'given that you care about X and Y, here is what I recommend and why.'",
    logistics: "LOGISTICS: Be precise. Lead with exact addresses, phone numbers, deadlines, URLs, hours. Zero editorializing. Students need to act — give them exactly what they need.",
planning: "PLANNING: Build the semester plan using ONLY the courses and credit hours in the MANDATORY REQUIRED COURSES and OFFICIAL SAMPLE SCHEDULE sections of the retrieved data. Do NOT invent courses. Do NOT change credit hours. Do NOT add graduate-level (500+) courses unless they appear in the mandatory list. For elective slots, use only courses from UNDERGRAD ELECTIVE OPTIONS (numbered below 500). Follow the PLANNING RULES listed in the retrieved data. Format: YEAR 1, YEAR 2, YEAR 3, YEAR 4 with Fall and Spring subsections. Use bullet lists. End with total credit count and an advisor verification note.",
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
  - Match response length to the question. Simple questions = 1-3 sentences. Only use lists and long responses for planning, comparisons, or multi-part questions.
- If the answer is short, write it short. Never pad.
- Read between the lines: if a student seems stressed, overwhelmed, or is implicitly asking for an easier path, address that directly.
- Connect dots: a course question often implies a professor question — answer the real question.
- If memory shows the student's major/year, tailor every answer to their situation without being asked.
- Quote addresses, phone numbers, suite numbers, and deadlines exactly as they appear in the data
- Never paraphrase a location or contact detail — copy it word for word
- Answer in 1-3 sentences for simple fact questions
- If the specific fact is not in the retrieved data, say so and direct to the relevant UIC website`
    : `CORE PRINCIPLES:
- Synthesize — reason about the data, don't just repeat it
- Be specific: cite GPA numbers, dollar amounts, dates, building names, phone numbers
- Use **bold** for course codes, names, critical numbers
- Acknowledge real tradeoffs honestly when they exist
- Never hallucinate facts — if uncertain, say so and point to the right UIC page
- Zero filler phrases — students want answers, not preamble
- Think like the smartest UIC insider who knows every shortcut and real answer`;


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

UIC: Chicago's only public Research I university. ~33,000 students. ~91% commuters. Majority-minority. Mascot: Sparky the Dragon. Navy and Flames Red. Missouri Valley Conference (MVC). Go Flames!
${memoryContext ? "\n" + memoryContext + "\n" : ""}
${answerPack ? `
--- ANSWER PACK ---
INTENT: ${answerPack.resolvedIntent}
MODE: ${answerPack.answerMode.toUpperCase()}
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
  activeDomain: null, lastAnswerType: null, lastTopics: [],
}));

const [aiIntentResult, regexIntentResult, regexCiResult] = await Promise.allSettled([
  classifyIntent(lastMsg, messages.slice(0, -1), userMemory),
  Promise.resolve(detectIntent(lastMsg)),
  Promise.resolve(detectCampusIntent(lastMsg)),
]);

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

// Use session state to resolve ambiguous follow-ups
if (!intent.courseCode && !intent.subjectCode && sessionState.activeCourseCode) {
  const parts = sessionState.activeCourseCode.split(" ");
  if (parts.length >= 2) {
    intent.courseCode = { subject: parts[0], number: parts[1] };
  }
}
if (!intent.profNameHint && sessionState.activeProfessorName) {
  const lower2 = lastMsg.toLowerCase();
  if (lower2.match(/\b(him|her|that prof|that professor|same prof|they|their)\b/) ||
      lower2.match(/^(what about|tell me more|more about|and him|and her)[\s?!.]*$/i)) {
    intent.profNameHint = sessionState.activeProfessorName;
  }
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

if (relevantVectors.length > 0 && !query.isFact) {
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
console.log(`[trust] q=${lastMsg.slice(0,40)} | class=${trust.explanation.query_class} | domain=${trust.explanation.primary_domain} | score=${trust.explanation.top_score} | chunks=${trust.explanation.relevant_chunk_count} | decision=${trust.decision}`);

// ── QueryLog ──────────────────────────────────────────────────────────────
const domainsTriggered = Object.entries(query.domainConfidence)
  .filter(([, score]) => score > 0.5)
  .map(([domain]) => domain);

const retrievalSources: string[] = [
  ...(syncChunks.length > 0                                                   ? ["json"]   : []),
  ...(asyncChunks.length > 0                                                   ? ["sql"]    : []),
  ...((vectorResults as any[]).some((r: any) => r.similarity > 0.65)         ? ["vector"] : []),
];

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
const context = assembleContext(rerankedChunks, brief);
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
const systemPrompt = buildSystemPrompt(brief, memoryContext, context, query.isFact, answerPack);
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