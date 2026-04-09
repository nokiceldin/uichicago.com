export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { capturePostHogEvent } from "@/app/lib/posthog-server";
import { detectIntent, detectCampusIntent } from "@/lib/chat/intent";
import { classifyIntent } from "@/lib/chat/classify";
import { vectorSearch, rerankChunks } from "@/lib/chat/vectors";
import { getSessionState, updateSessionState, extractEntitiesFromQuery } from "@/lib/chat/session-state";
import { getCurrentStudyUser } from "@/lib/auth/session";
import { parseStoredPreferences } from "@/lib/study/profile";
import { getCurrentSession } from "@/lib/auth/session";
import { getMemory, learnMemoryFromMessages, persistMemory, formatMemoryForPrompt } from "@/lib/chat/memory";
import { buildUploadedFileSupport, type UploadedFile } from "@/lib/chat/attachments";
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

// ── Vector store empty check ──────────────────────────────────────────────────
// Checked once per process lifetime and cached. If fewer than 100 chunks exist,
// vector search is skipped entirely — it adds latency with no useful signal.
let _vectorStoreEmpty: boolean | null = null;
async function checkVectorStoreEmpty(): Promise<boolean> {
  if (_vectorStoreEmpty !== null) return _vectorStoreEmpty;
  try {
    const count = await prisma.knowledgeChunk.count();
    _vectorStoreEmpty = count < 100;
  } catch {
    _vectorStoreEmpty = false; // on error, allow vector search to proceed
  }
  return _vectorStoreEmpty;
}

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
  | "international" | "safety";

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

// ── Planning pipeline types ───────────────────────────────────────────────────
interface StudentContext {
  major: string | null;
  completed_courses: string[];
  in_progress_courses: string[];
  constraints: string[];
}

interface SemesterPlan {
  term: string;
  courses: string[];
  reasoning: string;
}

interface PlanningRequirements {
  required_courses: string[];
  elective_buckets: string[];
  credit_rules: string[];
}

interface PlanningObject {
  intent: string;
  student_context: StudentContext;
  requirements: PlanningRequirements;
  plan_strategy: string;
  semester_plan: SemesterPlan[];
}

type EntityVerification = {
  required: boolean;
  matched: boolean;
  expected: string[];
  matchedBy: string[];
};

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 1: QUERY ANALYSIS — extract structured intent from natural language
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Query normalization ──────────────────────────────────────────────────────
// Cleans up the message BEFORE the regex pipeline so typos, abbreviations, and
// informal shorthand don't confuse domain/intent detection.
// Claude itself handles imperfect text natively — normalization only helps regex.
function normalizeQuery(raw: string): string {
  let s = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  // Treat punctuation spam and stretched separators like normal word breaks.
  s = s.replace(/[_.,!?;:()[\]{}+/\\|]+/g, " ");
  s = s.replace(/['"`~]+/g, "");

  const protectedTokens: Array<[RegExp, string]> = [
    [/\bu-pass\b/g, "__u_pass__"],
    [/\bmrh\b/g, "__mrh__"],
    [/\btbh\b/g, "__tbh__"],
    [/\bjst\b/g, "__jst__"],
    [/\barc\b/g, "__arc__"],
    [/\bcmn\b/g, "__cmn__"],
    [/\bcmw\b/g, "__cmw__"],
    [/\bcms\b/g, "__cms__"],
    [/\bssr\b/g, "__ssr__"],
    [/\bpsr\b/g, "__psr__"],
  ];
  for (const [pattern, replacement] of protectedTokens) {
    s = s.replace(pattern, replacement);
  }

  // Collapse 3+ repeated characters to 1 (helooo→helo, heyyyy→hey, whaaat→what)
  s = s.replace(/(.)\1{2,}/g, "$1");
  // Also collapse dotted/spaced repetition like "he..yy.." or "sooo???" after punctuation cleanup.
  s = s.replace(/\s+/g, " ");

  // Common informal shorthand → full words
  const abbrevs: [RegExp, string][] = [
    [/\bwats\b/g, "what is"],
    [/\bwhats\b/g, "what is"],
    [/\bwot\b/g, "what"],
    [/\bhw\b/g, "how"],
    [/\bu\b/g, "you"],
    [/\bur\b/g, "your"],
    [/\br\b/g, "are"],
    [/\bw\/\b/g, "with"],
    [/\bgud\b/g, "good"],
    [/\bgd\b/g, "good"],
    [/\bpls\b|\bplz\b/g, "please"],
    [/\bidk\b/g, "i don't know"],
    [/\bimo\b|\bimho\b/g, "in my opinion"],
    [/\btbh\b/g, "to be honest"],
    [/\bngl\b/g, "not gonna lie"],
    [/\bwanna\b/g, "want to"],
    [/\bgonna\b/g, "going to"],
    [/\bgotta\b/g, "got to"],
    [/\bprof\b/g, "professor"],
    [/\bprofs\b/g, "professors"],
    [/\bcalc\b/g, "calculus"],
    [/\bstat\b(?!s?\d)/g, "statistics"],
    [/\bpoli sci\b/g, "political science"],
    [/\bpsy\b/g, "psychology"],
    [/\bsoc\b/g, "sociology"],
    [/\bphilo\b/g, "philosophy"],
    [/\bkinda\b/g, "kind of"],
    [/\bsorta\b/g, "sort of"],
    [/\bcuz\b|\bcause\b/g, "because"],
    [/\bthru\b/g, "through"],
    [/\btho\b/g, "though"],
    [/\bbtw\b/g, "by the way"],
    [/\bfr\b/g, "for real"],
    [/\bngl\b/g, "not going to lie"],
    [/\bwyd\b/g, "what are you doing"],
    [/\bwbu\b/g, "what about you"],
    [/\bomg\b/g, "oh my god"],
    [/\bnvm\b/g, "never mind"],
    [/\bfyi\b/g, "for your information"],
    [/\basap\b/g, "as soon as possible"],
    [/\bits\b(?= a )/g, "it is a"],
  ];
  for (const [pattern, replacement] of abbrevs) {
    s = s.replace(pattern, replacement);
  }

  // Common misspellings of UIC-relevant terms
  const fixes: [RegExp, string][] = [
    [/\btution\b|\btuiton\b|\btutiion\b/g, "tuition"],
    [/\blibary\b|\blibarry\b|\blibery\b/g, "library"],
    [/\bdoritory\b|\bdormatry\b|\bdormitry\b/g, "dormitory"],
    [/\bcafateria\b|\bcafertia\b/g, "cafeteria"],
    [/\bscheduale\b|\bschedual\b/g, "schedule"],
    [/\bregistation\b|\bregistraton\b/g, "registration"],
    [/\bprerequisit\b|\bprerequisites?\b/g, "prerequisite"],
    [/\bfinanical\b|\bfinancail\b/g, "financial"],
    [/\bscholarshop\b|\bscholership\b/g, "scholarship"],
    [/\bgradution\b|\bgraudation\b/g, "graduation"],
    [/\bprofesser\b|\bproffesor\b|\bproffessor\b/g, "professor"],
    [/\bcalculas\b|\bcalculas\b/g, "calculus"],
    [/\breccomend\b|\brecomend\b/g, "recommend"],
    [/\bdificult\b|\bdifficult\b|\bdificullt\b/g, "difficult"],
    [/\beaisest\b|\beaiest\b/g, "easiest"],
    [/\bhardist\b|\bhardest\b/g, "hardest"],
    [/\binternship\b|\binternshup\b/g, "internship"],
    [/\bcounseling\b|\bcounseling\b|\bcouseling\b/g, "counseling"],
    [/\bdisabilty\b|\bdisablity\b/g, "disability"],
    [/\bpharmcy\b|\bpharmacy\b/g, "pharmacy"],
    [/\btransfer\b|\btransfer\b/g, "transfer"],
    [/\brequirment\b|\brequiement\b/g, "requirement"],
    [/\bappication\b|\bapplication\b/g, "application"],
    [/\bdegre\b(?!e)/g, "degree"],
    [/\bcoures\b|\bcource\b/g, "course"],
    [/\bclases\b/g, "classes"],
    [/\bexam\b|\bexam\b/g, "exam"],
    [/\bsyllabus\b|\bsyllbus\b|\bsylabus\b/g, "syllabus"],
    [/\bfrist\b|\bfirts\b/g, "first"],
    [/\bsemster\b|\bsemeser\b|\bsemetser\b/g, "semester"],
    [/\bdefinately\b|\bdefinetely\b/g, "definitely"],
    [/\brecieve\b/g, "receive"],
    [/\bavailble\b|\bavaiable\b/g, "available"],
    [/\bwich\b/g, "which"],
    [/\bwut\b|\bwat\b/g, "what"],
  ];
  for (const [pattern, replacement] of fixes) {
    s = s.replace(pattern, replacement);
  }

  const restoreTokens: Array<[RegExp, string]> = [
    [/__u_pass__/g, "u-pass"],
    [/__mrh__/g, "mrh"],
    [/__tbh__/g, "tbh"],
    [/__jst__/g, "jst"],
    [/__arc__/g, "arc"],
    [/__cmn__/g, "cmn"],
    [/__cmw__/g, "cmw"],
    [/__cms__/g, "cms"],
    [/__ssr__/g, "ssr"],
    [/__psr__/g, "psr"],
  ];
  for (const [pattern, replacement] of restoreTokens) {
    s = s.replace(pattern, replacement);
  }

  return s;
}

type PersistChatLogInput = {
  responseText: string;
  responseKind: string;
  responseStatus?: "success" | "abstained" | "error";
  answerMode?: string | null;
  domainsTriggered?: string[];
  retrievalSources?: string[];
  topChunkScore?: number | null;
  chunkCount?: number | null;
  abstained?: boolean;
  abstainReason?: string | null;
  responseMs?: number;
  extraMetadata?: Record<string, unknown>;
};

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
  if (isPlanningQuery(lower) || isMajorRequirementsLookupQuery(lower)) domainConfidence["major_plan"] = 0.9;

  // Financial signals
  if (words.some(w => ["tuition","cost","fee","price","pay","afford","how much","billing"].includes(w))) domainConfidence["tuition"] = 0.85;
  if (words.some(w => ["aid","fafsa","scholarship","grant","aspire","financial","loan","debt"].includes(w))) domainConfidence["financial_aid"] = 0.9;
  if (
    /\b(full.?time (financial aid|fafsa|aid)|full fafsa|full financial aid|enrollment status|credit load)\b/.test(lower) ||
    /\b(credit hours?|credits?).{0,20}(fafsa|financial aid|aid)\b/.test(lower) ||
    /\bhow (many|much).{0,20}(credits?|credit hours?).{0,20}(fafsa|financial aid|aid)\b/.test(lower)
  ) {
    domainConfidence["financial_aid"] = Math.max(domainConfidence["financial_aid"] ?? 0, 0.92);
    domainConfidence["academic_policy"] = Math.max(domainConfidence["academic_policy"] ?? 0, 0.82);
  }

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
  if (lower.match(/\b(appeal|grade replacement|incomplete|overload|credit limit|too many credits|max credits|maximum credits)\b/)) {
    domainConfidence["academic_policy"] = Math.max(domainConfidence["academic_policy"] ?? 0, 0.82);
  }
  if (lower.match(/\b(full.?time|part.?time|enrollment status|credit load)\b/) && lower.match(/\b(fafsa|financial aid|aid)\b/)) {
    domainConfidence["academic_policy"] = Math.max(domainConfidence["academic_policy"] ?? 0, 0.85);
    domainConfidence["financial_aid"] = Math.max(domainConfidence["financial_aid"] ?? 0, 0.92);
  }

  // Other services
  if (
    words.some(w => ["admit","admission","admissions","apply","application","acceptance","transfer","incoming","aspire","counselor","counsellor","recruiter"].includes(w)) ||
    /\b(admissions? (office|help|contact|counselor|counsellor|recruiter)|application help|help with admissions?|talk to admissions?|contact admissions?|reach admissions?)\b/.test(lower)
  ) {
    domainConfidence["admissions"] = 0.85;
  }
  if (words.some(w => ["job","career","internship","resume","interview","handshake","hire","recruit"].includes(w))) domainConfidence["careers"] = 0.85;
  if (words.some(w => ["library","daley","borrow","study room","book","lhs","print","reserve"].includes(w))) domainConfidence["library"] = 0.85;
  if (words.some(w => ["international","visa","ois","cpt","opt","f-1","study abroad","abroad"].includes(w))) domainConfidence["international"] = 0.9;
  if (words.some(w => ["safe","safety","police","escort","emergency","title ix","conduct","ferpa","legal"].includes(w))) domainConfidence["safety"] = 0.85;
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
  if (lower.match(/\b(food|eat|restaurant|dining hall|meal plan|meal|snack)\b/i)) {
    domainConfidence["dining"] = Math.max(domainConfidence["dining"] ?? 0, 0.82);
  }
  if (lower.match(/\b(arc|jst|cmn|cmw|cms|cty|mrh|tbh|ssr|psr)\b/i)) {
    domainConfidence["housing"] = Math.max(domainConfidence["housing"] ?? 0, 0.82);
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

function isProductQuestion(lower: string) {
  return (
    /\b(who (made|built|created|runs|owns) (this )?(website|site|app|platform)|who made atlas|who built atlas|who made sparky|who built sparky|who made uic chicago|who built uic chicago)\b/i.test(lower) ||
    /\b(who (made|built|created) (you|sparky)|who is behind this)\b/i.test(lower) ||
    /\b(what is this website|what is atlas|what is sparky|what is uic chicago|is this official|officially affiliated|officialiy affliated|official uic|affiliated with uic|affliated with uic)\b/i.test(lower) ||
    /\b(what are you running on|what do you run on|which api|what api|what model|which model|chatgpt wrapper|gpt wrapper|how do you actually work|how do you work|system prompt|full system prompt|powered by|under the hood|what'?s your backend|what is your backend|what are you built with|what ai are you|are you (an )?ai|are you (chatgpt|claude|gemini|gpt)|llm|large language model)\b/i.test(lower)
  );
}

function getProductAnswer(lower: string) {
  if (/\b(is this official|official website|official uic|officially affiliated|officialiy affliated|affiliated with uic|affliated with uic)\b/i.test(lower)) {
    return "UIChicago is unofficial. It was built by a software engineering team from UIC for students, and it is open and free for all students to use.";
  }

  if (/\b(system prompt|full system prompt)\b/i.test(lower)) {
    return "I can't share my private system prompt, but I can explain what I do: I'm Sparky, the AI assistant inside UIChicago, built to help with UIC courses, professors, planning, and campus questions.";
  }

  if (/\b(are you (chatgpt|claude|gemini|gpt)|chatgpt wrapper|gpt wrapper|what ai are you|are you (an )?ai)\b/i.test(lower)) {
    return "I'm Sparky, the AI assistant inside UIChicago. I'm not a generic ChatGPT-style chat page; I'm built around UIC-specific course, professor, planning, and campus data.";
  }

  if (/\b(what are you running on|what do you run on|which api|what api|what model|which model|how do you actually work|how do you work|powered by|under the hood|what'?s your backend|what is your backend|what are you built with|llm|large language model)\b/i.test(lower)) {
    return "I'm Sparky, the AI assistant inside UIChicago. I can't share private implementation details, but I'm built to answer UIC questions using the UIC course, professor, planning, and campus data available to me.";
  }

  if (/\bwhat is (this website|atlas|sparky|uic chicago)\b/i.test(lower)) {
    return "UIChicago is a student-built platform made by a software engineering team from UIC. It is open and free for all students, and Sparky is the AI part inside it. Sparky is currently in beta.";
  }

  return "UIChicago was made by a software engineering team from UIC. It is student-built, open, and free for all students to use — from students to students.";
}

function getSimpleArithmeticAnswer(input: string): string | null {
  const lower = input.toLowerCase().trim();
  if (/\b(cs|math|chem|bios|phys|stat|ece|hist|psch|course|class|credit|gpa)\b/i.test(lower)) return null;

  const normalized = lower
    .replace(/what('?s|s| is)/g, "")
    .replace(/\?/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*(\+|plus|-|minus|\*|x|times|\/|divided by)\s*(-?\d+(?:\.\d+)?)$/i);
  if (!match) return null;

  const left = Number(match[1]);
  const op = match[2].toLowerCase();
  const right = Number(match[3]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;

  let result: number;
  if (op === "+" || op === "plus") result = left + right;
  else if (op === "-" || op === "minus") result = left - right;
  else if (op === "*" || op === "x" || op === "times") result = left * right;
  else if (op === "/" || op === "divided by") {
    if (right === 0) return "You can't divide by zero.";
    result = left / right;
  } else {
    return null;
  }

  return Number.isInteger(result) ? String(result) : String(Number(result.toFixed(6)));
}

function isHarmlessCodingQuestion(input: string): boolean {
  const lower = input.toLowerCase();
  if (
    /\b(uic|professor|prof|course|class|section|assignment|syllabus|blackboard|myuic|canvas)\b/.test(lower) ||
    /\b[a-z]{2,4}\s?\d{3}[a-z]?\b/i.test(input)
  ) {
    return false;
  }

  return /\b(python|javascript|typescript|java|c\+\+|c#|sql|html|css|react|node|programming|code|coding|algorithm|data structure|linked list|binary tree|stack|queue|hashmap|leetcode|bug|debug|function|loop|array|string)\b/i.test(lower);
}

function isFlamesSongRequest(input: string) {
  const lower = input.toLowerCase();
  return (
    (
      /\b(play|start|put on)\b/.test(lower) &&
      (
        /\bthe song\b/.test(lower) ||
        /\bsong\b/.test(lower) ||
        /\bmusic\b/.test(lower) ||
        /\bit\b/.test(lower) ||
        /\bflames song\b/.test(lower) ||
        /\bfight song\b/.test(lower) ||
        /\bfire up flames\b/.test(lower)
      )
    ) ||
    /\bplaythe song\b/.test(lower)
  );
}

function buildPlanningRecoveryMessage(
  studentCtx: StudentContext | null | undefined,
  mode: "build_failed" | "major_not_found"
): string {
  const major = studentCtx?.major?.trim() ?? "";
  const completedCount = studentCtx?.completed_courses?.length ?? 0;
  const inProgressCount = studentCtx?.in_progress_courses?.length ?? 0;
  const constraints = studentCtx?.constraints ?? [];
  const hasContext = completedCount > 0 || inProgressCount > 0 || constraints.length > 0;

  if (!major) {
    const contextLine = hasContext
      ? `I did pick up some context${completedCount ? ` (${completedCount} completed course${completedCount === 1 ? "" : "s"}` : ""}${inProgressCount ? `${completedCount ? ", " : " ("}${inProgressCount} in progress` : ""}${(completedCount || inProgressCount) ? ")" : ""}, ${constraints.join(", ") || "other constraints"}). `
      : "";
    return (
      "I can help build this plan, but I'm missing the major. " +
      contextLine +
      "Tell me the exact UIC major you want the plan for, and I'll build the schedule around that."
    );
  }

  if (mode === "major_not_found") {
    return (
      `I don't have a pre-built degree plan for ${major} in my current data. ` +
      "The best next step is to check catalog.uic.edu for the official degree requirements and sample schedule, then your college advising office for the exact sequencing. " +
      "I can still help from there — for example, I can compare required courses, suggest easier gen eds, or help you map out the next semester if you paste the requirements."
    );
  }

  const contextSummary = hasContext
    ? ` I did catch some context for you: ${completedCount} completed, ${inProgressCount} in progress, constraints: ${constraints.join(", ") || "none"}.`
    : "";
  return (
    `I found planning data for ${major}, but I couldn't turn it into a clean semester-by-semester plan on this pass.` +
    contextSummary +
    " A good next step is to tell me your current year plus any completed courses you want me to account for, and I can retry with a tighter plan."
  );
}

// ── Abstention helper ─────────────────────────────────────────────────────
// Returns a specific redirect for each domain rather than a generic refusal.
// Never calls the model — this is hardcoded authoritative text.
function inferAbstainDomain(
  query: QueryAnalysis,
  reason?: string
): string {
  const lower = query.rawQuery.toLowerCase();

  if (reason === "personal_record_query") return "personal_data";
  if (reason === "live_status_query_no_realtime_feed") {
    if (/\b(score|basketball|baseball|soccer|volleyball|game|match)\b/.test(lower)) return "athletics_live";
    if (/\b(bus|train|cta|route|running on time|arrival|delay)\b/.test(lower)) return "transportation_live";
    if (/\b(dining|vegan|menu|meal|food|today)\b/.test(lower)) return "dining_live";
    return "live_status";
  }
  if (reason === "out_of_scope_query") {
    if (/\bsyllabus\b|\blate work\b|\bmakeup (exam|test|quiz)\b|\bdoes (prof|professor|instructor)\b/.test(lower)) {
      return "course_specific_policy";
    }
    if (/\btransfer to (uiuc|northwestern|depaul|loyola|niu|illinois state|chicago state|purdue|indiana|michigan)\b|\bgpa (to|for) (transfer to|get into)\b/.test(lower)) {
      return "external_transfer";
    }
  }
  if (/\bvegan\b|\bmenu\b|\bdining hall\b|\bfood\b/.test(lower) && /\btoday\b|\btonight\b|\bright now\b/.test(lower)) {
    return "dining_live";
  }

  return Object.entries(query.domainConfidence)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0] ?? "general";
}

function getAbstainResponse(query: QueryAnalysis, reason?: string): string {
  const domain = inferAbstainDomain(query, reason);

  const responses: Partial<Record<string, string>> = {
    registration:
      "I can't confirm that registration detail from my current data. For credit limits, overload approvals, or registration rules, the best next step is your college advising office or the Registrar: registrar.uic.edu.",
    personal_data:
      "I can't access your personal student records like GPA, grades, billing, or visa status. Check your myUIC portal or contact the relevant UIC office directly for your account-specific information.",
    course_specific_policy:
      "I can't see your specific syllabus or professor-only policies from here. The best next step is Blackboard, the posted syllabus, or a quick email to your instructor to confirm the exact late-work, attendance, or makeup rule.",
    external_transfer:
      "I can't reliably confirm another school's transfer requirement from UIC-side data. The best next step is the target school's transfer admissions page or admissions office for the current GPA and credit policy.",
    dining_live:
      "I don't have live dining menus or same-day availability from here. The best next step is dining.uic.edu for today's menus and open locations, especially for current vegan or dietary options.",
    transportation_live:
      "I don't have live CTA tracking from here. The best next step is the CTA Bus Tracker, the Ventra app, or transitchicago.com for current arrivals, delays, and reroutes.",
    athletics_live:
      "I don't have live or last-night game results in my data. The best next step is uicflames.com, the official UIC Flames social accounts, or ESPN for the latest score.",
    live_status:
      "I don't have a reliable live status feed for that. The best next step is the official live source for that office, service, or event so you can confirm the current status directly.",
    courses:
      "I can't confirm that course detail reliably from the current data I have. The best next step is the UIC Schedule of Classes at registrar.uic.edu for current sections and catalog.uic.edu for official course descriptions and requirements.",

    professors:
      "I don't have enough verified professor data to answer that confidently. The best next step is RateMyProfessors for student reviews, plus the department site or Blackboard for office hours and contact info.",

    gen_ed:
      "I couldn't confirm that Gen Ed detail clearly from the current data. The best next step is catalog.uic.edu under General Education requirements, where you can search by category and approved course list.",

    major_plan:
      "I don't have enough major-plan data to answer that cleanly. The best next step is catalog.uic.edu for the official degree requirements and your college advising office for exact sequencing.",

    housing:
      "I can't confirm that housing detail from the data I have. The best next step is UIC Housing directly: housing.uic.edu | 312-413-5255 | housing@uic.edu.",

    dining:
      "I can't confirm that dining detail reliably from my current data. The best next step is dining.uic.edu for current menus, hours, and meal plan details.",

    tuition:
      "I can't confirm that tuition or billing detail from here. The best next step is bursar.uic.edu for current figures or the Bursar's Office at 312-996-8574.",

    financial_aid:
      "I can't confirm that financial aid detail from my current data. The best next step is the Office of Student Financial Aid: SSB Suite 1800 | 312-996-3126 | financialaid.uic.edu.",

    health:
      "I can't confirm that health-services detail from here. The best next step is campuscare.uic.edu or 312-996-7420 for the clinic, and 312-996-3490 for counseling.",

    calendar:
      "I can't confirm that calendar or deadline detail from my current data. The best next step is the official academic calendar at registrar.uic.edu/calendars.",

    academic_policy:
      "I don't have a reliable answer for that policy question from the current data. The best next step is the Registrar at registrar.uic.edu or your college advising office.",

    admissions:
      "I can't confirm that admissions detail confidently from here. The best next step is Admissions: admissions.uic.edu | 312-996-4350.",

    careers:
      "I can't confirm that career-services detail from my current data. The best next step is Career Services: SSB Suite 3050 | 312-996-2300 | uic.joinhandshake.com.",

    international:
      "I can't confirm that international-student detail confidently from here. The best next step is the Office of International Services: SSB 2160 | 312-996-3121 | ois.uic.edu.",

    safety:
      "I can't confirm that safety or policy detail from the current data. The best next step is police.uic.edu for campus safety, 312-996-2830 for emergencies, or oae.uic.edu | 312-996-8670 for Title IX support.",

    library:
      "I can't confirm that library detail from here. The best next step is library.uic.edu or Daley Library at 312-996-2726.",

    athletics:
      "I can't confirm that athletics detail from my current data. The best next step is UICFlames.com for schedules, rosters, and ticket info.",

    transportation:
      "I can't confirm that transportation detail reliably from here. The best next step is transitchicago.com for CTA service or transportation.uic.edu for campus shuttle info.",

    student_life:
      "I don't have a live campus-events feed from here. The best next step is uic.edu/events for current events and connect.uic.edu for student orgs. For recurring programs or campus-life questions, I can still help.",

    general:
      "I don't have enough UIC-specific information to answer that reliably from the current data. I can still help with UIC courses, professors, 4-year plans, admissions, financial aid, housing, dining, campus services, student orgs, and athletics.",
  };

  return (
    responses[domain] ??
    "I don't have enough UIC-specific information to answer that reliably. Try asking about UIC courses, professors, planning, admissions, financial aid, housing, dining, campus services, student orgs, or athletics."
  );
}

// ─── Planning query detector — single source of truth used in two places ──────
// Matches any question about degree requirements, course sequences, graduation
// plans, or semester scheduling — regardless of whether the user says "plan".
function normalizeMajor(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === "cs" || s === "computer science" || s === "comp sci") return "computer_science";
  if (s === "ece" || s === "electrical" || s === "electrical engineering") return "electrical_engineering";
  if (s === "me" || s === "mechanical" || s === "mechanical engineering") return "mechanical_engineering";
  if (s === "ce" || s === "civil" || s === "civil engineering") return "civil_engineering";
  if (s === "math" || s === "mathematics") return "mathematics";
  if (s === "physics") return "physics";
  if (s === "biology" || s === "bio" || s === "biological sciences" || s === "biological science") return "biology";
  if (s === "chemistry" || s === "chem") return "chemistry";
  if (s === "nursing") return "nursing";
  if (s === "psychology" || s === "psych") return "psychology";
  if (s === "finance" || s === "fin") return "finance";
  if (s === "accounting" || s === "actg") return "accounting";
  if (s === "marketing") return "marketing";
  if (s === "business") return "business";
  if (s === "economics" || s === "econ") return "economics";
  if (s === "english") return "english";
  if (s === "history") return "history";
  if (s === "political science" || s === "pols" || s === "polisci") return "political_science";
  if (s === "sociology" || s === "soc") return "sociology";
  if (s === "philosophy" || s === "phil") return "philosophy";
  if (s === "art") return "art";
  if (s === "music") return "music";
  if (s === "education") return "education";
  if (s === "information systems" || s === "is" || s === "mis") return "information_systems";
  if (s === "data science") return "data_science";
  if (s === "neuroscience") return "neuroscience";
  if (s === "pre-med" || s === "premed" || s === "pre med") return "biology";
  if (s === "pre-law" || s === "prelaw" || s === "pre law") return "pre_law";
  // fallback: replace spaces with underscores
  return s.replace(/\s+/g, "_");
}

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
    // "how do I complete my CS degree / finish my degree"
    /\bhow (do i|can i) (complete|finish) (my|the|a) .{0,40}(degree|major|program)\b/.test(lower) ||
    // "can I graduate in 3 years", "on track to graduate"
    /\bcan i graduate in\b/.test(lower) ||
    /\bon track to graduate\b/.test(lower) ||
    // "how long will it take to graduate / to finish"
    /\bhow (long|many (years|semesters)) (will it|does it) take (me )?(to graduate|to finish|to complete)\b/.test(lower) ||
    // "requirements left", "requirements remaining", "requirements still needed"
    /\brequirements? (left|remaining|still needed)\b/.test(lower) ||
    // "what should I take next semester / this semester"
    /\bwhat should i take (next|this) (semester|year|term)\b/.test(lower) ||
    // "my next semester schedule", "this semester plan"
    /\b(next|this) semester (schedule|plan|courses?|classes?)\b/.test(lower) ||
    // "schedule for next semester", "schedule for spring"
    /\bschedule for (next|this|spring|fall|summer) (semester|term|year)?\b/.test(lower) ||
    // "roadmap for nursing", "degree roadmap", "path to graduation", "graduation path"
    /\b(roadmap|degree roadmap|academic roadmap|path to graduation|graduation path|academic path)\b/.test(lower) ||
    // "course sequence for CS", "academic plan for engineering"
    /\b(course sequence|academic plan|academic schedule) (for|to)\b/.test(lower) ||
    // "can I fit a minor", "room for a minor"
    /\b(fit|room for|add) a minor\b/.test(lower)
  );
}

function isMajorRequirementsLookupQuery(lower: string): boolean {
  return (
    /\bwhat (courses?|classes?) (do|must) i (need|complete|finish)\b/.test(lower) ||
    /\bwhat are the required courses for\b/.test(lower) ||
    /\b(required courses?|degree requirements?|major requirements?) (for|to)\b/.test(lower) ||
    /\bwhat do i need (to graduate|to finish|to complete (my|the) degree)\b/.test(lower)
  ) && !(
    /\bwhat should i take (next|this) (semester|year|term)\b/.test(lower) ||
    /\b(next|this) semester (schedule|plan|courses?|classes?)\b/.test(lower) ||
    /\bschedule for (next|this|spring|fall|summer) (semester|term|year)?\b/.test(lower) ||
    /\b(4.?year|four.?year|degree plan|course plan|semester.?plan|sequence|roadmap|academic plan|academic schedule)\b/.test(lower)
  );
}

function isTechnicalElectivesLookupQuery(lower: string): boolean {
  return /\btechnical electives?\b/.test(lower);
}

function isScienceElectivesLookupQuery(lower: string): boolean {
  return /\bscience electives?\b/.test(lower) || /\bscience courses?.{0,20}count\b/.test(lower);
}

// ── Follow-up query detector ──────────────────────────────────────────────────
// Detects vague continuation messages that carry no retrieval signal on their own.
// Used ONLY to trigger entity injection into the retrieval step — never as a fast path.
function isFollowUpQuery(msg: string): boolean {
  return /^(tell me more|more info|more details?|elaborate|explain more|expand on that|can you elaborate|what else|any other|go on|continue|what about (that|this|him|her|it|them)|and (him|her|it|them|that|this)|what does that mean|how so|why\s*so?|really\??|interesting|and that class|and that course|what about his|what about her|what about their|more about (him|her|it|that|this))[\s?!.]*$/i.test(msg.trim());
}

function buildSmartFollowUpInstruction(
  lastMsg: string,
  query: QueryAnalysis,
  sessionState?: SessionState | null
): string {
  const lower = lastMsg.toLowerCase().trim();

  if (
    /^(thanks+|thank you|thx+|got it|gotcha|makes sense|sounds good|perfect|awesome|cool|nice|ok|okay|bye+|goodbye|see ya|later|night)[\s!?.]*$/i.test(lower)
  ) {
    return "FOLLOW-UP QUESTION RULE: The student is wrapping up or acknowledging. Do not ask a follow-up question. End cleanly.";
  }

  const majorHint = sessionState?.confirmedMajor ? `major=${sessionState.confirmedMajor}` : null;
  const yearHint = sessionState?.confirmedYear ? `year=${sessionState.confirmedYear}` : null;
  const contextHints = [majorHint, yearHint].filter(Boolean).join(", ");

  if (query.isFact || query.answerMode === "logistics") {
    return "FOLLOW-UP QUESTION RULE: This is a direct factual/logistics answer. Do not force a question just to keep the conversation going. Only ask one if it unlocks an immediate next step, otherwise end after the answer.";
  }

  if (query.answerMode === "planning") {
    return `FOLLOW-UP QUESTION RULE: After the answer, ask exactly one short next-step question if it helps refine the student's plan. Prioritize questions about completed courses, current year, transfer/AP credit, workload, or career goal. Keep it under 14 words.${contextHints ? ` Known context: ${contextHints}.` : ""}`;
  }

  if (query.answerMode === "recommendation" || query.answerMode === "comparison") {
    return `FOLLOW-UP QUESTION RULE: End with exactly one short, tailored question that helps personalize the next recommendation. Good angles are workload, easy-A preference, commute, schedule, budget, or learning style. Keep it under 14 words.${contextHints ? ` Known context: ${contextHints}.` : ""}`;
  }

  if (query.answerMode === "ranking") {
    return "FOLLOW-UP QUESTION RULE: Only add a follow-up question if it would narrow the ranking in a useful way, like by major, Gen Ed category, difficulty, or professor preference. If you ask one, keep it to a single short sentence. Otherwise end cleanly.";
  }

  return `FOLLOW-UP QUESTION RULE: If it fits naturally, end with exactly one short, smart question that opens the most useful next turn. It should feel specific to the student's topic, not generic small talk like "Anything else?" or "Want more help?". Keep it under 14 words.${contextHints ? ` Known context: ${contextHints}.` : ""}`;
}

function buildCasualReplySystemPrompt(normMsg: string): string {
  const lower = normMsg.toLowerCase().trim();
  const isWrapUp =
    /^(thanks+|thank you|thx+|ok|okay|got it|gotcha|makes sense|sounds good|perfect|awesome|cool|nice|bye+|goodbye|see ya|later|night)[\s!?.]*$/i.test(lower);
  const isGreetingOrCheckIn =
    /^(h+e+y+|h+i+|hel+o+|helo+|hullo|howdy|sup+|s+u+p|yo+|yoo+|wh?[ao]+t'?s+ ?up+|wh?[ao]+t'?s+ ?good|wassup|wazzup|wsg|how are (you|u|ya)|how r u|how'?s? it go+ing|good morning|good afternoon|good evening|morning|wyd|wbu)[\s!?.]*$/i.test(lower);

  if (isWrapUp) {
    return "You are Sparky, a friendly UIC assistant. The student just sent a casual wrap-up or acknowledgment. Reply casually and briefly like a friend would in 1 sentence max. No UIC data, no lists, no preamble, and do not ask a follow-up question.";
  }

  if (isGreetingOrCheckIn) {
    return "You are Sparky, a friendly UIC assistant. The student just sent a casual greeting or check-in. Reply casually and briefly like a friend would in 1 sentence max. No UIC data, no lists, no preamble. If it fits naturally, ask one short question back to keep the conversation going.";
  }

  return "You are Sparky, a friendly UIC assistant. The student just sent a casual message. Reply casually and briefly like a friend would in 1 sentence max. No UIC data, no lists, no preamble. Be natural and warm.";
}

function detectAnswerMode(lower: string): AnswerMode {
  if (isMajorRequirementsLookupQuery(lower)) return "discovery";
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

function normalizeEntityText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractExpectedEntities(
  rawQuery: string,
  intent: {
    courseCode?: { subject: string; number: string } | null;
    profNameHint?: string | null;
    deptName?: string | null;
  },
  query: QueryAnalysis
): string[] {
  const expected = new Set<string>();

  if (intent.courseCode) {
    expected.add(`${intent.courseCode.subject} ${intent.courseCode.number}`);
  }
  if (intent.profNameHint && intent.profNameHint.trim().length >= 3) {
    expected.add(intent.profNameHint.trim());
  }
  if (!query.isFact) {
    return [...expected];
  }

  const canonicalEntityPatterns: Array<{ regex: RegExp; label: string }> = [
    { regex: /\barc\b/i, label: "ARC" },
    { regex: /\bjst\b/i, label: "JST" },
    { regex: /\bssr\b/i, label: "SSR" },
    { regex: /\bpsr\b/i, label: "PSR" },
    { regex: /\bmrh\b/i, label: "MRH" },
    { regex: /\btbh\b/i, label: "TBH" },
    { regex: /\bssb\b/i, label: "SSB" },
    { regex: /\blhs\b/i, label: "LHS" },
    { regex: /\bois\b/i, label: "OIS" },
    { regex: /\bfafsa\b/i, label: "FAFSA" },
    { regex: /\baspire grant\b/i, label: "Aspire Grant" },
    { regex: /\bcampuscare\b/i, label: "CampusCare" },
    { regex: /\bfinancial aid\b/i, label: "Financial Aid" },
    { regex: /\bcounseling center\b/i, label: "Counseling Center" },
    { regex: /\bdaley library\b/i, label: "Daley Library" },
    { regex: /\bengineering building\b/i, label: "Engineering Building" },
    { regex: /\bstudent center (east|west)\b/i, label: "Student Center" },
  ];

  for (const { regex, label } of canonicalEntityPatterns) {
    if (regex.test(rawQuery)) expected.add(label);
  }

  return [...expected];
}

function verifyExactEntityMatch(
  rawQuery: string,
  intent: {
    courseCode?: { subject: string; number: string } | null;
    profNameHint?: string | null;
    deptName?: string | null;
  },
  query: QueryAnalysis,
  chunks: RetrievedChunk[]
): EntityVerification {
  const expected = extractExpectedEntities(rawQuery, intent, query);
  if (expected.length === 0) {
    return { required: false, matched: true, expected: [], matchedBy: [] };
  }

  const haystacks = chunks.map((chunk) => normalizeEntityText(chunk.content));
  const matchedBy = expected.filter((entity) => {
    const normalized = normalizeEntityText(entity);
    if (!normalized) return false;

    return haystacks.some((content) => {
      if (content.includes(normalized)) return true;

      if (/^[a-z]{2,6} \d{3}[a-z]?$/.test(normalized)) {
        const compact = normalized.replace(/\s+/g, "");
        return content.includes(compact);
      }

      return normalized.split(" ").every((part) => part.length >= 3 && content.includes(part));
    });
  });

  return {
    required: true,
    matched: matchedBy.length > 0,
    expected,
    matchedBy,
  };
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

function resolveSession(req: Request, preferredSessionId?: string | null) {
  if (preferredSessionId) return { sessionId: preferredSessionId, isNew: false };
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

  let score = Math.min(overlapScore * 0.4 + domainScore * 0.35 + constraintScore + modeScore, 1);

  // Domain penalty: if one domain is dominant (≥0.85) and this chunk is from a different
  // domain, penalise heavily so off-topic chunks don't crowd out the relevant ones.
  const dcEntries = Object.entries(query.domainConfidence).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
  const topDomain = dcEntries[0]?.[0];
  const topConfidence = dcEntries[0]?.[1] ?? 0;
  if (topConfidence >= 0.85 && domain !== topDomain) {
    score *= 0.4;
  }

  return Math.min(score, 1);
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
  if (prefix && !finalContent.startsWith("[") && !finalContent.startsWith("===")) {
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

  const isAcademicLike =
    (dc["courses"] ?? 0) > 0.5 ||
    (dc["professors"] ?? 0) > 0.5 ||
    (dc["gen_ed"] ?? 0) > 0.5 ||
    (dc["major_plan"] ?? 0) > 0.5 ||
    /\b(course|courses|class|classes|professor|prof|instructor|gen ed|general education|major|degree|requirement|prerequisite)\b/.test(lower);

  if (isAcademicLike) {
    sourceTypes.add("course");
    sourceTypes.add("professor");
  }

  const isAthleticsLike =
    (dc["athletics"] ?? 0) > 0.5 ||
    lower.match(/\b(team|teams|athlete|athletes|softball|baseball|basketball|soccer|tennis|volleyball|swim|track|flames)\b/) !== null;

  const isStudentLifeLike =
    (dc["student_life"] ?? 0) > 0.5 ||
    lower.match(/\b(club|clubs|org|organization|student life|campus vibe|what's happening|recently|lately|social media)\b/) !== null;

  const isRecentSocialQuery =
    lower.match(/\b(lately|recently|worth mentioning|active lately|current vibe|what are.*doing|who.*worth mentioning)\b/) !== null;

  if (isAthleticsLike || isStudentLifeLike || isRecentSocialQuery) {
    sourceTypes.add("news");
  }

  return Array.from(sourceTypes);
}

function mapVectorSourceTypeToDomain(sourceType: string): Domain {
  if (sourceType === "news") return "news";
  if (sourceType === "professor") return "professors";
  return "courses";
}

function vectorSourceConfidence(sourceType: string, trustLevel?: string | null): number {
  if (sourceType === "course") return 0.82;
  if (sourceType === "professor") return 0.80;
  if (sourceType === "news") return 0.78;
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
          `${c.subject} ${c.number} - ${c.title}: Easiness ${c.difficultyScore?.toFixed(1) ?? "N/A"}/5 (${diffLabel(c.difficultyScore)}), GPA ${c.avgGpa ?? "N/A"}, ${c.totalRegsAllTime} students${c.isGenEd ? " [Gen Ed]" : ""}`
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
          `${c.subject} ${c.number} - ${c.title}: Easiness ${c.difficultyScore?.toFixed(1) ?? "N/A"}/5 (${diffLabel(c.difficultyScore)}), GPA ${c.avgGpa ?? "N/A"}, ${c.totalRegsAllTime} students${c.isGenEd ? " [Gen Ed]" : ""}`
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
    const honorsQuery = /honors/i.test(lower);
    let filtered = geneds;
    if (engineeringMajor && query.answerMode === "recommendation") {
      // For engineers, prioritize high-GPA gen eds outside hard sciences
      filtered = geneds.filter((c: any) => !["PHYS","CHEM","BIOS","MATH"].includes(c.subject));
    }
    if (!honorsQuery) {
      filtered = filtered.filter((c: any) => c.subject !== "HON");
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
          (prof.salary ? `Salary: $${Number(prof.salary).toLocaleString("en-US", { maximumFractionDigits: 0 })}${prof.salaryTitle ? ` (${prof.salaryTitle})` : ""}\n` : "") +
          (prof.aiSummary ? `Student consensus: ${prof.aiSummary.slice(0, 300)}\n` : "") +
          `Courses: ${courses.map((c: any) => c.label).join(", ")}`;
        chunks.push(makeChunk("professors", content, 0.98, query));
        // Specific professor found — skip generic dept list to avoid noise
        return chunks;
      }
    }
    // No specific professor matched — fetch dept/generic list
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
    warnings.push("No official sample schedule on file — sequence is generated from required course list");
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
      warnings.push(`${sem.label ?? `${sem.year} ${sem.semester}`}: schedule lists ${declared}h but individual courses sum to ${courseSum}h`);
    }
    // Flag unusually heavy/light semesters
    const semHours = declared || courseSum;
    if (semHours > 19) warnings.push(`${sem.label ?? `${sem.year} ${sem.semester}`}: ${semHours}h is above normal full-time load (≤18h)`);
  }

  // Total credit check
  const expectedTotal: number | null = majorMatch.totalHours ?? null;
  if (expectedTotal && creditTotal > 0 && Math.abs(creditTotal - expectedTotal) > 3) {
    const delta = creditTotal - expectedTotal;
    warnings.push(`Schedule totals ${creditTotal} credits; degree requires ${expectedTotal} (${delta > 0 ? "+" : ""}${delta} delta — electives or gen-eds may account for gap)`);
  }

  return { warnings, creditTotal, expectedTotal };
}

// ─── Format the sample schedule exactly as stored in the JSON ─────────────────
// No DB queries, no elective filling — just render what's in the data.
const ELECTIVE_LABELS: Record<string, string> = {
  science_elective: "Science Elective",
  required_math: "Required Math",
  gen_ed_any: "Gen Ed",
  technical_elective: "Technical Elective",
  free_elective: "Free Elective",
  humanities_elective: "Humanities/Social Science Elective",
  elective_general: "Major Elective",
  major_elective: "Major Elective",
  global_biz: "Global Business Perspectives",
  math_elective: "Math Elective",
};

function semYearNumber(yearStr: string): number {
  const s = (yearStr ?? "").toLowerCase();
  if (s.includes("freshman") || s.includes("first") || s.includes("1st")) return 1;
  if (s.includes("sophomore") || s.includes("second") || s.includes("2nd")) return 2;
  if (s.includes("junior") || s.includes("third") || s.includes("3rd")) return 3;
  if (s.includes("senior") || s.includes("fourth") || s.includes("4th")) return 4;
  return 4; // fourth, fifth, etc.
}

// ── Student progress extraction ───────────────────────────────────────────────
// Pulls year standing and completed course codes from the user's message.
// Used to personalise the planning scaffold before handing to Claude.
function extractStudentProgress(rawQuery: string): { completedCourses: string[]; yearStanding: number } {
  let yearStanding = 0;
  if (/\b(i'?m\s+)?(already\s+)?a?\s*(freshman|first[- ]?year)\b/i.test(rawQuery)) yearStanding = 1;
  else if (/\b(i'?m\s+)?(already\s+)?a?\s*(sophomore|second[- ]?year)\b/i.test(rawQuery)) yearStanding = 2;
  else if (/\b(i'?m\s+)?(already\s+)?a?\s*(junior|third[- ]?year)\b/i.test(rawQuery)) yearStanding = 3;
  else if (/\b(i'?m\s+)?(already\s+)?a?\s*(senior|fourth[- ]?year)\b/i.test(rawQuery)) yearStanding = 4;

  const completedCourses: string[] = [];
  // Match completion phrases, then extract course codes from the trailing segment
  const completionPhraseRe =
    /(?:already\s+took|have\s+taken|already\s+taken|i\s+took|took|completed|finished|done\s+with|i'?ve\s+(?:already\s+)?(?:taken|completed|finished))\s+(.{3,200}?)(?:\.|,?\s+(?:and\s+i|so\b|but\b|now\b|my\b|what\b)|$)/gi;
  const courseCodeRe = /\b([A-Z&]{2,5})\s+(\d{3}[A-Z]?)\b/g;

  let phraseMatch: RegExpExecArray | null;
  while ((phraseMatch = completionPhraseRe.exec(rawQuery)) !== null) {
    const segment = phraseMatch[1];
    let codeMatch: RegExpExecArray | null;
    courseCodeRe.lastIndex = 0;
    while ((codeMatch = courseCodeRe.exec(segment)) !== null) {
      completedCourses.push(`${codeMatch[1]} ${codeMatch[2]}`);
    }
  }

  return { completedCourses: [...new Set(completedCourses)], yearStanding };
}

// ── Student context extraction (planning pipeline) ────────────────────────────
// Scans the current query AND conversation history to extract all available
// student context. Used as input to buildPlanningObject.
// Rule: if data is absent, set fields to empty/null — never hallucinate.
function extractStudentContext(
  rawQuery: string,
  conversationHistory: ChatMessage[]
): StudentContext {
  // Combine all text we have: history (assistant turns omitted to avoid
  // confusing Claude's prior answers with student facts) + current query.
  const studentTurns = [
    ...conversationHistory.filter(m => m.role === "user").map(m => m.content),
    rawQuery,
  ].join(" ");

  // ── Major detection ───────────────────────────────────────────────────────
  // Matches: "I'm a CS major", "studying nursing", "in the engineering program", etc.
  let major: string | null = null;
  const majorPatterns: [RegExp, string][] = [
    [/\b(computer science|cs)\s*(major|program|degree)?\b/i, "Computer Science"],
    [/\b(electrical (and computer engineering|engineering)|ece)\b/i, "Electrical and Computer Engineering"],
    [/\b(mechanical engineering|me)\s*(major|program)?\b/i, "Mechanical Engineering"],
    [/\b(civil engineering)\b/i, "Civil Engineering"],
    [/\b(bioengineering|bioe)\b/i, "Bioengineering"],
    [/\b(chemical engineering|che)\b/i, "Chemical Engineering"],
    [/\b(industrial engineering|ie)\b/i, "Industrial Engineering"],
    [/\b(nursing)\s*(major|program|degree|student)?\b/i, "Nursing"],
    [/\b(biological sciences?|bio(?:logical)? sciences?)\s*(major|program)?\b/i, "Biological Sciences"],
    [/\b(biology|bios)\s*(major|program)?\b/i, "Biology"],
    [/\b(pre-?med|premed)\b/i, "Biological Sciences"],
    [/\b(chemistry|chem)\s*(major|program)?\b/i, "Chemistry"],
    [/\b(physics|phys)\s*(major|program)?\b/i, "Physics"],
    [/\b(mathematics|math)\s*(major|program)?\b/i, "Mathematics"],
    [/\b(accounting|actg)\s*(major|program)?\b/i, "Accounting"],
    [/\b(finance|fin)\s*(major|program)?\b/i, "Finance"],
    [/\b(marketing)\s*(major|program)?\b/i, "Marketing"],
    [/\b(management)\s*(major|program)?\b/i, "Management"],
    [/\b(information and decision sciences|ids)\b/i, "Information and Decision Sciences"],
    [/\b(psychology|psch)\s*(major|program)?\b/i, "Psychology"],
    [/\b(sociology|soc)\s*(major|program)?\b/i, "Sociology"],
    [/\b(english)\s*(major|program)?\b/i, "English"],
    [/\b(history)\s*(major|program)?\b/i, "History"],
    [/\b(political science|pols)\s*(major|program)?\b/i, "Political Science"],
    [/\b(criminology law and justice|criminology|criminal justice)\s*(major|program)?\b/i, "Criminology Law and Justice"],
    [/\b(architecture)\s*(major|program)?\b/i, "Architecture"],
    [/\b(public health)\s*(major|program)?\b/i, "Public Health"],
    [/\b(kinesiology|kin)\s*(major|program)?\b/i, "Kinesiology"],
    [/\b(engineering)\s*(major|program|student|degree)?\b/i, "Engineering"],
  ];

  // Check explicit major/studying phrasing first
  const majorDeclareRe = /\b(i(?:'?m| am) (?:a |an )?|studying |in the |declared? |my major is |majoring in )([a-z &]+?)(?:\s*(?:major|program|student|degree))?\b/i;
  const declareMatch = majorDeclareRe.exec(studentTurns);
  if (declareMatch) {
    const candidate = declareMatch[2].toLowerCase().trim();
    for (const [pattern, name] of majorPatterns) {
      if (pattern.test(candidate)) { major = name; break; }
    }
  }
  // Fall back to scanning all turns
  if (!major) {
    for (const [pattern, name] of majorPatterns) {
      if (pattern.test(studentTurns)) { major = name; break; }
    }
  }

  // ── Completed course extraction ───────────────────────────────────────────
  // Reuse the same regex logic as extractStudentProgress, but applied to all turns.
  const completedCourses: string[] = [];
  const completionPhraseRe =
    /(?:already\s+took|have\s+taken|already\s+taken|i\s+took|took|completed|finished|done\s+with|i'?ve\s+(?:already\s+)?(?:taken|completed|finished))\s+(.{3,200}?)(?:\.|,?\s+(?:and\s+i|so\b|but\b|now\b|my\b|what\b)|$)/gi;
  const courseCodeRe = /\b([A-Z&]{2,5})\s+(\d{3}[A-Z]?)\b/g;

  let phraseMatch: RegExpExecArray | null;
  while ((phraseMatch = completionPhraseRe.exec(studentTurns)) !== null) {
    const segment = phraseMatch[1];
    let codeMatch: RegExpExecArray | null;
    courseCodeRe.lastIndex = 0;
    while ((codeMatch = courseCodeRe.exec(segment)) !== null) {
      completedCourses.push(`${codeMatch[1]} ${codeMatch[2]}`);
    }
  }

  // ── In-progress course extraction ─────────────────────────────────────────
  const inProgressCourses: string[] = [];
  const inProgressPhraseRe =
    /(?:currently\s+(?:taking|in|enrolled in)|taking\s+(?:right\s+now|this\s+semester|this\s+term)|i'?m\s+in|enrolled\s+in|registered\s+for)\s+(.{3,200}?)(?:\.|,?\s+(?:and\s+i|so\b|but\b|what\b)|$)/gi;

  let ipMatch: RegExpExecArray | null;
  while ((ipMatch = inProgressPhraseRe.exec(studentTurns)) !== null) {
    const segment = ipMatch[1];
    let codeMatch: RegExpExecArray | null;
    courseCodeRe.lastIndex = 0;
    while ((codeMatch = courseCodeRe.exec(segment)) !== null) {
      inProgressCourses.push(`${codeMatch[1]} ${codeMatch[2]}`);
    }
  }

  // ── Constraints extraction ─────────────────────────────────────────────────
  const constraints: string[] = [];
  if (/\b(transfer|transferred|transfer student)\b/i.test(studentTurns))
    constraints.push("transfer student");
  if (/\b(part.?time|part time)\b/i.test(studentTurns))
    constraints.push("part-time");
  if (/\b(honors|honors college)\b/i.test(studentTurns))
    constraints.push("honors college");
  if (/\b(commut(e|er|ing))\b/i.test(studentTurns))
    constraints.push("commuter");
  if (/\b(double major|dual degree|second major)\b/i.test(studentTurns))
    constraints.push("double major");
  if (/\b(minor in|adding a minor|with a minor)\b/i.test(studentTurns))
    constraints.push("minor");
  if (/\b(pre.?med|pre.?health|pre.?law|pre.?dental)\b/i.test(studentTurns))
    constraints.push("pre-professional track");
  if (/\b(3 years?|graduate early|finish early|3.?year plan)\b/i.test(studentTurns))
    constraints.push("accelerated graduation (3 years)");
  if (/\b(international student|f.?1|f1 visa|ois)\b/i.test(studentTurns))
    constraints.push("international student");

  return {
    major,
    completed_courses: [...new Set(completedCourses)],
    in_progress_courses: [...new Set(inProgressCourses)],
    constraints,
  };
}

// ── Planning object builder ───────────────────────────────────────────────────
// EXECUTION ORDER:
//   Query
//   → isPlanningQuery()           (detect planning intent)
//   → extractStudentContext()     (extract who the student is)
//   → retrieveMajorPlan()         (fetch requirements data)
//   → buildPlanningObject()       ← this function (structure via Claude)
//   → final answer generation     (human-readable output from PlanningObject)
//
// Throws PlanningObjectError if both attempts fail — callers MUST handle this
// and return a controlled failure response. Raw scaffold MUST NOT reach the
// answer generation step.

class PlanningObjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanningObjectError";
  }
}

// Strict structural validator — throws on any violation.
// Treats "Major not found" as a valid terminal state with an empty semester_plan.
function validatePlanningObject(obj: unknown): PlanningObject {
  if (typeof obj !== "object" || obj === null) throw new Error("root is not an object");
  const p = obj as Record<string, unknown>;

  if (typeof p["intent"] !== "string" || !(p["intent"] as string).trim())
    throw new Error("missing or empty 'intent'");
  if (typeof p["plan_strategy"] !== "string" || !(p["plan_strategy"] as string).trim())
    throw new Error("missing or empty 'plan_strategy'");

  const sc = p["student_context"] as Record<string, unknown>;
  if (typeof sc !== "object" || sc === null) throw new Error("missing 'student_context'");
  if (!Array.isArray(sc["completed_courses"]))  throw new Error("student_context.completed_courses must be array");
  if (!Array.isArray(sc["in_progress_courses"])) throw new Error("student_context.in_progress_courses must be array");
  if (!Array.isArray(sc["constraints"]))         throw new Error("student_context.constraints must be array");

  const req = p["requirements"] as Record<string, unknown>;
  if (typeof req !== "object" || req === null) throw new Error("missing 'requirements'");
  if (!Array.isArray(req["required_courses"]))  throw new Error("requirements.required_courses must be array");
  if (!Array.isArray(req["elective_buckets"]))  throw new Error("requirements.elective_buckets must be array");
  if (!Array.isArray(req["credit_rules"]))      throw new Error("requirements.credit_rules must be array");

  if (!Array.isArray(p["semester_plan"])) throw new Error("semester_plan must be array");
  const isMajorNotFound = (p["plan_strategy"] as string).toLowerCase().includes("major not found");

  if (!isMajorNotFound && (p["semester_plan"] as unknown[]).length === 0)
    throw new Error("semester_plan is empty");

  const PLACEHOLDER_RE = /\*|(?:^|\s)(Science|Gen Ed|Technical|Free|General|Core|Major) Elective/i;
  for (const term of p["semester_plan"] as Record<string, unknown>[]) {
    if (typeof term["term"] !== "string" || !(term["term"] as string).trim())
      throw new Error("a semester_plan term is missing its 'term' string");
    if (!Array.isArray(term["courses"]))
      throw new Error(`term '${term["term"]}' missing courses array`);
    if (!isMajorNotFound && (term["courses"] as unknown[]).length === 0)
      throw new Error(`term '${term["term"]}' has empty courses array`);
    for (const c of term["courses"] as unknown[]) {
      if (typeof c !== "string" || !(c as string).trim())
        throw new Error(`term '${term["term"]}' contains a non-string or blank course entry`);
      if (PLACEHOLDER_RE.test(c as string))
        throw new Error(`term '${term["term"]}' contains unresolved placeholder: "${c}"`);
    }
  }

  return p as unknown as PlanningObject;
}

// ── Phase 2: Plan response validation ────────────────────────────────────────
// Runs AFTER the final answer is generated, BEFORE it is returned to the user.
// Checks the rendered plan text against the required course manifest.
function validatePlan(
  response: string,
  manifest: string[]
): {
  valid: boolean;
  missingCourses: string[];
  invalidCourses: string[];
  duplicateCourses: string[];
  hasPlaceholders: boolean;
  foundCodes: string[];
} {
  const COURSE_CODE_RE = /\b([A-Z&]{2,5})\s+(\d{3}[A-Z]?)\b/g;
  const PLACEHOLDER_RE = /\[.+?\]|\bTBD\b|\belective slot\b/i;

  // Collect all occurrences (with duplicates) to detect repeated required courses
  const allFound: string[] = [];
  let m: RegExpExecArray | null;
  COURSE_CODE_RE.lastIndex = 0;
  while ((m = COURSE_CODE_RE.exec(response)) !== null) {
    allFound.push(`${m[1]} ${m[2]}`);
  }
  const foundCodes = [...new Set(allFound)];

  // Count occurrences of each code — required courses must appear exactly once
  const countMap = new Map<string, number>();
  for (const c of allFound) countMap.set(c, (countMap.get(c) ?? 0) + 1);
  const duplicateCourses = manifest.filter(c => (countMap.get(c) ?? 0) > 1);

  const missingCourses  = manifest.filter(c => !foundCodes.includes(c));
  const invalidCourses  = foundCodes.filter(c => {
    const num = c.match(/\d{3}/);
    return num ? parseInt(num[0], 10) >= 500 : false;
  });
  const hasPlaceholders = PLACEHOLDER_RE.test(response);

  return {
    valid: missingCourses.length === 0 && invalidCourses.length === 0 &&
           duplicateCourses.length === 0 && !hasPlaceholders,
    missingCourses,
    invalidCourses,
    duplicateCourses,
    hasPlaceholders,
    foundCodes,
  };
}

function buildCorrectionPrompt(
  validation: ReturnType<typeof validatePlan>
): string {
  const issues: string[] = [];
  if (validation.missingCourses.length > 0)
    issues.push(`- Missing required courses (add each exactly once): ${validation.missingCourses.join(", ")}`);
  if (validation.invalidCourses.length > 0)
    issues.push(`- Invalid courses ≥500 level (remove entirely): ${validation.invalidCourses.join(", ")}`);
  if (validation.duplicateCourses.length > 0)
    issues.push(`- Duplicate required courses (each must appear exactly once): ${validation.duplicateCourses.join(", ")}`);
  if (validation.hasPlaceholders)
    issues.push(`- Unresolved placeholders detected — replace ALL with real course codes from the scaffold`);

  return `You MUST fix ALL listed issues. If ANY issue remains, your response will be rejected again.

${issues.join("\n")}

Rules:
- Include every missing course exactly once
- Remove all invalid courses (≥500)
- Replace ALL placeholders with real course codes

Output the FULL corrected plan.`;
}

function buildPlanningPrompt(
  scaffoldContent: string,
  studentCtx: StudentContext,
  queryIntent: string,
  strict: boolean
): string {
  const strictPrefix = strict
    ? `CRITICAL: Your previous attempt was rejected because the output was structurally invalid. Output ONLY raw JSON — no markdown, no text, no fences. Start your response with { and end with }.\n\n`
    : "";

  return `${strictPrefix}You are a UIC academic planning engine. Output ONLY a single valid JSON object — no prose, no markdown fences, no explanation. Start with { and end with }.

REQUIRED SCHEMA (all fields mandatory):
{"intent":"<string>","student_context":{"major":"<string|null>","completed_courses":["<code>"],"in_progress_courses":["<code>"],"constraints":["<string>"]},"requirements":{"required_courses":["<code>"],"elective_buckets":["<string>"],"credit_rules":["<string>"]},"plan_strategy":"<string>","semester_plan":[{"term":"<Year N Season>","courses":["<code>"],"reasoning":"<string>"}]}

RULES (violations = rejection):
1. Raw JSON only — no text outside the object.
2. required_courses verbatim from REQUIRED COURSE MANIFEST — no invented codes.
3. semester_plan follows SAMPLE SCHEDULE BACKBONE order exactly.
4. Completed courses MUST NOT appear in semester_plan.
5. No course code ≥500 in an undergraduate plan.
6. No placeholder text (e.g. "*Science Elective*") in courses arrays — use real codes from ELECTIVE OPTIONS.
7. DO NOT include HON courses, honors seminars, or honors-only gen eds unless the student explicitly says they are in Honors College / an honors student in STUDENT CONTEXT constraints.
8. semester_plan must be non-empty unless scaffold says NO PLAN DATA FOUND (then return plan_strategy "Major not found — direct student to catalog.uic.edu" and empty semester_plan array).

STUDENT CONTEXT:
Major: ${studentCtx.major ?? "not specified"}
Completed: ${studentCtx.completed_courses.join(", ") || "none"}
In-progress: ${studentCtx.in_progress_courses.join(", ") || "none"}
Constraints: ${studentCtx.constraints.join(", ") || "none"}
Query intent: ${queryIntent}

DEGREE PLAN SCAFFOLD:
${scaffoldContent}`;
}

// Throws PlanningObjectError — never returns null.
async function buildPlanningObject(
  scaffoldContent: string,
  studentCtx: StudentContext,
  queryIntent: string
): Promise<PlanningObject> {
  const callClaude = async (strict: boolean): Promise<PlanningObject> => {
    const prompt = buildPlanningPrompt(scaffoldContent, studentCtx, queryIntent, strict);
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (response.content[0] as any)?.text ?? "";
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed: unknown = JSON.parse(jsonText);
    return validatePlanningObject(parsed); // throws on structural violation
  };

  // Attempt 1
  try {
    return await callClaude(false);
  } catch (err1) {
    console.warn("[buildPlanningObject] Attempt 1 failed:", (err1 as Error).message);
  }

  // Attempt 2 — stricter prompt
  try {
    return await callClaude(true);
  } catch (err2) {
    console.error("[buildPlanningObject] Attempt 2 failed:", (err2 as Error).message);
    throw new PlanningObjectError("Both planning attempts failed — cannot generate academic plan");
  }
}

function formatSampleSchedule(
  majorMatch: any,
  electiveMap: Record<string, { code: string; title: string }[]> = {},
  maxYears = 4,
  startYear = 1,
  fillElectives = true
): string {
  const formatSemesterHeader = (label: string, totalHours: number | null | undefined): string => {
    return totalHours != null ? `### ${label} (${totalHours}h)` : `### ${label}`;
  };

  const formatHours = (hours: number | null | undefined): string => {
    return hours != null ? ` (${hours} cr)` : "";
  };

  const lines: string[] = [];
  // Clone queues so we can shift() without mutating the original
  const queues: Record<string, { code: string; title: string }[]> = {};
  for (const [k, v] of Object.entries(electiveMap)) queues[k] = [...v];

  // Track every course code used so far to prevent any duplicate across the schedule
  const usedCodes = new Set<string>();

  for (const sem of majorMatch.sampleSchedule ?? []) {
    const yn = semYearNumber(sem.year ?? "");
    if (yn < startYear || yn > maxYears) continue;
    const semHeader = sem.label ?? `${sem.year} — ${sem.semester}`;
    lines.push(formatSemesterHeader(semHeader, sem.total_hours));
    for (const c of sem.courses ?? []) {
      if (!c.isElective) {
        if (c.code) usedCodes.add(c.code);
        lines.push(`- **${c.code}** — ${c.title}${formatHours(c.hours)}`);
      } else {
        const queue = c.electiveType ? queues[c.electiveType] : undefined;
        // Skip any course already used elsewhere in the schedule
        let fill: { code: string; title: string } | undefined;
        while (queue?.length) {
          const candidate = queue.shift()!;
          if (!usedCodes.has(candidate.code)) {
            fill = candidate;
            break;
          }
        }
        const label = ELECTIVE_LABELS[c.electiveType ?? ""] ?? c.title ?? "Elective";
        if (fillElectives && fill) {
          usedCodes.add(fill.code);
          lines.push(`- **${fill.code}** — ${fill.title}${formatHours(c.hours)} *(${label})*`);
        } else {
          lines.push(`- *${label}*${formatHours(c.hours)}`);
        }
      }
    }
    lines.push("");
  }
  return lines.join("\n");
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
      return { name: m.name, requiredEngineering: { courses: [] }, sampleSchedule: [] };
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
      // Use word-boundary check so "chemistry" doesn't match inside "biochemistry"
      const baseName = n.replace(/\s+(bs|ba|bfa|bmus|ms)$/, "").trim();
      if (baseName.length > 4) {
        const words = baseName.split(/\s+/);
        const allWordsPresent = words.every((w: string) => new RegExp(`\\b${w}\\b`, "i").test(lower));
        if (allWordsPresent) return true;
      }

      // Explicit aliases for common queries / abbreviations
      if (n.includes("computer science") && !n.includes("design") && !n.includes("philosophy") && !n.includes("linguistics") && !n.includes("mathematics") &&
          (/\bcs\b/.test(lower) || lower.includes("computer science"))) return true;
      if (n.includes("computer science and design") && (lower.includes("cs and design") || lower.includes("computer science and design"))) return true;
      if (n.includes("information and decision sciences") && (lower.includes("ids") || lower.includes("information and decision"))) return true;
      if (n.includes("biochemistry") && lower.includes("biochem")) return true;
      if (n.includes("biological sciences") && (/\bbiological sciences?\b/.test(lower) || /\bbio(?:logical)? sciences?\b/.test(lower) || /\bpre-?med\b/.test(lower) || /\bpremed\b/.test(lower))) return true;
      if (n.includes("chemistry") && !n.includes("biochemistry") && lower.includes("chem") && !lower.includes("biochem")) return true;
      if (n.includes("biology") && (lower.includes("biol") || lower.includes("biology"))) return true;
      // Exclude "applied psychology" from the generic psych alias — handle it separately
      if (n.includes("applied psychology") && (lower.includes("applied psych") || lower.includes("applied psychology"))) return true;
      if (n.includes("psychology") && !n.includes("applied") && lower.includes("psych") && !lower.includes("applied psych") && !lower.includes("applied psychology")) return true;
      if (n.includes("kinesiology") && (lower.includes("kin") || lower.includes("kinesiology"))) return true;
      if (n.includes("nursing") && lower.includes("nurs")) return true;
      if (n.includes("accounting") && lower.includes("account")) return true;
      if (n.includes("finance") && lower.includes("finance")) return true;
      if (n.includes("marketing") && lower.includes("marketing")) return true;
      if (n.includes("management") && !n.includes("engineering") && !n.includes("health") && lower.includes("management")) return true;
      // Generic "business" query (no specific major named) → default to Management BS.
      // All 8 CBA majors share the same base schedule so any one works.
      if (n === "management bs" &&
          /\bbusiness\b/.test(lower) &&
          !/(accounting|finance|marketing|entrepreneurship|human resource|real estate|information and decision|\bids\b|music business)/.test(lower)) return true;
      if (n.includes("economics") && lower.includes("econ")) return true;
      if (n.includes("mechanical engineering") && lower.includes("mechanical")) return true;
      if (
        n === "mechanical engineering bs" &&
        /\bengineering\b/.test(lower) &&
        !/(electrical|ece|mechanical|civil|biomedical|bioengineering|computer engineering|environmental engineering|industrial engineering|chemical engineering|engineering physics)/.test(lower)
      ) return true;
      if (n.includes("electrical engineering") && lower.includes("electrical")) return true;
      if (n.includes("civil engineering") && lower.includes("civil")) return true;
      if (n.includes("biomedical engineering") && (lower.includes("biomed") || lower.includes("bme") || lower.includes("biomedical"))) return true;
      if (n.includes("environmental engineering") && lower.includes("environmental eng")) return true;
      if (n.includes("industrial engineering") && lower.includes("industrial")) return true;
      if (n.includes("computer engineering") && lower.includes("computer eng")) return true;
      if (n.includes("public health") && lower.includes("public health")) return true;
      if (n.includes("neuroscience") && lower.includes("neuro")) return true;
      if (n.includes("criminology") && (lower.includes("crim") || lower.includes("criminal justice") || lower.includes("criminology law and justice"))) return true;
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
      const scoreA = isStandard(a.name) + (a.requiredEngineering?.courses?.length ?? a.requiredCourses?.length ?? 0);
      const scoreB = isStandard(b.name) + (b.requiredEngineering?.courses?.length ?? b.requiredCourses?.length ?? 0);
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
- Direct them to: catalog.uic.edu (search for their major)
- Offer to help with other topics (professors, courses, housing, etc.)

Available majors in data (suggest they check if their major appears under a different name):
${list}`, 0.7, query)];
    }
 
    const progress = extractStudentProgress(query.rawQuery);
    const completedCourses = progress.completedCourses;

    // ── REQUIRED COURSES — with credit hours from source data ──────────────
    // Support both new structure (requiredEngineering.courses) and legacy (requiredCourses)
    const allRequiredCourses: any[] = majorMatch.requiredEngineering?.courses ?? majorMatch.requiredCourses ?? [];
    const required = allRequiredCourses.slice(0, 90).map((c: any) =>
      `${c.code}: ${c.title} — ${c.hours ?? "?"} credit hours`
    ).join("\n");
    const fixedNonEngineering = majorMatch.nonEngineeringRequirements?.fixedCourses ?? [];
    if (isTechnicalElectivesLookupQuery(lower) && majorMatch.technicalElectives?.options?.length) {
      const technicalText = [
        `=== DETERMINISTIC FACT ===`,
        `For **${majorMatch.name}**, you need **${majorMatch.technicalElectives.totalHours ?? 18} hours of technical electives**.`,
        `${majorMatch.technicalElectives.description ?? ""}`.trim(),
        ``,
        `Approved options in the current major data include:`,
        ...(majorMatch.technicalElectives.options as any[]).map((c: any) => `- **${c.code}** — ${c.title}`),
      ].join("\n");
      return [makeChunk("major_plan", technicalText, 0.99, query)];
    }

    if (isScienceElectivesLookupQuery(lower) && majorMatch.scienceElectives?.options?.length) {
      const scienceText = [
        `=== DETERMINISTIC FACT ===`,
        `For **${majorMatch.name}**, you need **${majorMatch.scienceElectives.totalHours ?? 8} hours of science electives**.`,
        `${majorMatch.scienceElectives.description ?? ""}`.trim(),
        majorMatch.scienceElectives.note ? `${majorMatch.scienceElectives.note}` : "",
        ``,
        `Approved options in the current major data include:`,
        ...(majorMatch.scienceElectives.options as any[]).map((c: any) => `- **${c.code}** — ${c.title}`),
      ].filter(Boolean).join("\n");
      return [makeChunk("major_plan", scienceText, 0.99, query)];
    }

    if (isMajorRequirementsLookupQuery(lower)) {
      const requirementsText = [
        `=== DETERMINISTIC REQUIREMENTS ===`,
        `**${majorMatch.name}** requires **${majorMatch.totalHours ?? 128} total credits**.`,
        ``,
        `**Required CS / Engineering courses**`,
        ...allRequiredCourses
          .filter((c: any) => c.hours != null)
          .map((c: any) => `- **${c.code}** — ${c.title} (${c.hours} cr)`),
        ``,
        `**Fixed math and writing requirements**`,
        ...fixedNonEngineering.map((c: any) => `- **${c.code}** — ${c.title} (${c.hours} cr)`),
        ``,
        `**Additional category requirements**`,
        `- UIC General Education Core: ${majorMatch.nonEngineeringRequirements?.generalEducationCore?.hours ?? "varies"} credit hours`,
        `- Humanities / Social Sciences / Art electives: ${majorMatch.nonEngineeringRequirements?.humanitiesSocialScienceArt?.hours ?? "varies"} credit hours`,
        `- Science electives: ${majorMatch.nonEngineeringRequirements?.scienceElectives?.hours ?? "varies"} credit hours`,
        `- Technical electives: ${majorMatch.technicalElectives?.totalHours ?? "varies"} credit hours`,
        `- Free electives: ${majorMatch.freeElectives?.totalHours ?? "varies"} credit hours`,
        ``,
        `Official catalog: ${majorMatch.url ?? "catalog.uic.edu"}`,
      ].join("\n");
      return [makeChunk("major_plan", requirementsText, 0.99, query)];
    }

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
      allRequiredCourses.map((c: any) => c.code?.toUpperCase()).filter(Boolean)
    );

    // Build elective groups array from new structure or fall back to legacy electiveGroups
    const electiveGroupsArray: any[] = majorMatch.electiveGroups ?? [
      ...(majorMatch.technicalElectives ? [{
        label: majorMatch.technicalElectives.description ?? "Technical Electives",
        credits: majorMatch.technicalElectives.totalHours,
        options: majorMatch.technicalElectives.options ?? []
      }] : []),
      ...(majorMatch.requiredMath ? [{
        label: majorMatch.requiredMath.description ?? "Required Mathematics Courses",
        credits: majorMatch.requiredMath.totalHours,
        options: majorMatch.requiredMath.options ?? []
      }] : []),
      ...(majorMatch.scienceElectives ? [{
        label: majorMatch.scienceElectives.description ?? "Science Electives",
        credits: majorMatch.scienceElectives.totalHours,
        options: majorMatch.scienceElectives.options ?? []
      }] : []),
      ...(majorMatch.freeElectives ? [{
        label: majorMatch.freeElectives.description ?? "Free Electives",
        credits: majorMatch.freeElectives.totalHours,
        options: []
      }] : []),
    ];

    // Fetch DB data — filter elective options to undergrad level (100-499) only
    const rankedGroups: Array<{ g: any; ranked: any[] }> = await Promise.all(
      electiveGroupsArray.map(async (g: any) => {
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

    // ── PLAN TIER ─────────────────────────────────────────────────────────────
    const hasSchedule = (majorMatch.sampleSchedule?.length ?? 0) > 0;
    const hasCourses = allRequiredCourses.length >= 5;
    const planTier: "full" | "schedule" | "courses_only" | "minimal" =
      hasSchedule && hasCourses ? "full"
      : hasCourses ? "courses_only"
      : "minimal";

    // ── FOR FULL/SCHEDULE TIERS: build plan deterministically in TypeScript ───
    // The model gets a completed plan and is told only to format/present it.
    // This prevents hallucination entirely — the model invents nothing.
    if (hasSchedule) {
      // ── Fill science_elective slots with easiest real courses from DB ──────
      const electiveMap: Record<string, { code: string; title: string }[]> = {};

      const scienceOptionCodes = (majorMatch.scienceElectives?.options ?? [])
        .map((o: any) => o.code as string)
        .filter((code: string) => code && !code.includes("+")); // skip compound "CHEM 122 + CHEM 123" entries

      const mathOptionCodes = (majorMatch.requiredMath?.options ?? [])
        .map((o: any) => o.code as string)
        .filter((code: string) => !!code);

      const techOptionCodes = (majorMatch.technicalElectives?.options ?? [])
        .map((o: any) => o.code as string)
        .filter((code: string) => !!code);

      // Courses with null hours in requiredCourses are elective option pools for that major
      const majorElectiveCodes = allRequiredCourses
        .filter((c: any) => c.hours === null || c.hours === undefined)
        .map((c: any) => c.code as string)
        .filter((code: string) => !!code);

      const byPopularity = (arr: any[]) =>
        arr.sort((a, b) => (b.totalRegsAllTime ?? 0) - (a.totalRegsAllTime ?? 0));

      const [rankedScience, rankedMath, rankedGenEd, rankedTech, rankedMajorOptions,
             rankedGenEdSociety, rankedGenEdPast, rankedGenEdWorldCultures] = await Promise.all([
        scienceOptionCodes.length > 0 ? fetchCoursesByCodesRanked(scienceOptionCodes, true).then(byPopularity).catch(() => []) : Promise.resolve([]),
        mathOptionCodes.length > 0 ? fetchCoursesByCodesRanked(mathOptionCodes, true).then(byPopularity).catch(() => []) : Promise.resolve([]),
        fetchGenEdCourses(null, 60).then(byPopularity).catch(() => []),
        techOptionCodes.length > 0 ? fetchCoursesByCodesRanked(techOptionCodes, true).then(byPopularity).catch(() => []) : Promise.resolve([]),
        majorElectiveCodes.length > 0 ? fetchCoursesByCodesRanked(majorElectiveCodes, true).then(byPopularity).catch(() => []) : Promise.resolve([]),
        fetchGenEdCourses("individual and society", 30).then(byPopularity).catch(() => []),
        fetchGenEdCourses("past", 30).then(byPopularity).catch(() => []),
        fetchGenEdCourses("world cultures", 30).then(byPopularity).catch(() => []),
      ]);

      const fillSlots = (electiveType: string, ranked: typeof rankedScience) => {
        if (ranked.length === 0) return;
        let slotCount = 0;
        for (const sem of majorMatch.sampleSchedule ?? []) {
          for (const c of sem.courses ?? []) {
            if (c.isElective && c.electiveType === electiveType) slotCount++;
          }
        }
        electiveMap[electiveType] = Array.from({ length: slotCount }, (_, i) => {
          const course = ranked[Math.min(i, ranked.length - 1)];
          return { code: `${course.subject} ${course.number}`, title: course.title };
        });
      };

      fillSlots("science_elective", rankedScience);
      fillSlots("required_math", rankedMath);
      fillSlots("gen_ed_any", rankedGenEd);
      // For tech electives: use dedicated list if available, otherwise fall back to major's elective pool
      fillSlots("technical_elective", rankedTech.length > 0 ? rankedTech : rankedMajorOptions);
      // General electives and major-specific elective types use the major's own elective pool
      fillSlots("elective_general", rankedMajorOptions);
      fillSlots("math_elective", rankedMajorOptions);
      // Humanities slots: use gen ed courses as a reasonable pool
      fillSlots("humanities_elective", rankedGenEd);
      // Specific gen ed category slots
      fillSlots("gen_ed_individual_society", rankedGenEdSociety.length > 0 ? rankedGenEdSociety : rankedGenEd);
      fillSlots("gen_ed_past", rankedGenEdPast.length > 0 ? rankedGenEdPast : rankedGenEd);
      fillSlots("gen_ed_world_cultures", rankedGenEdWorldCultures.length > 0 ? rankedGenEdWorldCultures : rankedGenEd);
      // Global Business Perspectives (CBA requirement) — use world cultures gen eds as proxy
      fillSlots("global_biz", rankedGenEdWorldCultures.length > 0 ? rankedGenEdWorldCultures : rankedGenEd);

      const explicitYearWindow = query.rawQuery.toLowerCase().match(
        /\b(1|one|2|two|3|three|4|four)\s*[-–]?\s*year\b/i
      );
      const explicitRemainingPlan =
        query.answerMode === "planning" &&
        progress.yearStanding > 0 &&
        explicitYearWindow &&
        /\b(finish|finishing|remaining|left|from here|from now|already)\b/i.test(query.rawQuery);

      if (explicitRemainingPlan && completedCourses.length === 0) {
        const token = explicitYearWindow[0].toLowerCase();
        const requestedYears =
          /\b(1|one)\b/.test(token) ? 1 :
          /\b(2|two)\b/.test(token) ? 2 :
          /\b(3|three)\b/.test(token) ? 3 : 4;
        const startYear = Math.min(progress.yearStanding + 1, 4);
        const maxYears = Math.min(startYear + requestedYears - 1, 4);
        const deterministicPlan = [
          `=== DETERMINISTIC PLAN ===`,
          `Typical remaining ${requestedYears}-year ${majorMatch.name.replace(/ - (BS|BA|BFA|BMus|MS)$/i, "").trim()} plan at UIC from your current standing:`,
          ``,
          formatSampleSchedule(majorMatch, electiveMap, maxYears, startYear, false),
          `Verify this against catalog.uic.edu — your exact plan depends on completed courses and prerequisites.`,
        ].join("\n");
        return [makeChunk("major_plan", deterministicPlan, 0.99, query)];
      }

      // ── Detect year range the student actually needs ──────────────────────
      // First, detect their current standing (if any)
      let standing = progress.yearStanding; // 0 = not mentioned
      if (standing === 0) {
        if (/\b(i'?m\s+)?(already\s+)?a?\s*(freshman|first.year\s+student|1st.year)\b/i.test(lower)) standing = 1;
        else if (/\b(i'?m\s+)?(already\s+)?a?\s*(sophomore|second.year\s+student|2nd.year)\b/i.test(lower)) standing = 2;
        else if (/\b(i'?m\s+)?(already\s+)?a?\s*(junior|third.year\s+student|3rd.year)\b/i.test(lower)) standing = 3;
        else if (/\b(i'?m\s+)?(already\s+)?a?\s*(senior|fourth.year\s+student|4th.year)\b/i.test(lower)) standing = 4;
      }

      // Detect intent: "rest of my years / remaining / what I have left / from now on"
      const wantsRemaining = /\b(rest|remaining|left|from here|from now|still have|i have left|years? left|finish|finishing|graduate in|already a)\b/i.test(lower);

      // Detect explicit "X-year plan" request
      const yearReqMatch = lower.match(
        /\b(1|one)\s*[-–]?\s*year\b|\b(2|two)\s*[-–]?\s*year\b|\b(3|three)\s*[-–]?\s*year\b|\b(4|four|full)\s*[-–]?\s*year\b/i
      );

      let startYear = 1;
      let maxYears = 4;

      if (yearReqMatch) {
        // Explicit "2-year plan" → show exactly those years
        const m = yearReqMatch[0].toLowerCase();
        if (/\b(1|one)\b/.test(m)) maxYears = 1;
        else if (/\b(2|two)\b/.test(m)) maxYears = 2;
        else if (/\b(3|three)\b/.test(m)) maxYears = 3;
        else maxYears = 4;
        // If they also have a standing and asked for "remaining 2 years", start from their year
        if (standing > 0 && wantsRemaining) {
          startYear = Math.min(standing + 1, 4);
          maxYears = Math.min(startYear + maxYears - 1, 4);
        }
      } else if (standing > 0 && wantsRemaining) {
        // "I'm a sophomore, plan for the rest of my years" → year 3 + 4
        startYear = standing + 1;
        maxYears = 4;
      } else if (standing > 0) {
        // "I'm a sophomore, make me a plan" → start from their current year
        startYear = standing;
        maxYears = 4;
      }

      // Clamp so we never go out of bounds
      if (startYear > 4) startYear = 4;
      if (maxYears < startYear) maxYears = startYear;

      const schedulePlan = formatSampleSchedule(majorMatch, electiveMap, maxYears, startYear, true);
      const schedulePlanWithPlaceholders = formatSampleSchedule(majorMatch, electiveMap, maxYears, startYear, false);
      let majorName = majorMatch.name.replace(/ - (BS|BA|BFA|BMus|MS)$/i, "").trim();
      // When user asked generically for "business" and we matched Management BS as proxy,
      // present it as the CBA Business Administration plan (all 8 CBA majors share this schedule).
      if (majorName === "Management" && /\bbusiness\b/i.test(query.rawQuery) &&
          !/(accounting|finance|marketing|entrepreneurship|human resource|real estate|information and decision|\bids\b)/.test(query.rawQuery.toLowerCase())) {
        majorName = "Business Administration (CBA)";
      }
      if (majorName === "Mechanical Engineering" && /\bengineering\b/i.test(query.rawQuery) &&
          !/(electrical|ece|mechanical|civil|biomedical|bioengineering|computer engineering|environmental engineering|industrial engineering|chemical engineering|engineering physics)/i.test(query.rawQuery)) {
        majorName = "Engineering (using Mechanical Engineering backbone)";
      }
      if (majorName === "Biological Sciences" && /\b(pre-?med|premed)\b/i.test(query.rawQuery)) {
        majorName = "Pre-med / Biological Sciences";
      }

      const yearsShown = maxYears - startYear + 1;
      let yearLabel: string;
      if (startYear === 1 && maxYears === 4) {
        yearLabel = "official"; // full plan, no prefix needed
      } else if (startYear === 1) {
        yearLabel = `first ${yearsShown === 1 ? "year" : `${yearsShown} years`} of the`;
      } else if (maxYears === 4) {
        const standingName = ["", "freshman", "sophomore", "junior", "senior"][startYear] ?? `year ${startYear}`;
        yearLabel = `remaining years (${standingName}+) of the`;
      } else {
        yearLabel = `year ${startYear}–${maxYears} of the`;
      }

      // ── Extract student progress and build planning scaffold ─────────────
      // Claude now receives structured ingredients, not a pre-written plan.
      // Manifest = only truly required courses (those with defined credit hours),
      // not elective option pools (which have hours === null in some schemas).
      const requiredManifest = allRequiredCourses
        .filter((c: any) => c.hours != null)
        .map((c: any) => c.code as string)
        .filter(Boolean);

      const standingLabel = standing > 0
        ? ["", "freshman (Year 1)", "sophomore (Year 2)", "junior (Year 3)", "senior (Year 4)"][standing]
        : "not specified";
      const semestersShown = (startYear === 1 && maxYears === 4)
        ? "all 4 years"
        : `Year ${startYear}–${maxYears} only`;

      const studentCtxLines = [
        `Year standing: ${standingLabel}`,
        `Semesters in backbone below: ${semestersShown}`,
        `Completed courses: ${completedCourses.length > 0 ? completedCourses.join(", ") : "none stated"}`,
        ...(completedCourses.length > 0
          ? ["ACTION: Remove every completed course from your output. If removing a course makes a semester empty, omit that semester header entirely."]
          : []),
      ].join("\n");

      const scaffold = [
        `=== DEGREE PLAN SCAFFOLD: ${majorName} (${majorMatch.totalHours ?? "128"} total credits) ===`,
        `College: ${majorMatch.college ?? "N/A"} | Reference: ${majorMatch.url ?? "catalog.uic.edu"}`,
        ``,
        `REQUIRED COURSE MANIFEST (every code here must appear in your output exactly once, unless it is listed in COMPLETED COURSES):`,
        requiredManifest.length > 0 ? requiredManifest.join(", ") : "See scaffold below.",
        ``,
        `SAMPLE SCHEDULE BACKBONE (follow this semester structure exactly — do NOT rearrange courses between semesters):`,
        `Note: placeholder lines like "*Science Elective*" indicate a slot you must fill with a real course code from ELECTIVE OPTIONS below.`,
        schedulePlan,
        `ELECTIVE OPTIONS (use these to fill placeholder slots — pick 100-499 level codes only):`,
        electiveRules ?? "Any approved 100-499 level UIC course.",
        ``,
        `STUDENT CONTEXT:`,
        studentCtxLines,
        ``,
        `FORBIDDEN — these errors directly harm the student's academic plan:`,
        `1. NO courses numbered 500 or above in an undergraduate plan`,
        `2. NO placeholder lines — replace every "*Science Elective*", "*Gen Ed*", "*Technical Elective*" etc. with a real code from ELECTIVE OPTIONS`,
        `3. NO invented course codes — only use codes present in this scaffold or ELECTIVE OPTIONS`,
        `4. Every code in REQUIRED COURSE MANIFEST must appear in your output exactly once, unless it is in COMPLETED COURSES`,
        `5. Do NOT rearrange courses between semesters — follow SAMPLE SCHEDULE BACKBONE order`,
        `6. Total credit count in your output should match the degree total (${majorMatch.totalHours ?? "128"} credits)`,
        `7. Do NOT use HON / honors-only courses or honors seminars as gen ed fillers unless STUDENT CONTEXT explicitly says honors college`,
      ].join("\n");

      const nextSemesterQuery =
        /\bwhat should\b.*\btake next semester\b/.test(lower) ||
        /\bnext semester\b/.test(lower) && /\b(sophomore|junior|senior|freshman|first.year|second.year|third.year|fourth.year)\b/.test(lower);
      if (nextSemesterQuery && standing > 0 && completedCourses.length === 0) {
        const nextSemesterIsFall = new Date().getMonth() <= 4;
        const targetYear = nextSemesterIsFall ? Math.min(standing + 1, 4) : standing;
        const targetSemester = nextSemesterIsFall ? "First Semester" : "Second Semester";
        const yearName = ["", "Freshman", "Sophomore", "Junior", "Senior"][targetYear];
        const target = (majorMatch.sampleSchedule ?? []).find((sem: any) =>
          sem.year?.includes(yearName) && sem.semester === targetSemester
        );
        if (target) {
          const formatNextTermHours = (hours: number | null | undefined): string =>
            hours != null ? ` (${hours} cr)` : "";
          const nextTermText = [
            `=== DETERMINISTIC NEXT TERM ===`,
            `Typical next-term courses for a **${["", "freshman", "sophomore", "junior", "senior"][standing]}** ${majorName} student:`,
            ``,
            ...(target.courses ?? []).map((course: any) =>
              course.isElective
                ? `- *${ELECTIVE_LABELS[course.electiveType ?? ""] ?? course.title}*${formatNextTermHours(course.hours)}`
                : `- **${course.code}** — ${course.title}${formatNextTermHours(course.hours)}`
            ),
            ``,
            `This is the standard catalog backbone. Your exact next term depends on completed courses and prerequisites.`,
          ].join("\n");
          return [makeChunk("major_plan", nextTermText, 0.99, query)];
        }
      }

      if (query.answerMode === "planning" && completedCourses.length === 0) {
        const deterministicPlan = [
          `=== DETERMINISTIC PLAN ===`,
          `Typical ${majorName} plan at UIC (${majorMatch.totalHours ?? "128"} total credits):`,
          ``,
          schedulePlanWithPlaceholders,
          `Verify this against catalog.uic.edu — requirements change each year.`,
        ].join("\n");
        return [makeChunk("major_plan", deterministicPlan, 0.99, query)];
      }

      return [makeChunk("major_plan", scaffold, 0.97, query)];
    }

    // ── COURSES ONLY — no official semester schedule ──────────────────────────
    const validation = validatePlanData(majorMatch);
    let content = `=== ${majorMatch.name.toUpperCase()} — DEGREE REQUIREMENTS ===\n`;
    content += `Total credits: ${majorMatch.totalHours ?? "see catalog"} | College: ${majorMatch.college ?? "N/A"}\n\n`;
    content += `MANDATORY REQUIRED COURSES:\n${required}\n\n`;

    if (electiveRules) {
      content += `ELECTIVE REQUIREMENTS:\n${electiveRules}\n\n`;
    }

    if (validation.warnings.length > 0) {
      content += `DATA NOTES: ${validation.warnings.join(" | ")}\n`;
    }

    if (planTier === "courses_only") {
      content += `
PLAN TIER: COURSES ONLY — required courses exist but NO official semester schedule is on file.
\u26a0 CRITICAL: No official semester-by-semester sequence exists for this major in the current data.
   You MUST NOT generate, invent, or improvise a semester sequence.

Instead, present requirements in this exact structure:
SECTION 1 — CORE REQUIRED COURSES (list every course with code | title | credits)
SECTION 2 — ELECTIVE REQUIREMENTS (state credit requirement and available courses)
SECTION 3 — PLANNING NOTES (state total credits only)
Do NOT write "Year 1", "Year 2", or any semester-by-semester structure.
Do NOT include 500+ level courses. Do NOT invent prerequisites or sequences.`;
    } else {
      content += `
PLAN TIER: MINIMAL — insufficient course data.
\u26a0 CRITICAL: Course data too limited to construct any plan.
Respond: "Official course data for this major is not yet fully available. Visit catalog.uic.edu for the full requirements."
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
  const lower = query.rawQuery.toLowerCase();
  
  if (lower.includes("fall tuition bill due") || (lower.includes("fall") && /\b(bill due|due date|tuition due|payment due)\b/.test(lower))) {
    chunks.push(makeChunk(
      "tuition",
      `FALL TUITION BILL DUE DATE: ${bill.billing?.fall_due_date}`,
      0.99,
      query
    ));
  }

  if (/\b(payment plan|installment|ui pay|ui-pay|nelnet|pay over time)\b/.test(lower)) {
    chunks.push(makeChunk(
      "tuition",
      `PAYMENT PLAN: ${bill.billing?.payment_plan}. Late fee: ${bill.billing?.late_fee}.`,
      0.99,
      query
    ));
  }

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
      const arcHall = halls.find((h: any) => h.abbreviation === "ARC");
      if (
        arcHall &&
        /\barc\b/.test(lower) &&
        /\b(cheapest|lowest|least expensive|most affordable)\b/.test(lower) &&
        /\b(room|room type|option)\b/.test(lower)
      ) {
        const arcPrices = Object.entries(arcHall.per_semester_approx ?? {})
          .filter(([, value]) => typeof value === "number") as Array<[string, number]>;
        const cheapestArc = arcPrices.sort((a, b) => a[1] - b[1])[0];
        if (cheapestArc) {
          const label = cheapestArc[0]
            .replace(/_/g, " ")
            .replace(/\b\w/g, (char: string) => char.toUpperCase());
          chunks.push(makeChunk(
            "housing",
            `ARC CHEAPEST ROOM TYPE: ${label} — $${cheapestArc[1].toLocaleString()}/semester.`,
            0.99,
            query
          ));
        }
      }

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

      if (/\bmrh\b/.test(lower) && /\btbh\b/.test(lower) && /\b(compare|comparison|vs|versus|difference|better)\b/.test(lower)) {
        const mrh = halls.find((h: any) => h.abbreviation === "MRH");
        const tbh = halls.find((h: any) => h.abbreviation === "TBH");
        if (mrh && tbh) {
          chunks.push(makeChunk(
            "housing",
            [
              "=== DETERMINISTIC FACT ===",
              `**MRH vs TBH**`,
              ``,
              `**Similarities**: both are apartment-style, open to sophomores and above / transfers, have full kitchens, no required meal plan, and basically the same room prices.`,
              `**MRH**: ${mrh.address}. Better if you want a more apartment-like feel and gender-inclusive apartments.`,
              `**TBH**: ${tbh.address}. Better if you want extra study/lounge space and the University Village location.`,
              `**Bottom line**: choose **MRH** for a more independent apartment feel, or **TBH** for a quieter, study-focused setup.`,
            ].join("\n"),
            0.99,
            query
          ));
        }
      }

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
  const lower = query.rawQuery.toLowerCase();
  if ((/\b24 ?hours?\b/.test(lower) || /\bopen all night\b/.test(lower)) && /\b(food|eat|dining|restaurant|market|snack)\b/.test(lower)) {
    chunks.push(makeChunk("dining",
      `=== DETERMINISTIC FACT ===\nThe main on-campus food option open **24 hours** is **Market at Halsted** in **Student Center East**. It is listed as **open 24 hours daily** in the current dining data.\nVerify current hours at dining.uic.edu before you go, since dining hours can change by term or break schedule.`,
      0.99,
      query));
  }
  if (/\bstarbucks\b/.test(lower)) {
    chunks.push(makeChunk("dining",
      `STARBUCKS LOCATIONS (from the current dining data): Student Center West (SCW) — 7AM-4PM. Starbucks at ARC — Mon-Thu 7AM-7PM, Fri 7AM-5PM, Sat-Sun 9AM-3PM. I do not see a Starbucks listed inside the engineering building in the current dining data.\nVerify current hours at dining.uic.edu before heading over.`,
      0.98, query));
  }
  if (ci.isAboutDining) {
    const content = `=== DINING LOCATIONS ===\n` +
      `605 Commons (SCE): Full dining hall. Mon-Fri 7:30AM-8PM, Sat-Sun 10AM-8PM.\n` +
      `JST Cafe: Full dining. Similar hours.\n` +
      `SCE: Chick-fil-A | Panda Express (10AM-8PM) | Dunkin (6:30AM-10PM) | Market at Halsted (24 HOURS) | Sushi Do | Subway | Halal Shack | Moe's\n` +
      `SCW: Starbucks (7AM-4PM) | Harold's Chicken | Lotus Cafe | Mex Sabor | Wild Blue Sushi\n` +
      `Other: Starbucks ARC (7AM-7PM) | Market at Morgan (8AM-6PM)\n` +
      `24-hour: Market at Halsted | Halal: Halal Shack SCE\n` +
      `Off-campus: Al's Italian Beef (1079 W Taylor) | Mario's Italian Lemonade (1068 W Taylor) | Pompei (1531 W Taylor)\n\n` +
      `These hours are from the current dining data and can change during breaks, summer, or by semester. Verify current hours and open locations at dining.uic.edu.`;
    chunks.push(makeChunk("dining", content, 0.95, query));
  }
  if (ci.isAboutMealPlan) {
    const content = `=== MEAL PLANS 2025-2026 ===\n` +
      `Required for: ARC, CTY, CMN, CMW, CMS, JST | Optional for: MRH, TBH, SSR, PSR\n` +
      `Ignite Unlimited: $2,800/sem — unlimited swipes + $400 Flames Fare + 50 exchanges + 5 guest passes\n` +
      `Ignite 15: $2,060/sem — 15 swipes/week + $50 Flames Fare\n` +
      `Ignite 160: $2,350/sem — 160 swipes + $750 Flames Fare + 30 exchanges\n` +
      `Blaze 160 (commuters): $2,260/sem | Blaze 80: $1,150/sem | Blaze 30: $370/sem\n` +
      `Flames Fare rolls fall->spring->summer. Plan changes: first 10-14 days only.\n\n` +
      `Meal plan pricing and change windows can change by academic year. Verify the current plan sheet at dining.uic.edu before making a decision.`;
    chunks.push(makeChunk("dining", content, 0.95, query));
  }
  return chunks;
}

function retrieveStudentLife(query: QueryAnalysis): RetrievedChunk[] {
  const sl2 = studentLifeExpandedData as any;
  const lower = query.rawQuery.toLowerCase();
  const isAboutGreek = lower.includes("greek") || lower.includes("frat") || lower.includes("soror") || lower.includes("rush");
  const isOrgQuery =
    /\b(club|clubs|org|orgs|organization|organizations|student org|student organization)\b/.test(lower);
  const nicheOrgKeywords = [
    /\bstartup\b/,
    /\bentrepreneur(?:ship)?\b/,
    /\bhuman resources?\b/,
    /\bhr\b/,
    /\bpre-?health\b/,
    /\bpre-?med\b/,
    /\bfinance\b/,
    /\bconsulting\b/,
    /\bresearch\b/,
    /\bvolunteer\b/,
    /\bmarketing\b/,
    /\blaw\b/,
    /\bdesign\b/,
    /\bai\b/,
    /\brobotics\b/,
  ];
  const sparkArtists = sl2.major_events?.spark_festival?.past_artists?.slice(0, 8).join(", ") || "Kid Cudi, Kendrick Lamar, J. Cole, Twenty One Pilots";

  if (/\b(biggest|major|main|best known)\b/.test(lower) && /\bevents?\b/.test(lower)) {
    return [makeChunk("student_life",
      [
        "=== DETERMINISTIC FACT ===",
        "The biggest recurring student events in the current UIC student-life data are:",
        "- Weeks of Welcome at the start of the semester",
        "- Involvement Fair each semester",
        "- Spark Festival, the annual fall concert / welcome-back event",
        "- Homecoming in the fall",
        "- Flames Finish Strong during finals",
        "- Day of Service in April",
      ].join("\n"),
      0.99,
      query)];
  }

  if (
    isOrgQuery &&
    !isAboutGreek &&
    nicheOrgKeywords.some((pattern) => pattern.test(lower))
  ) {
    return [makeChunk(
      "student_life",
      [
        "=== DETERMINISTIC FACT ===",
        `UIC has ${sl2.student_orgs?.total || "470+"} registered student organizations, and the official directory is ${sl2.student_orgs?.directory || "https://connect.uic.edu/"}.`,
        "I do not have a verified org-by-org list in the current dataset, so I can't confidently name a specific startup, HR, or other niche club without risking a bad answer.",
        `Best next step: search UIC Connection with keywords like "${lower.includes("startup") || lower.includes("entrepreneur") ? "startup, entrepreneur, venture" : lower.includes("human resource") || /\bhr\b/.test(lower) ? "human resources, HR" : lower.includes("pre-med") || lower.includes("prehealth") || lower.includes("pre-health") ? "pre-health, pre-med" : "your interest area"}".`,
        `How to join: ${sl2.student_orgs?.how_to_join || "Browse UIC Connection, attend Involvement Fair, or contact orgs directly."}`,
        "If you want, I can still help you narrow the search terms based on your goals.",
      ].join("\n"),
      0.99,
      query
    )];
  }

  if (
    isOrgQuery &&
    !isAboutGreek &&
    !lower.match(/newspaper|publication|student media|the flame|wuic|student radio|student paper|spark.?fest|spark festival|homecoming|weeks of welcome|wow event|involvement fair|major event/)
  ) {
    return [makeChunk(
      "student_life",
      [
        "=== DETERMINISTIC FACT ===",
        `UIC has ${sl2.student_orgs?.total || "470+"} registered student organizations.`,
        `Official directory: ${sl2.student_orgs?.directory || "https://connect.uic.edu/"}`,
        "I do not have a verified club-by-club directory in the current dataset, so for specific org names I trust UIC Connection more than guessing.",
        `How to join: ${sl2.student_orgs?.how_to_join || "Browse UIC Connection, attend Involvement Fair, or contact orgs directly."}`,
        `How to start one: ${sl2.student_orgs?.how_to_start || "Email orgsupport@uic.edu. Need 3+ enrolled students, faculty advisor, constitution."}`,
      ].join("\n"),
      0.96,
      query
    )];
  }

  let c = `=== UIC STUDENT LIFE ===\n${sl2.student_orgs?.total || "470+"} registered student orgs at connect.uic.edu.\n\n`;

  c += `GREEK LIFE (5 councils, 30+ chapters):\n` +
    `IFC: Phi Kappa Psi, Delta Sigma Phi, Pi Kappa Phi, Tau Kappa Epsilon, Lambda Chi Alpha, Sigma Pi + more\n` +
    `CPC: Alpha Phi, Delta Gamma, Phi Sigma Sigma, Sigma Sigma Sigma, Alpha Omicron Pi, Delta Phi Epsilon + more\n` +
    `NPHC (Divine Nine): Alpha Phi Alpha, Kappa Alpha Psi, Omega Psi Phi, Alpha Kappa Alpha, Delta Sigma Theta, Zeta Phi Beta, Sigma Gamma Rho\n` +
    `GPAAC/LGC: Sigma Lambda Beta, Lambda Theta Phi, Sigma Lambda Gamma, Lambda Theta Alpha, Delta Xi Phi, Theta Lambda Beta + more\n` +
    `\n\n`;

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
      `UIC MAJOR EVENTS:\nSpark Festival (Spark Fest) — annual fall music festival, free for students. Past headliners: ${sparkArtists}. Held on campus each fall.\nHomecoming — fall. Includes Homecoming Parade, tailgates, alumni events.\nWeeks of Welcome (WOW) — start of semester orientation events.\nInvolvement Fair — each semester, discover 470+ student orgs.\nFlames Finish Strong — finals week study support events.`,
      0.99, query)];
  }
  c += `STUDENT MEDIA: The Flame (student newspaper) — theflame.uic.edu. Independent student-run publication covering UIC news, campus events, sports, opinion. Free print copies on campus. Also: WUIC student radio.\n\n`;
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
    const normalizeAthleticsText = (value: string) =>
      value
        .toLowerCase()
        .replace(/women's|womens/g, "women")
        .replace(/men's|mens/g, "men")
        .replace(/swimming and diving/g, "swimming diving")
        .replace(/track and field/g, "track field")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const lowerNormalized = normalizeAthleticsText(lower);
    const normalizedQueryWords = lower
      .replace(/[^a-z0-9\s'-]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    const personStopwords = new Set([
      "who", "is", "the", "a", "an", "about", "tell", "me", "of", "at", "uic",
      "flames", "student", "team", "roster", "on", "for", "and", "in"
    ]);
    const meaningfulQueryWords = normalizedQueryWords.filter(
      (word) => word.length >= 3 && !personStopwords.has(word)
    );
    const isPersonQuery = /\bwho is\b|\bwho('s| is)\b|\btell me about\b|\babout\b/.test(lower);

    // ── Person lookup: player or coach name mentioned ──────────────────────
    const allTeams = [...ath.teams.mens, ...ath.teams.womens];
    const allRosters: Record<string, string[]> = ath.current_rosters_2025_2026 ?? {};
    const getTeamGenderLabel = (team: any) => (ath.teams.mens.includes(team) ? "Men's" : "Women's");
    const getBaseSportName = (team: any) =>
      team.sport
        .replace(/^men's\s+/i, "")
        .replace(/^women's\s+/i, "")
        .trim();
    const normalizeRosterKeyPart = (value: string) =>
      value
        .toLowerCase()
        .replace(/women's/g, "womens")
        .replace(/men's/g, "mens")
        .replace(/\s+/g, "_")
        .replace(/[^\w]/g, "");
    const getTeamLabel = (team: any) => `${getTeamGenderLabel(team)} ${getBaseSportName(team)}`;
    const getTeamRosterKey = (team: any) => {
      const genderPrefix = ath.teams.mens.includes(team) ? "mens" : "womens";
      const baseSportKey = normalizeRosterKeyPart(getBaseSportName(team));
      const explicitSportKey = normalizeRosterKeyPart(team.sport);
      const candidates = [
        `${genderPrefix}_${baseSportKey}`,
        explicitSportKey,
        baseSportKey,
      ];
      return candidates.find((key) => Array.isArray(allRosters[key])) ?? candidates[0];
    };
    const getTeamKeywords = (team: any) => {
      const sportNormalized = normalizeAthleticsText(getBaseSportName(team));
      const fullSportNormalized = normalizeAthleticsText(team.sport);
      const keywords = new Set<string>([
        ...sportNormalized.split(" ").filter((word) => word.length >= 3),
        ...fullSportNormalized.split(" ").filter((word) => word.length >= 3),
      ]);
      keywords.add(sportNormalized);
      keywords.add(fullSportNormalized);

      if (sportNormalized.includes("basketball")) keywords.add("basketball");
      if (sportNormalized.includes("soccer")) keywords.add("soccer");
      if (sportNormalized.includes("baseball")) keywords.add("baseball");
      if (sportNormalized.includes("softball")) keywords.add("softball");
      if (sportNormalized.includes("volleyball")) keywords.add("volleyball");
      if (sportNormalized.includes("tennis")) keywords.add("tennis");
      if (sportNormalized.includes("golf")) keywords.add("golf");
      if (sportNormalized.includes("swimming")) {
        keywords.add("swim");
        keywords.add("swimming");
        keywords.add("diving");
        keywords.add("swimming diving");
      }
      if (sportNormalized.includes("cross country")) {
        keywords.add("cross country");
        keywords.add("xc");
      }
      if (sportNormalized.includes("track")) {
        keywords.add("track");
        keywords.add("track field");
      }

      if (ath.teams.mens.includes(team)) {
        keywords.add("men");
        keywords.add("mens");
        keywords.add("male");
        if (sportNormalized.includes("basketball")) keywords.add("mbb");
      } else {
        keywords.add("women");
        keywords.add("womens");
        keywords.add("female");
        if (sportNormalized.includes("basketball")) keywords.add("wbb");
      }

      return [...keywords];
    };
    const teamMatchesQuery = (team: any) => {
      const keywords = getTeamKeywords(team);
      const genericGenderKeywords = new Set(["men", "mens", "male", "women", "womens", "female"]);
      const hasSportMatch = keywords
        .filter((keyword) => !genericGenderKeywords.has(keyword))
        .some((keyword) => lowerNormalized.includes(keyword));
      if (!hasSportMatch) return false;

      const mentionsMen = /\bmen('|’)s\b|\bmens\b|\bmen\b|\bmbb\b/.test(lowerNormalized);
      const mentionsWomen = /\bwomen('|’)s\b|\bwomens\b|\bwomen\b|\bwbb\b/.test(lowerNormalized);
      if (mentionsMen && !ath.teams.mens.includes(team)) return false;
      if (mentionsWomen && ath.teams.mens.includes(team)) return false;
      return true;
    };
    const matchedTeams = allTeams.filter((team: any) => teamMatchesQuery(team));
    const directRosterQuery = /\b(players?|roster|lineup|squad|team members|full team|entire team|who plays|who is on|who's on|list (?:the )?(?:players?|roster|team)|name (?:the )?(?:players?|roster|team)|name all|all the names|all of them|everyone on)\b/.test(lower);
    const allSportsRosterQuery =
      directRosterQuery &&
      /\b(all sports|every sport|all teams|every team|each team|any sport)\b/.test(lower);
    const formatRosterResponse = (teams: any[]) =>
      teams
        .map((team: any) => {
          const label = getTeamLabel(team);
          const roster = allRosters[getTeamRosterKey(team)] as string[] | undefined;
          if (!roster?.length) {
            return `${label}: I have the team info, but I don't have a current player list in the local athletics dataset yet.`;
          }
          return `${label} roster (${roster.length} players):\n${roster.map((name) => `- ${name}`).join("\n")}`;
        })
        .join("\n\n");

    if (allSportsRosterQuery) {
      const teamsWithRosters = allTeams.filter((team: any) => {
        const roster = allRosters[getTeamRosterKey(team)] as string[] | undefined;
        return Boolean(roster?.length);
      });
      if (teamsWithRosters.length > 0) {
        return [makeChunk(
          "athletics",
          `=== DETERMINISTIC FACT ===\n${formatRosterResponse(teamsWithRosters)}`,
          1,
          query
        )];
      }
    }

    if (directRosterQuery) {
      const rosterRelevantTeams = matchedTeams.length > 0
        ? matchedTeams
        : allTeams.filter((team: any) => {
            const roster = allRosters[getTeamRosterKey(team)] as string[] | undefined;
            if (!roster?.length) return false;
            const keywords = getTeamKeywords(team);
            return keywords.some((keyword) => lowerNormalized.includes(keyword));
          });

      if (rosterRelevantTeams.length > 0) {
        return [makeChunk(
          "athletics",
          `=== DETERMINISTIC FACT ===\n${formatRosterResponse(rosterRelevantTeams)}`,
          1,
          query
        )];
      }
    }

    const matchesPersonName = (candidate: string) => {
      const candidateLower = candidate.toLowerCase();
      const candidateWords = candidateLower
        .replace(/[^a-z0-9\s'-]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .filter((word) => word.length >= 3 && !["ii", "iii", "jr", "sr", "iv"].includes(word));

      if (!candidateWords.length || !meaningfulQueryWords.length) return false;
      if (lower.includes(candidateLower)) return true;

      const allQueryWordsCovered = meaningfulQueryWords.every((word) =>
        candidateWords.some((candidateWord) => candidateWord === word || candidateWord.includes(word))
      );

      const allCandidateWordsCovered = candidateWords.every((word) =>
        meaningfulQueryWords.some((queryWord) => queryWord === word || queryWord.includes(word))
      );

      return allQueryWordsCovered || allCandidateWordsCovered;
    };

    // ── Fast-path: exact athlete / coach identity queries ──────────────────
    if (isPersonQuery || meaningfulQueryWords.length >= 2) {
      for (const [rosterKey, players] of Object.entries(allRosters)) {
        if (rosterKey === "note") continue;
        const playerList = players as string[];
        const matchedPlayer = playerList.find((player) => matchesPersonName(player));
        if (!matchedPlayer) continue;

        const teamLabel = rosterKey
          .replace(/_/g, " ")
          .replace(/^mens /, "Men's ")
          .replace(/^womens /, "Women's ");
        const teamInfo = allTeams.find((team: any) =>
          rosterKey.includes(team.sport.toLowerCase().replace(/\s/g, "_")) ||
          team.sport.toLowerCase().includes(rosterKey.replace(/_/g, " "))
        );
        const coachLine = teamInfo?.coach ? ` Head coach: ${teamInfo.coach}.` : "";
        return [makeChunk(
          "athletics",
          `${matchedPlayer} is a player on the 2025-2026 UIC Flames ${teamLabel} roster.${coachLine}`,
          1,
          query
        )];
      }

      for (const team of allTeams) {
        const coachName = team.coach ?? "";
        if (!coachName || !matchesPersonName(coachName)) continue;
        return [makeChunk(
          "athletics",
          `${coachName} is the head coach of UIC Flames ${getTeamLabel(team)}.${team.conference ? ` Conference: ${team.conference}.` : ""}${team.venue ? ` Venue: ${team.venue}.` : ""}${team.notes ? ` ${team.notes}` : ""}`,
          1,
          query
        )];
      }
    }

    // ── Fast-path: specific coach query ───────────────────────────────────
    if (lower.match(/\bcoach\b|\bhead coach\b|\bwho coach/)) {
      const coachSportMatch = matchedTeams[0];
      if (coachSportMatch) {
        return [makeChunk("athletics",
          `${getTeamLabel(coachSportMatch)}: Head Coach ${coachSportMatch.coach}${coachSportMatch.venue ? ` | Venue: ${coachSportMatch.venue}` : ""}${coachSportMatch.notes ? `\n${coachSportMatch.notes}` : ""}`,
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
      const sportTeam = matchedTeams[0];
      const teamName = sportTeam ? getTeamLabel(sportTeam) : "the team";
      const coachName = sportTeam?.coach ?? "the coaching staff";
      return [makeChunk("athletics",
        `UIC WALK-ON / TRYOUT INFO:\n` +
        `To walk on to the UIC ${teamName}: contact Head Coach ${coachName} directly.\n` +
        `Typical process: (1) email the coaching staff expressing interest, (2) request to attend a practice or open tryout, (3) demonstrate skills.\n` +
        `Find coach contact details at UICFlames.com → [sport page] → Coaching Staff.\n` +
        `UIC Athletics main office: Flames Athletics Center (FAC), 901 W Roosevelt Rd.`,
        0.92, query)];
    }

    // Search rosters for the person
    for (const [rosterKey, players] of Object.entries(allRosters)) {
      if (rosterKey === "note") continue;
      const playerList = players as string[];
      const matched = playerList.filter((p: string) => {
        const pLower = p.toLowerCase();
        const pParts = pLower.split(/\s+/).filter(part => part.length >= 3 && !["ii","iii","jr","sr","iv"].includes(part));
        const qParts = lower.split(/\s+/).filter((w: string) => w.length >= 3);
        const anyPartMatch = pParts.some(part => lower.includes(part));
        const reversedMatch = qParts.filter((w: string) => !["who","is","the","are","about","tell","me","a","an"].includes(w))
          .some((w: string) => pLower.includes(w));
        return anyPartMatch || reversedMatch || lower.includes(pLower);
      });
      if (matched.length > 0) {
        // Find the team this roster belongs to
        const teamLabel = rosterKey
          .replace(/_/g, " ")
          .replace(/^mens /, "Men's ")
          .replace(/^womens /, "Women's ");
        const teamInfo = allTeams.find((t: any) =>
          rosterKey.includes(t.sport.toLowerCase().replace(/\s/g, "_")) ||
          t.sport.toLowerCase().includes(rosterKey.replace(/_/g, " "))
        );
        chunks.push(makeChunk("athletics",
          matched.map((name) =>
            `${name} is listed as a player on the 2025-2026 UIC Flames ${teamLabel} roster${teamInfo?.coach ? `. Head coach: ${teamInfo.coach}` : ""}${teamInfo?.notes ? `. ${teamInfo.notes}` : ""}`
          ).join("\n"),
          0.99, query));
      }
    }

    // Search coach names and team notes
    for (const team of allTeams) {
      const coachLower = (team.coach ?? "").toLowerCase();
      const notesLower = (team.notes ?? "").toLowerCase();
      if (lower.includes(coachLower.split(" ").pop() ?? "__") ||
          (isPersonQuery && (notesLower.split(/\s+/).some((w: string) => w.length > 4 && lower.includes(w))))) {
        chunks.push(makeChunk("athletics",
          `${getTeamLabel(team)}: Coach ${team.coach}${team.conference ? ` | Conference: ${team.conference}` : ""}${team.venue ? ` | Venue: ${team.venue}` : ""}${team.notes ? `\n${team.notes}` : ""}`,
          0.99, query));
      }
    }

    // ── Sport-specific query ───────────────────────────────────────────────
    const sportMatch = matchedTeams[0];

    if (sportMatch && chunks.length === 0) {
      const roster = allRosters[getTeamRosterKey(sportMatch)] as string[] | undefined;
      chunks.push(makeChunk("athletics",
        `${getTeamLabel(sportMatch)}: Coach ${sportMatch.coach}${sportMatch.conference ? ` | Conference: ${sportMatch.conference}` : ""}${sportMatch.venue ? ` | Venue: ${sportMatch.venue}` : ""}${sportMatch.notes ? `\n${sportMatch.notes}` : ""}${roster ? `\nRoster: ${roster.join(", ")}` : ""}`,
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
    if (lower.match(/\b(fee|cost|price|per semester|how much)\b/)) {
      chunks.push(makeChunk("transportation",
        `=== DETERMINISTIC FACT ===\nUIC's **U-Pass costs $163 per semester**. It is part of your semester fees for students enrolled in 6+ credit hours and covers unlimited CTA rides during the semester.`,
        0.99,
        query));
    }
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
      `CTA TO UIC:\n${trains}\n\nKEY BUSES:\n${buses}${airportDirections}\n\nRoute details and service patterns can change. For current arrivals, reroutes, and delays, verify with Ventra or transitchicago.com.`,
      0.97, query));
  }
  if (lower.match(/shuttle|night ride|intracampus/)) {
    const s = b.transportation.shuttles;
    chunks.push(makeChunk("transportation",
      `SHUTTLES:\nIntracampus (east↔west): ${s.intracampus_route.hours}\nNight Ride: ${s.night_ride.hours} — ${s.night_ride.description} — Use UIC Ride app. Coverage: ${s.night_ride.coverage}\n\nShuttle and Night Ride hours can change, especially around breaks or special schedules. Verify the current schedule at transportation.uic.edu or in the UIC Ride app.`,
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
  const isGradeAppealQuery = /\bappeal\b/.test(lower) && /\bgrade\b/.test(lower);
  const isCreditOverloadQuery = /\b(overload|credit limit|too many credits|max credits|maximum credits)\b/.test(lower) ||
    (/\b21 credits\b/.test(lower));
  const isRegistrationWaitlistQuery = /\bwaitlist\b/.test(lower) && !/\badmission|admissions|transfer|application\b/.test(lower);
  const isWithdrawalLimitQuery = /\bhow many withdrawals\b/.test(lower) || /\bwithdrawal limit\b/.test(lower) || /\bmax .*withdrawals?\b/.test(lower);
  const isGradeReplacementQuery = /\brepeat a class\b/.test(lower) || ((/\brepeat\b/.test(lower) || /\bretake\b/.test(lower)) && /\b(d|f)\b/.test(lower));

  if (isRegistrationWaitlistQuery) {
    return [makeChunk("calendar",
      `=== DETERMINISTIC FACT ===\nUIC course waitlists are available for select classes only. If a seat opens, you get **24 hours** to claim it from the email notification. If you miss that window, you go back to the bottom of the waitlist.`,
      0.99,
      query)];
  }

  if (isWithdrawalLimitQuery) {
    return [makeChunk("academic_policy",
      `=== DETERMINISTIC FACT ===\nUIC allows a maximum of **4 individual course withdrawals (W notations)** during your entire degree program.`,
      0.99,
      query)];
  }

  if (isGradeReplacementQuery) {
    return [makeChunk("academic_policy",
      `=== DETERMINISTIC FACT ===\nYes. Under UIC's grade replacement policy, courses with a **D or F may be repeated once without permission**. Courses with an A or B may not be repeated, and all attempts stay on the transcript.`,
      0.99,
      query)];
  }

  if (isGradeAppealQuery) {
    return [makeChunk("academic_policy",
      `GRADE APPEAL GUIDANCE: I do not have a campus-wide deadline for grade appeals in the current dataset. UIC does list policies for incomplete grades, grade replacement, and withdrawal limits, but grade appeals are typically handled through the instructor, department, and your college office. If the grade is from 3 years ago, you should contact your college advising/dean's office as soon as possible because late appeals are usually harder to pursue.`,
      0.9, query)];
  }

  if (isCreditOverloadQuery) {
    return [makeChunk("academic_policy",
      `CREDIT OVERLOAD GUIDANCE: UIC's academic policy data does not list a single campus-wide maximum credit load in my current dataset. Overload approval is handled through your college advising office, and students who want to go above the usual semester limit typically need permission from their college.`,
      0.93, query)];
  }

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

  c += `\n\nCalendar dates and registration deadlines can change by term. Verify the current academic calendar at registrar.uic.edu/calendars before acting on a deadline.`;

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
  const readmissionProcess = adm.readmission?.process ?? "See UIC readmission instructions";
  const readmissionDeadline = adm.readmission?.deadline ?? "See admissions.uic.edu for current readmission deadlines";

  // ── Fast-path: English proficiency / Duolingo queries ─────────────────────
  const chunks: RetrievedChunk[] = [];
  if (
    /\btransfer\b/.test(lower) &&
    /\b(common app|common application|apply|application|platform|web application|portal)\b/.test(lower)
  ) {
    return [makeChunk("admissions",
      `UIC admissions data clearly says **first-year applicants use the Common Application**. For **transfer applicants**, the current transfer section in my data lists the deadline, credit minimum, and GPA guidance, but it does **not explicitly name the application platform**. Separate from transfer, **readmission** is listed as: ${readmissionProcess}.\nVerify the current transfer application process at admissions.uic.edu or with the Office of Admissions before you apply.`,
      0.99,
      query)];
  }

  if (/\btransfer\b/.test(lower) && /\bdeadline|deadlines|when due|due date|last day\b/.test(lower)) {
    return [makeChunk("admissions",
      `UIC's current transfer data lists a **fall transfer deadline of ${tr.regular_deadline}**. The **spring transfer deadline is not clearly labeled in the current transfer dataset**, so I don't want to guess. Separate from transfer, the current **readmission** deadline is listed as ${readmissionDeadline}.\nVerify the current transfer deadline at admissions.uic.edu before you apply.`,
      0.99,
      query)];
  }

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
    `First-Year application platform: ${fy.application_platform} | Test policy: ${fy.test_policy} | ${fy.no_enrollment_deposit}\n` +
    `First-Year deadlines: Priority ${fy.deadlines.priority} | Regular ${fy.deadlines.regular} | Spring ${fy.deadlines.spring}\n` +
    `Transfer: Fall ${tr.regular_deadline} | Spring deadline not clearly listed in the current transfer data | Min ${tr.minimum_credits} | GPA: ${tr.minimum_gpa}\n` +
    `Guaranteed Transfer: ${tr.community_college_pathway}\n\n` +
    `READMISSION:\n` +
    `${readmissionProcess}\n` +
    `Deadlines: ${readmissionDeadline}\n\n` +
    `SCHOLARSHIPS:\n` +
    `Aspire Grant: ${sc.aspire_grant.amount}. Deadline ${sc.aspire_grant.deadline}\n` +
    `Chancellor's Fellows: ${sc.chancellors_fellows.amount}. Deadline ${sc.chancellors_fellows.deadline}\n` +
    `President's Award: ${sc.presidents_award.amount}. Deadline ${sc.presidents_award.deadline}\n` +
    `Merit Tuition Award: ${sc.merit_tuition_award.amount}\n\n` +
    `AFTER ADMISSION: Activate NetID | Placement tests by June 30 | Apply housing (housing.uic.edu) | File FAFSA | Register orientation\n` +
    `Visits: ${adm.campus_visits.url} | Admitted hub: ${adm.campus_visits.admitted_students}\n\n` +
      `UIC COLLEGES & SCHOOLS: Liberal Arts and Sciences (LAS) | Engineering | Business Administration | Architecture Design and the Arts (CADA) | Education | Applied Health Sciences | Nursing | Public Health | Pharmacy | Medicine | Dentistry | Social Work | Urban Planning and Public Affairs | School of Law (formerly John Marshall Law School) | Honors College\n\n` +
      `Admissions platforms, deadlines, and scholarship details can change by cycle. Verify the current version at admissions.uic.edu and financialaid.uic.edu before you apply.`;

  return [makeChunk("admissions", content, 0.97, query)];
}

function retrieveCareers(query: QueryAnalysis): RetrievedChunk[] {
  const content = `=== CAREER SERVICES ===\n` +
    `SSB Suite 3050 | 312-996-2300 | Mon-Fri 8:30AM-5PM\n` +
    `Drop-in: Wed in-person 12-2PM | Thu virtual 2-4PM | Jobs/internships: uic.joinhandshake.com\n` +
    `Services: Resume/CV, cover letters, mock interviews, salary negotiation\n\n` +
    `CAREER FAIRS: Fall Internship & Career | Winter Internship | Spring Internship & Career | Post-Graduation | Grad/Professional School\n\n` +
    `CAMPUS JOBS: $16-$21.51/hr (FY2026). F-1: up to 20hr/week on-campus (no authorization needed).\n` +
    `Graduate assistantships: 25-67% appointment = tuition waiver. Contact your dept DGS.\n\n` +
    `Drop-in hours, career fair timing, and campus job pay ranges can shift. Verify the current schedule in Handshake or with Career Services.`;
  return [makeChunk("careers", content, 0.9, query)];
}

function retrieveLibrary(query: QueryAnalysis): RetrievedChunk[] {
  const lib = libraryData as any;
  // libraries is an array — find by name/abbreviation
  const libraries: any[] = Array.isArray(lib.libraries) ? lib.libraries : Object.values(lib.libraries ?? {});
  const daley = libraries.find((l: any) => l.abbreviation === "Daley" || l.name?.includes("Daley")) ?? {};
  const lhs = libraries.find((l: any) => l.abbreviation?.includes("LHS") || l.name?.includes("Health Sciences")) ?? {};
  const borrowing = lib.borrowing ?? lib.borrowing_policies ?? {};

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
    `Research help: ask.library.uic.edu | Guides: researchguides.uic.edu\n\n` +
    `Library hours change during finals, breaks, and summer. Verify current hours at library.uic.edu/hours before you go.`;
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

function retrieveRecreation(query: QueryAnalysis): RetrievedChunk[] {
  const content = `=== CAMPUS RECREATION ===\n` +
    `SRF (east, 737 S Halsted): Mon-Thu 6AM-11PM, Fri 6AM-9PM, Sat-Sun 9AM-9PM\n` +
    `SFC (west, 828 S Wolcott): Same hours | FREE for fee-paying students\n` +
    `Facilities: 18,000 sq ft gym, pool, sauna, steam, track, racquetball, climbing wall\n` +
    `INTRAMURALS (free): Basketball, Soccer, Volleyball, Flag Football, Pickleball, Dodgeball — IMLeagues.com\n` +
    `SPORT CLUBS: Boxing, Cricket, Fencing, Rugby, Taekwondo, Ultimate Frisbee + more\n` +
    `FITNESS CLASSES: Yoga, Zumba, HIIT, Spin, Boxing, Pilates, Bollywood, F45\n\n` +
    `Rec center hours and class schedules can change during breaks and by semester. Verify the current schedule with Campus Recreation or IMLeagues.`;
  return [makeChunk("recreation", content, 0.9, query)];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 5: CONTEXT ASSEMBLY — relevance-scored deduplication + token budget
// ═══════════════════════════════════════════════════════════════════════════════

function assembleContext(
  chunks: RetrievedChunk[],
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
  memoryContext: string,
  context: string,
  isFact: boolean,
  answerPack?: AnswerPack,
  trustInstruction?: string,
  isFinancialQuery = false,
  smartFollowUpInstruction?: string
): string {
  const answerMode: AnswerMode = answerPack?.answerMode ?? "discovery";
  const isMajorRequirementsAnswer =
    answerMode !== "planning" &&
    (answerPack?.rankedEvidence.some((e) => e.source === "major_plan") ?? false);

  const modeInstructions: Record<AnswerMode, string> = {
    ranking: "RANKING: Lead with the top options. Use real GPA numbers, scores, prices to justify rankings. Name a clear winner. Don't hedge — students want a decisive answer. If the question is about professors or classes, keep the answer useful for grades but add one short line acknowledging fit, teaching style, or learning value when the evidence supports it.",
    discovery: "DISCOVERY: If this is a simple or casual question, answer briefly and directly. Only give a rich overview if the student is genuinely exploring a broad topic.",
    comparison: "COMPARISON: Structure as clear A vs B with parallel criteria. Acknowledge the real tradeoffs. End with a concrete recommendation tailored to the implied student profile.",
    recommendation: "RECOMMENDATION: You detected specific constraints about this student. Use them. Give a direct, personalized answer — not 'it depends,' but 'given that you care about X and Y, here is what I recommend and why.' If the student is choosing professors or classes, mention the strongest option for grades and briefly note any tradeoff in workload, teaching style, or learning fit.",
    logistics: "LOGISTICS: Be precise. Lead with exact addresses, phone numbers, deadlines, URLs, hours. Zero editorializing. Students need to act — give them exactly what they need.",
planning: `PLANNING: The retrieved data contains a PLANNING OBJECT — a pre-validated JSON structure. Your ONLY job is to render it as a readable semester-by-semester plan for the student. NEVER use your training knowledge about course sequences.

READING THE PLANNING OBJECT:
- "semester_plan" is the authoritative sequence — render each term in order, never rearrange
- "student_context.completed_courses" are already excluded from semester_plan — do not re-add them
- "student_context.in_progress_courses" are courses the student is taking now — acknowledge them but do not re-schedule them
- "requirements.required_courses" lists every code that must appear — verify your output covers them all
- "plan_strategy" explains the sequencing logic — use it to inform your framing

STRICT OUTPUT RULES:
(1) Render every term in "semester_plan" as a section header (e.g. ### Year 1 Fall) with its courses bulleted below.
(2) Use bold for course codes: **CS 111**
(3) Include the reasoning sentence from each term as a brief italic note under the term header.
(4) NEVER invent a course code not present in the PlanningObject — if a slot has no code, omit the slot entirely.
(5) NEVER include any course numbered 500 or above.
(6) If "plan_strategy" contains "Major not found", DO NOT generate any plan — tell the student their major was not found and direct them to catalog.uic.edu.
(7) After the plan, add exactly one line: "Verify this against catalog.uic.edu — requirements change each year."
(8) Honor "student_context.constraints" — if the student has accelerated graduation, honors, or double-major constraints, add a brief note addressing them.
(9) If "student_context.constraints" does NOT explicitly mention honors college or honors student, do not suggest HON courses, honors seminars, or honors-only gen ed substitutions.`,
    hybrid: "HYBRID: This is a multi-part question. Break it into organized sections. Answer each well. Synthesize with a crisp bottom line that ties it together.",
  };

  const groundingInstruction = isFact
    ? `GROUNDING RULE — FACT LOOKUP: The retrieved data below contains the exact answer. Copy addresses, phone numbers, suite numbers, hours, and deadlines VERBATIM — do not paraphrase or approximate them. A wrong suite number or phone number is worse than no answer. If the fact is present, quote it exactly. Keep your answer to 1–3 sentences unless the student asked for more.`
    : `GROUNDING RULE: Synthesize the retrieved data into a clear, specific answer. Reason about it — don't just repeat it. Be specific: cite exact numbers, names, and dates from the data.`;

  const financialRule = isFinancialQuery
    ? `\nFINANCIAL VERIFICATION RULE: Before writing any dollar amount, verify it appears exactly in the retrieved data. If the exact figure is not present, say "approximately" and refer the student to bursar.uic.edu for the authoritative number.\n`
    : "";

  const majorRequirementsRule = isMajorRequirementsAnswer
    ? `\nDEGREE DATA RULE: If the retrieved data includes degree requirements or a degree-plan backbone, use only course codes/titles explicitly present there. Do not rename courses, add easiness commentary unless the student asked for rankings, duplicate a course, or substitute missing requirements from memory. If the data only supports a typical sequence, say "typical" rather than presenting it as guaranteed.\n`
    : "";

  const corePrinciples = `CORE PRINCIPLES:
- Never hallucinate — if a fact isn't in the retrieved data, say so and point to the right UIC page
- Be specific: cite exact GPA numbers, dollar amounts, addresses, phone numbers, and dates from the data
- Use **bold** for course codes, professor names, and critical numbers
- Match response length to the question: simple fact = 1-3 sentences, planning/comparison = detailed with structure
- DEFAULT TO NATURAL PROSE: if the answer is simple, conversational, or can be said clearly in 1-3 sentences, do not use bullets
- USE BULLETS ONLY WHEN THEY HELP: use bullet points or short sections only for rankings, comparisons, step-by-step guidance, multiple options, or grouped facts that are genuinely easier to scan as a list
- NEVER OVERDO FORMATTING: do not turn normal answers into outlines, and do not stack headings + bullets + labels unless the question truly needs that structure
- KEEP LISTS SHORT: when you do use bullets, keep them tight and high-signal rather than long or repetitive
- STOP WHEN THE QUESTION IS ANSWERED: for direct asks like "who is", "give me some players", "what is", "where is", or "when is", answer the asked thing first and do not tack on extra trivia, history, ticket info, or side notes unless the user asked for that broader context
- Zero filler phrases — students want answers, not preamble
- Read between the lines: if a student seems stressed or implicitly needs an easier path, address that directly
- GRADE-SHOPPING TONE RULE: It is fine to use GPA, A-rate, and easiness data when the student asks for the easiest option or best shot at an A. But do not sound cynical or one-note. When recommending a professor or course, avoid framing it like "easy A at all costs." Give the strongest grades-based answer, then add one brief reality check about fit, teaching quality, workload, or what the course is actually good for.
- ATHLETICS PERSON RULE: never call someone a coach unless the retrieved data explicitly says they are a coach. If a name appears on a roster, describe them as a player or roster member, and mention the coach separately if helpful.
- If memory shows the student's major/year, tailor the answer to their situation`;

  const trustLine = trustInstruction ? `\n${trustInstruction}\n` : "";

  return `You are Sparky — a smart, friendly UIC assistant. You can have normal conversations AND answer deep questions about UIC with real data. Read the room: casual messages get casual replies, serious questions get detailed answers.

EASINESS SCORE: Every UIC course has an easiness score from 1 (hardest) to 5 (easiest). This is YOUR primary metric when any student asks about easy, hard, or difficulty of courses. Always sort and rank by easiness score first. Always mention the score in your answer. Never substitute GPA alone as a difficulty proxy — GPA is secondary context.

YEAR STANDING AWARENESS: When a student says "I'm a sophomore / junior / senior" or mentions their year (freshman=1, sophomore=2, junior=3, senior=4), understand what they need:
- "I'm a sophomore, make me a plan" → start the plan from their current year (year 2 onward)
- "I'm a junior, what do I have left?" → show only the remaining year(s) (year 3–4)
- "I'm a sophomore, plan for the rest of my years" → show years 3 and 4 only (what's after their current year)
- "give me a 2-year plan" → show only 2 years worth of semesters
Always read the context and show only what the student actually needs. Never dump a full 4-year plan when they asked for less.

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
- Library services, career services

${groundingInstruction}

REASONING INSTRUCTION — ${answerMode.toUpperCase()}:
${modeInstructions[answerMode]}

${corePrinciples}
${financialRule}${majorRequirementsRule}${trustLine}
${smartFollowUpInstruction ? `\n${smartFollowUpInstruction}\n` : ""}
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
  let uploadedFile: UploadedFile | null = null;
  let requestedConversationId: string | null = null;
  try {
    const body = await req.json();
    messages = body.messages;
    uploadedFile = body.file ?? null;
    requestedConversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : null;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }
    lastMsg = messages[messages.length - 1]?.content?.trim() ?? "";
    if (!lastMsg && !uploadedFile) return NextResponse.json({ error: "Empty message" }, { status: 400 });
    if (!lastMsg) lastMsg = uploadedFile ? `Attached file: ${uploadedFile.name}` : "";
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const authSession = await getCurrentSession().catch(() => null);
  let preferredSessionId: string | null = null;

  if (authSession?.user?.id && requestedConversationId) {
    const ownedConversation = await prisma.chatConversation.findFirst({
      where: {
        id: requestedConversationId,
        userId: authSession.user.id,
      },
      select: { id: true },
    });
    if (ownedConversation) {
      preferredSessionId = ownedConversation.id;
    }
  }

  await capturePostHogEvent({
    distinctId: authSession?.user?.id ?? "anonymous",
    event: "chat_api_request",
    properties: {
      message_count: messages.length,
      last_message_length: lastMsg.length,
      authenticated: Boolean(authSession?.user?.id),
      conversation_id: preferredSessionId,
    },
  });

// ── Session & query analysis ──────────────────────────────────────────────
// ── Casual message fast path ──────────────────────────────────────────────
  const { sessionId, isNew } = resolveSession(req, preferredSessionId);
  const normalizedLastMsg = normalizeQuery(lastMsg);
  const requestMessagesJson = JSON.stringify(
    messages.map((message, index) => ({
      index,
      role: message.role,
      content: message.content,
    }))
  );
  const baseChatLogMetadata = {
    authenticated: Boolean(authSession?.user?.id),
    messageCount: messages.length,
    userMessageCount: messages.filter((message) => message.role === "user").length,
    assistantMessageCount: messages.filter((message) => message.role === "assistant").length,
    lastMessageLength: lastMsg.length,
    normalizedMessageLength: normalizedLastMsg.length,
    promptWordCount: lastMsg.split(/\s+/).filter(Boolean).length,
    questionMarkCount: (lastMsg.match(/\?/g) ?? []).length,
    hasAttachment: Boolean(uploadedFile),
    attachmentName: uploadedFile?.name ?? null,
    attachmentType: uploadedFile?.fileType ?? null,
    hasUrl: /https?:\/\//i.test(lastMsg),
    hasCourseCode: /\b[A-Z]{2,4}\s?\d{3}[A-Z]?\b/i.test(lastMsg),
    requestedConversationId,
    preferredConversationId: preferredSessionId,
  };
  let chatLogSaved = false;
  const persistChatLog = async ({
    responseText,
    responseKind,
    responseStatus = "success",
    answerMode = null,
    domainsTriggered,
    retrievalSources,
    topChunkScore,
    chunkCount,
    abstained = false,
    abstainReason = null,
    responseMs,
    extraMetadata,
  }: PersistChatLogInput) => {
    if (chatLogSaved) return;
    chatLogSaved = true;

    await prisma.queryLog.create({
      data: {
        id: `ql_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sessionId,
        userId: authSession?.user?.id ?? null,
        conversationId: preferredSessionId ?? requestedConversationId ?? sessionId,
        query: lastMsg,
        normalizedQuery: normalizedLastMsg,
        requestMessages: requestMessagesJson,
        responseText,
        responseKind,
        responseStatus,
        attachedFileName: uploadedFile?.name ?? null,
        attachedFileType: uploadedFile?.fileType ?? null,
        metadataJson: JSON.stringify({
          ...baseChatLogMetadata,
          ...(extraMetadata ?? {}),
        }),
        answerMode,
        domainsTriggered: domainsTriggered ? JSON.stringify(domainsTriggered) : null,
        retrievalSources: retrievalSources ? JSON.stringify(retrievalSources) : null,
        topChunkScore: topChunkScore ?? null,
        chunkCount: chunkCount ?? null,
        abstained,
        abstainReason,
        responseMs: responseMs ?? Date.now() - requestStartMs,
      },
    }).catch((error) => {
      chatLogSaved = false;
      console.error("Failed to persist Sparky query log:", error);
    });
  };
  // Normalize before casual check: collapse 3+ repeated chars to 2 (helooo→heloo, heyyyy→heyy)
  // and strip punctuation/emoji noise so "hey!!!" and "heyyy 😂" both match.
  const makeFastTextResponse = async (
    text: string,
    responseKind: string,
    matchedPath: string,
    responseStatus?: "success" | "abstained" | "error",
    abstainReason?: string | null,
    extraHeaders?: Record<string, string>
  ) => {
    await persistChatLog({
      responseText: text,
      responseKind,
      responseStatus,
      answerMode: "discovery",
      abstained: responseStatus === "abstained",
      abstainReason: abstainReason ?? null,
      extraMetadata: {
        matchedPath,
      },
    });
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    });
    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...(extraHeaders ?? {}),
    };
    if (isNew) {
      headers["Set-Cookie"] = `sparky_session=${sessionId}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    }
    return new Response(readable, { headers });
  };

  const normMsg = normalizedLastMsg.replace(/\byiu\b/g, "you").replace(/[\s!?.]+$/, "");
  const casualPatterns = /^(h+e+y+|h+i+|hel+o+|helo+|hullo|howdy|sup+|s+u+p|yo+|yoo+|wh?[ao]+t'?s+ ?up+|wh?[ao]+t'?s+ ?good|wassup|wazzup|wsg|how are (you|u|ya)|how r u|how'?s? it go+ing|thanks+|thank you|thnks?|thx+|o+k+a*y*|coo+l|nice|great|lo+l|haha+|lmao+|bruh|bro|k+|gotcha|got it|makes sense|sounds good|perfect|awesome|sure|np|no problem|good|good morning|good afternoon|good evening|morning|night|bye+|goodbye|see ya|later|wyd|wbu|idk)$/i;

  if (casualPatterns.test(normMsg)) {
    const casualResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      system: buildCasualReplySystemPrompt(normMsg),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const casualText = (casualResponse.content[0] as any)?.text ?? "Hey!";
    await persistChatLog({
      responseText: casualText,
      responseKind: "casual_fast_path",
      answerMode: "discovery",
      extraMetadata: {
        matchedPath: "casual_fast_path",
      },
    });
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

  const arithmeticAnswer = getSimpleArithmeticAnswer(lastMsg);
  if (arithmeticAnswer) {
    return makeFastTextResponse(
      arithmeticAnswer,
      "direct_rule_response",
      "simple_arithmetic_fast_path"
    );
  }

  const fastPathLower = normalizedLastMsg.toLowerCase();
  if (/\b(who|where|how)\b.{0,25}\b(help|talk|contact|reach)\b.{0,25}\badmissions?\b/.test(fastPathLower) || /\badmissions?\b.{0,25}\b(help|office|contact|counselor|counsellor)\b/.test(fastPathLower)) {
    return makeFastTextResponse(
      "For admissions help, contact UIC Admissions: admissions.uic.edu | 312-996-4350. The Admissions office is in Suite 1100, 1200 W Harrison St, and the Visitors Center is at 1220 W Harrison St.",
      "direct_rule_response",
      "admissions_help_fast_path"
    );
  }

  if (/\b(full fafsa|full financial aid|full.?time (financial aid|fafsa|aid)|credit hours?.{0,20}(fafsa|financial aid|aid)|how many.{0,20}(credits?|credit hours?).{0,20}(fafsa|financial aid|aid))\b/.test(fastPathLower)) {
    return makeFastTextResponse(
      "For most UIC undergrads, 12+ credit hours is the usual full-time load. Financial aid can still vary by award and student situation, so confirm your exact aid status with the Office of Student Financial Aid: SSB Suite 1800 | 312-996-3126 | financialaid.uic.edu.",
      "direct_rule_response",
      "financial_aid_credit_hours_fast_path"
    );
  }

  if (isHarmlessCodingQuestion(lastMsg)) {
    const codingResponse = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 220,
      system: "You are Sparky, primarily a UIC assistant. The student asked a harmless off-topic programming question. Answer briefly and directly. Start with exactly: \"I'm mainly here for UIC questions, but briefly:\". Keep the full response under 6 sentences. If code helps, include one small code block no longer than 10 lines. Do not mention UIC again after the opening unless necessary.",
      messages: [{ role: "user", content: lastMsg }],
    });
    const codingText = (codingResponse.content[0] as any)?.text ?? "I'm mainly here for UIC questions, but briefly: I can help with simple coding questions too.";
    return makeFastTextResponse(
      codingText,
      "off_topic_coding_fast_path",
      "off_topic_coding_fast_path"
    );
  }

  if (isProductQuestion(lastMsg.toLowerCase())) {
    const aboutText = getProductAnswer(lastMsg.toLowerCase());
    return makeFastTextResponse(aboutText, "product_fast_path", "product_fast_path");
  }

  if (isFlamesSongRequest(lastMsg)) {
    const encoder = new TextEncoder();
    const flamesText = "Playing it now.";
    await persistChatLog({
      responseText: flamesText,
      responseKind: "flames_song_fast_path",
      answerMode: "discovery",
      extraMetadata: {
        matchedPath: "flames_song_fast_path",
      },
    });
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(flamesText));
        controller.close();
      },
    });
    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Play-Flames-Song": "true",
    };
    if (isNew) {
      headers["Set-Cookie"] = `sparky_session=${sessionId}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    }
    return new Response(readable, { headers });
  }

  // Normalize the message for the regex pipeline (fixes typos/abbreviations).
  // Claude sees the original lastMsg — it handles imperfect text natively.
  const normalizedMsg = normalizedLastMsg;
  const query = analyzeQuery(normalizedMsg, messages.slice(0, -1));
  const normalizedLower = normalizedMsg.toLowerCase();

  const makePlainTextResponse = async (
    text: string,
    extraHeaders?: Record<string, string>,
    logOptions?: Partial<PersistChatLogInput>
  ) => {
    await persistChatLog({
      responseText: text,
      responseKind: logOptions?.responseKind ?? "direct_rule_response",
      responseStatus: logOptions?.responseStatus,
      answerMode: logOptions?.answerMode ?? query.answerMode,
      extraMetadata: logOptions?.extraMetadata,
    });
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    });
    const headers: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...(extraHeaders ?? {}),
    };
    if (isNew) {
      headers["Set-Cookie"] = `sparky_session=${sessionId}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    }
    return new Response(readable, { headers });
  };

  if (/\bu.?pass\b/.test(normalizedLower) && /\b(fee|cost|price|how much|per semester)\b/.test(normalizedLower)) {
    return makePlainTextResponse(
      "UIC's U-Pass costs $163 per semester. It is part of your semester fees for students enrolled in 6+ credit hours and covers unlimited CTA rides during the semester.",
      undefined,
      {
        responseKind: "direct_rule_response",
        extraMetadata: {
          matchedPath: "u_pass_fee_rule",
        },
      }
    );
  }

  if (/\bmrh\b/.test(normalizedLower) && /\btbh\b/.test(normalizedLower) && /\b(compare|comparison|vs|versus|difference|better)\b/.test(normalizedLower)) {
    const halls = (housingDiningData as any).housing?.residence_halls ?? [];
    const mrh = halls.find((h: any) => h.abbreviation === "MRH");
    const tbh = halls.find((h: any) => h.abbreviation === "TBH");
    if (mrh && tbh) {
      return makePlainTextResponse(
        [
          "**MRH vs TBH**",
          "",
          "**Similarities**: both are apartment-style, open to sophomores and above / transfers, have full kitchens, no required meal plan, and basically the same room prices.",
          `**MRH**: ${mrh.address}. Better if you want a more apartment-like feel and gender-inclusive apartments.`,
          `**TBH**: ${tbh.address}. Better if you want extra study/lounge space and the University Village location.`,
          "**Bottom line**: choose MRH for a more independent apartment feel, or TBH for a quieter, study-focused setup.",
        ].join("\n"),
        undefined,
        {
          responseKind: "direct_rule_response",
          extraMetadata: {
            matchedPath: "housing_compare_rule",
          },
        }
      );
    }
  }

  if ((/\b24 ?hours?\b/.test(normalizedLower) || /\bopen all night\b/.test(normalizedLower)) && /\b(food|eat|dining|restaurant|market|snack)\b/.test(normalizedLower)) {
    return makePlainTextResponse(
      "The main on-campus food option open 24 hours is Market at Halsted in Student Center East. It is listed as open 24 hours daily in the current dining data.",
      undefined,
      {
        responseKind: "direct_rule_response",
        extraMetadata: {
          matchedPath: "dining_24h_rule",
        },
      }
    );
  }

// ── Fetch memory + session in parallel, then classify ─────────────────────
const [userMemory, sessionState, authenticatedStudyUser] = await Promise.all([
  getMemory(sessionId).catch(() => null),
  getSessionState(sessionId).catch((): import("@/lib/chat/session-state").SessionState => ({
    activeCourseId: null, activeCourseCode: null,
    activeProfessorId: null, activeProfessorName: null,
    activeHall: null,
    activeDomain: null, lastAnswerType: null, lastTopics: [],
    confirmedMajor: null, confirmedYear: null,
    lastResponseExcerpt: null, lastRetrievedDomain: null,
    mentionedCourses: [],
  })),
  getCurrentStudyUser().catch(() => null),
]);

const numericYearToLabel: Record<number, string> = {
  1: "freshman",
  2: "sophomore",
  3: "junior",
  4: "senior",
};

if (authenticatedStudyUser) {
  // Parse the user's saved plannerProfile (completedCourses, majorSlug, etc.)
  const userPlannerPrefs = parseStoredPreferences(authenticatedStudyUser.studyPreferences);
  const profileCompletedCourses: string[] = userPlannerPrefs.plannerProfile.completedCourses ?? [];
  const profileCurrentCourses: string[] = authenticatedStudyUser.currentCourses ?? [];

  // Profile data is the authoritative source (explicit user input).
  // Always override stale memory with the profile values so Sparky stays in sync
  // with what the user saved on their profile page.
  if (userMemory && authenticatedStudyUser.major) {
    userMemory.major = authenticatedStudyUser.major;
  }
  if (userMemory && authenticatedStudyUser.interests.length) {
    userMemory.interests = authenticatedStudyUser.interests;
  }
  // Always sync current courses from profile into memory
  if (userMemory && profileCurrentCourses.length) {
    userMemory.knownCourses = [
      ...profileCurrentCourses,
      // Preserve any extra courses inferred from conversation that aren't in the profile
      ...(userMemory.knownCourses ?? []).filter(c => !profileCurrentCourses.includes(c)),
    ];
  } else if (userMemory && !userMemory.knownCourses?.length) {
    // no profile courses yet, keep whatever was inferred from chat
  }
  // Always sync completed courses from plannerProfile into memory
  if (userMemory && profileCompletedCourses.length) {
    userMemory.completedCourses = [
      ...profileCompletedCourses,
      ...(userMemory.completedCourses ?? []).filter(c => !profileCompletedCourses.includes(c)),
    ];
  } else if (userMemory && !userMemory.completedCourses?.length) {
    // no profile completed courses yet, keep whatever was inferred from chat
  }
  // Always populate confirmedMajor from profile for this session
  if (authenticatedStudyUser.major) {
    sessionState.confirmedMajor = authenticatedStudyUser.major;
  }
}

const memoryForThisTurn = userMemory
  ? await learnMemoryFromMessages(messages, userMemory).catch(() => userMemory)
  : null;

if (memoryForThisTurn) {
  if (!memoryForThisTurn.major && sessionState.confirmedMajor) {
    memoryForThisTurn.major = sessionState.confirmedMajor;
  }
  if (!memoryForThisTurn.year && sessionState.confirmedYear) {
    memoryForThisTurn.year = numericYearToLabel[sessionState.confirmedYear] ?? memoryForThisTurn.year;
  }
}

if (memoryForThisTurn !== null) {
  persistMemory(sessionId, memoryForThisTurn).catch(() => {});
}

// Always run AI classify — it runs in parallel with memory/session so cost is low,
// and it handles informal phrasing that regex misses.
const [aiIntentResult, regexIntentResult, regexCiResult] = await Promise.allSettled([
  classifyIntent(normalizedMsg, messages.slice(0, -1), memoryForThisTurn),
  Promise.resolve(detectIntent(normalizedMsg)),
  Promise.resolve(detectCampusIntent(normalizedMsg)),
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

// ── Follow-up grounding: inject active session entities into retrieval ────────
// Vague follow-ups ("tell me more", "why", "how so") carry no entity signal.
// Without injection, retrieval fetches unrelated data and Claude hallucinates.
// This sets intent + dc so the full retrieval pipeline fetches the right entity.
// No fast path — the query still goes through every retrieval and scoring step.
if (isFollowUpQuery(lastMsg)) {
  if (sessionState.activeProfessorName && !intent.profNameHint) {
    intent.profNameHint = sessionState.activeProfessorName;
    intent.isAboutProfessors = true;
    dc["professors"] = Math.max(dc["professors"] ?? 0, 0.90);
  }
  if (sessionState.activeCourseCode && !intent.courseCode) {
    const parts = sessionState.activeCourseCode.split(" ");
    if (parts.length >= 2) {
      intent.courseCode = { subject: parts[0], number: parts[1] };
    }
    intent.isAboutCourses = true;
    dc["courses"] = Math.max(dc["courses"] ?? 0, 0.85);
  }
}

  // ── Synchronous major/year extraction ────────────────────────────────────
  // If the current message establishes major/year for the first time, persist
  // synchronously so the same request can use them in retrieval and context.
  if (!sessionState.confirmedMajor || !sessionState.confirmedYear) {
    const syncUpdates: Partial<typeof sessionState> = {};
    if (!sessionState.confirmedMajor) {
      const majorRe = /\b(?:i(?:'m| am)(?: a| an)? |my major is |i(?:'m| am) (?:studying|majoring in) |i (?:study|major in) |i(?:'m| am) in (?:the )?)(computer science|cs|math(?:ematics)?|physics|biology|biological sciences?|chemistry|nursing|engineering|finance|accounting|marketing|english|psychology|history|political science|sociology|philosophy|art|music|education|business|economics|ece|electrical|mechanical|civil|industrial engineering|criminology(?: law and justice)?|criminal justice|pre-?med|pre-?law|information systems|data science|neuroscience)\b/i;
      const m = lastMsg.match(majorRe) || lastMsg.match(/\b(cs|computer science|math(?:ematics)?|physics|biology|biological sciences?|chemistry|nursing|engineering|finance|accounting|marketing|english|psychology|history|political science|sociology|philosophy|art|music|education|business|economics|criminology(?: law and justice)?|criminal justice)\s+(?:major|student|degree|program)\b/i);
      if (m) syncUpdates.confirmedMajor = normalizeMajor(m[1]);
    }
    if (!sessionState.confirmedYear) {
      const yearRe = /\b(freshman|first[- ]year|sophomore|second[- ]year|junior|third[- ]year|senior|fourth[- ]year|[1-4](?:st|nd|rd|th)?[- ]year)\b/i;
      const y = lastMsg.match(yearRe);
      if (y) {
        const t = y[1].toLowerCase().replace(/[\s-]+/, "-");
        const yearMap: Record<string, number> = { freshman: 1, "first-year": 1, sophomore: 2, "second-year": 2, junior: 3, "third-year": 3, senior: 4, "fourth-year": 4, "1st-year": 1, "2nd-year": 2, "3rd-year": 3, "4th-year": 4 };
        const yr = yearMap[t] ?? parseInt(t);
        if (yr >= 1 && yr <= 4) syncUpdates.confirmedYear = yr;
      }
    }
    if (Object.keys(syncUpdates).length > 0) {
      if (syncUpdates.confirmedMajor) sessionState.confirmedMajor = syncUpdates.confirmedMajor;
      if (syncUpdates.confirmedYear) sessionState.confirmedYear = syncUpdates.confirmedYear;
      await updateSessionState(sessionId, syncUpdates);
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
if (
  (dc["admissions"] ?? 0) < 0.5 &&
  lower.match(/\b(sat|act|test.?optional|admit|accept|waitlist|defer|enroll(?:ment)?|application|application help|apply|admission|admissions|admissions? office|admissions? counselor|admissions? counsellor|admissions? recruiter|contact admissions?|reach admissions?|talk to admissions?|help with admissions?|require(?:ment)?|deadline|acceptance|incoming|first.?year|transfer student|deposit|orientation|law school|college of|school of|colleges|schools at|programs offered)\b/) &&
  !(lower.includes("waitlist") && lower.match(/\b(course|class|registration|register)\b/))
) {
  dc["admissions"] = Math.max(dc["admissions"] ?? 0, 0.82);
}
if ((dc["international"] ?? 0) < 0.5 && lower.match(/\bi.?20\b|opt\b|cpt\b|f.?1\b|international student|ois\b|sevis|renew.*visa|visa.*renew|study abroad/i)) {
  dc["international"] = Math.max(dc["international"] ?? 0, 0.85);
}
// Boost for AI-detected major/planning queries that regex keyword scoring misses
// (e.g. "what majors is UIC best for", "is UIC good for pre-med", "which program is strongest")
if (aiIntent?.majorKey) {
  dc["admissions"]  = Math.max(dc["admissions"]  ?? 0, 0.75);
  dc["major_plan"]  = Math.max(dc["major_plan"]  ?? 0, 0.80);
}

// Broad ranking/discovery questions about UIC programs that don't use course codes
if (
  (aiIntent?.answerMode === "ranking" || aiIntent?.answerMode === "discovery") &&
  (aiIntent?.isAboutMajor || query.answerMode === "ranking") &&
  !intent.courseCode &&
  !intent.subjectCode
) {
  dc["admissions"] = Math.max(dc["admissions"] ?? 0, 0.72);
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
  if ((dc["recreation"] ?? 0) > 0.5 && !(dc["health"] ?? 0)) syncChunks.push(...retrieveRecreation(query));
  if (lower.match(/\bu.?pass\b|ventra|transit pass/i) && !syncChunks.some(c => c.domain === "transportation")) {
    syncChunks.push(...retrieveCampusMap(query));
  }
  if (lower.match(/\b(arc|jst|cmn|cmw|cms|cty|mrh|tbh|ssr|psr)\b/i) && !syncChunks.some(c => c.domain === "housing")) {
    syncChunks.push(...retrieveHousing(ci, query));
  }
  if (lower.match(/\b(food|eat|restaurant|market at halsted|24 ?hours?)\b/i) && !syncChunks.some(c => c.domain === "dining")) {
    syncChunks.push(...retrieveDining(ci, query));
  }
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
    const content = `=== ${label.toUpperCase()} COURSES RANKED BY EASINESS (${intent.wantsHardest ? "hardest" : "easiest"} first) ===\n` +
      courses.map((c: any) =>
        `${c.subject} ${c.number} — ${c.title}: Easiness ${c.difficultyScore?.toFixed(1) ?? "N/A"}/5 (${diffLabel(c.difficultyScore)}), GPA ${c.avgGpa?.toFixed(2) ?? "N/A"}${c.isGenEd ? ` [Gen Ed: ${c.genEdCategory}]` : ""}`
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

// Run vector store check and async DB tasks in parallel — neither blocks the other.
  // vectorTask is built AFTER both resolve since it depends on vectorStoreEmpty.
const vectorSourceTypes = getVectorSourceTypes(query);
const [vectorStoreEmpty, asyncResults] = await Promise.all([
  checkVectorStoreEmpty(),
  Promise.allSettled(asyncTasks),
]);

// Skip vector search for non-academic queries when structured JSON/SQL already found data.
// The vector store only contains course/professor/news — it adds noise for housing/tuition/calendar queries.
const isNonAcademicQuery =
  !intent.isAboutCourses &&
  !intent.isAboutProfessors &&
  !intent.isAboutGenEd &&
  query.answerMode !== "planning";

const topDomain = Object.entries(dc)
  .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0] ?? null;
const structuredDomains = new Set(syncChunks.map((chunk) => chunk.domain));
const hasStructuredCoverage = syncChunks.length > 0;
const hasCampusStructuredCoverage = hasStructuredCoverage &&
  [...structuredDomains].some((domain) => !["courses", "professors", "gen_ed", "major_plan", "news"].includes(domain));
const shouldSkipVectors =
  vectorSourceTypes.length === 0 ||
  vectorStoreEmpty ||
  (query.isFact && hasStructuredCoverage) ||
  (isNonAcademicQuery && hasStructuredCoverage) ||
  (topDomain !== null && !["courses", "professors", "gen_ed", "major_plan", "news"].includes(topDomain) && hasCampusStructuredCoverage);

const vectorTask = shouldSkipVectors
  ? Promise.resolve([])
  : syncChunks.length < 2
    ? vectorSearch(lastMsg, 8, { sourceTypes: vectorSourceTypes }).catch(() => [])
    : vectorSearch(lastMsg, 4, { sourceTypes: vectorSourceTypes }).catch(() => []);

const vectorResults = await vectorTask;

  const asyncChunks: RetrievedChunk[] = [];
  for (const r of asyncResults) {
    if (r.status === "fulfilled") asyncChunks.push(...r.value);
  }

  // Planning queries now flow through Claude with the full scaffold as context.
  // The DIRECT_RESPONSE fast path has been removed — Claude receives structured
  // planning ingredients and assembles the final plan with explicit constraints.
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
  // Uses domain confidence to return relevant data — not a generic professor dump.
  if (allChunks.length === 0) {
    const topFallbackDomain = Object.entries(query.domainConfidence)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0] ?? "none";

    let fallbackChunks: RetrievedChunk[] = [];

    if (topFallbackDomain === "housing" || topFallbackDomain === "dining") {
      fallbackChunks.push(...retrieveHousing(ci, query));
      fallbackChunks.push(...retrieveDining(ci, query));
    } else if (topFallbackDomain === "tuition" || topFallbackDomain === "financial_aid") {
      fallbackChunks.push(...retrieveTuition(ci, query));
    } else if (topFallbackDomain === "health" || topFallbackDomain === "recreation") {
      fallbackChunks.push(...retrieveHealth(query));
    } else if (topFallbackDomain === "calendar" || topFallbackDomain === "academic_policy") {
      fallbackChunks.push(...retrieveCalendar(query));
    } else if (topFallbackDomain === "transportation" || topFallbackDomain === "campus_map") {
      fallbackChunks.push(...retrieveCampusMap(query));
    } else if (topFallbackDomain === "safety") {
      fallbackChunks.push(...retrieveSafety(query));
    } else if (topFallbackDomain === "international") {
      fallbackChunks.push(...retrieveInternational(query));
    } else if (topFallbackDomain === "library") {
      fallbackChunks.push(...retrieveLibrary(query));
    } else if (topFallbackDomain === "admissions") {
      fallbackChunks.push(...retrieveAdmissions(query));
    } else if (topFallbackDomain === "student_life" || topFallbackDomain === "greek_life") {
      fallbackChunks.push(...retrieveStudentLife(query));
    } else if (topFallbackDomain === "athletics") {
      fallbackChunks = await retrieveAthletics(query);
    } else if (topFallbackDomain === "professors") {
      const topProfs = await fetchProfessorsByDept(null, 10).catch(() => []);
      if (topProfs.length > 0) {
        const c = `=== TOP RATED PROFESSORS ===\n` + topProfs.map((p: any) => `${p.name} (${p.department}): ${p.rmpQuality}/5`).join("\n");
        fallbackChunks.push(makeChunk("professors", c, 0.5, query));
      }
    } else if (topFallbackDomain === "courses") {
      const easyCourses = await fetchCoursesBySubjectOrDept(null, null, 10, true).catch(() => []);
      if (easyCourses.length > 0) {
        const c = `=== EASIEST COURSES ===\n` + easyCourses.map((c: any) => `${c.subject} ${c.number} - ${c.title}: GPA ${c.avgGpa}`).join("\n");
        fallbackChunks.push(makeChunk("courses", c, 0.5, query));
      }
    } else {
      // Truly unknown domain — minimal capability context only
      fallbackChunks.push(makeChunk("student_life", `=== SPARKY COVERS ===\nCourses & grades, professors & RMP, 4-year plans, tuition & scholarships, housing & dining, student orgs & Greek life, athletics & tickets, campus map, health & counseling, library, international students, careers, safety.`, 0.4, query));
    }

    allChunks.push(...fallbackChunks);
  }

  // planningManifest is populated directly from planningObj inside the Phase 1 block below.
  // It is declared here so Phase 2 (validation) can read it in the try block.
  let planningManifest: string[] = [];
  // Set to true in Phase 1 when the planner detects the requested major is not in its data.
  // Phase 2 uses this to skip manifest validation and stream a graceful fallback instead.
  let isPlannerMajorNotFound = false;
  let planningStudentCtx: StudentContext | null = null;
  const deterministicPlanChunk = query.answerMode === "planning"
    ? allChunks.find((chunk) => chunk.domain === "major_plan" && chunk.content.startsWith("=== DETERMINISTIC PLAN ==="))
    : null;
  const deterministicRequirementsChunk = allChunks.find((chunk) =>
    chunk.domain === "major_plan" && chunk.content.startsWith("=== DETERMINISTIC REQUIREMENTS ===")
  );
  const deterministicNextTermChunk = allChunks.find((chunk) =>
    chunk.domain === "major_plan" && chunk.content.startsWith("=== DETERMINISTIC NEXT TERM ===")
  );
  const deterministicFactChunk = allChunks.find((chunk) =>
    chunk.content.startsWith("=== DETERMINISTIC FACT ===")
  );

  if (deterministicPlanChunk) {
    const directPlan = deterministicPlanChunk.content
      .replace(/^=== DETERMINISTIC PLAN ===\n?/, "")
      .trim();
    await persistChatLog({
      responseText: directPlan,
      responseKind: "deterministic_plan",
      answerMode: query.answerMode,
      extraMetadata: {
        matchedPath: "deterministic_plan",
      },
    });
    const enc = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(enc.encode(directPlan));
        controller.close();
      },
    });
    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  if (deterministicRequirementsChunk || deterministicNextTermChunk) {
    const directText = (deterministicRequirementsChunk ?? deterministicNextTermChunk)!.content
      .replace(/^=== DETERMINISTIC (REQUIREMENTS|NEXT TERM) ===\n?/, "")
      .trim();
    await persistChatLog({
      responseText: directText,
      responseKind: deterministicRequirementsChunk ? "deterministic_requirements" : "deterministic_next_term",
      answerMode: query.answerMode,
      extraMetadata: {
        matchedPath: deterministicRequirementsChunk ? "deterministic_requirements" : "deterministic_next_term",
      },
    });
    const enc = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(enc.encode(directText));
        controller.close();
      },
    });
    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  if (deterministicFactChunk) {
    const directText = deterministicFactChunk.content
      .replace(/^=== DETERMINISTIC FACT ===\n?/, "")
      .trim();
    await persistChatLog({
      responseText: directText,
      responseKind: "deterministic_fact",
      answerMode: query.answerMode,
      extraMetadata: {
        matchedPath: "deterministic_fact",
      },
    });
    const enc = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(enc.encode(directText));
        controller.close();
      },
    });
    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  // ── Planning pipeline: MANDATORY PlanningObject before answer generation ────
  // Pipeline order:
  //   isPlanningQuery → extractStudentContext → retrieveMajorPlan (above)
  //   → buildPlanningObject → answer generation
  //
  // PlanningObject is NOT optional. Raw scaffold MUST NOT reach the answer call.
  // On failure: return controlled failure response immediately — no fallback.
  if (query.answerMode === "planning") {
    const scaffoldChunk = allChunks.find(c => c.domain === "major_plan");
    if (scaffoldChunk) {
      const studentCtx = extractStudentContext(lastMsg, messages.slice(0, -1));
      planningStudentCtx = studentCtx;

      // Merge in profile data so the planner automatically knows the student's
      // major, completed courses, and current courses without them having to
      // re-state everything in the chat.
      if (authenticatedStudyUser) {
        const profilePrefs = parseStoredPreferences(authenticatedStudyUser.studyPreferences);
        const profileCompleted = profilePrefs.plannerProfile.completedCourses ?? [];
        const profileCurrent = authenticatedStudyUser.currentCourses ?? [];
        const profileMajor = authenticatedStudyUser.major ?? null;
        // Use profile major if not explicitly stated in chat
        if (!studentCtx.major && profileMajor) {
          studentCtx.major = profileMajor;
        }
        // Merge profile completed courses (deduplicated)
        if (profileCompleted.length) {
          const existingCompleted = new Set(studentCtx.completed_courses);
          for (const c of profileCompleted) {
            existingCompleted.add(c);
          }
          studentCtx.completed_courses = Array.from(existingCompleted);
        }
        // Merge profile current courses
        if (profileCurrent.length) {
          const existingCurrent = new Set(studentCtx.in_progress_courses);
          for (const c of profileCurrent) {
            existingCurrent.add(c);
          }
          studentCtx.in_progress_courses = Array.from(existingCurrent);
        }
        // Add honors constraint if set in profile
        const isHonors = profilePrefs.plannerProfile.honorsStudent;
        if (isHonors && !studentCtx.constraints.includes("honors college")) {
          studentCtx.constraints.push("honors college");
        }
      }
      let planningObj: PlanningObject;
      try {
        planningObj = await buildPlanningObject(
          scaffoldChunk.content,
          studentCtx,
          query.primaryGoal
        );
      } catch (err) {
        // Both attempts failed — return controlled failure. Do NOT proceed with raw scaffold.
        console.error("[planning pipeline] buildPlanningObject failed after retry:", (err as Error).message);
        const failMsg = buildPlanningRecoveryMessage(planningStudentCtx, "build_failed");
        await persistChatLog({
          responseText: failMsg,
          responseKind: "planning_validation_failure",
          responseStatus: "error",
          answerMode: query.answerMode,
          extraMetadata: {
            matchedPath: "planning_validation_failure",
          },
        });
        const enc = new TextEncoder();
        const failStream = new ReadableStream({
          start(c) { c.enqueue(enc.encode(failMsg)); c.close(); },
        });
        return new Response(failStream, {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }

      // PlanningObject is valid — replace scaffold chunk unconditionally.
      // The final answer call ONLY sees the structured PlanningObject, not the raw scaffold.
      scaffoldChunk.content = [
        `=== PLANNING OBJECT (structured — use this as your sole source of truth) ===`,
        JSON.stringify(planningObj, null, 2),
        `=== END PLANNING OBJECT ===`,
        ``,
        `STUDENT CONTEXT SUMMARY:`,
        `  Major: ${planningObj.student_context.major ?? "not specified"}`,
        `  Completed: ${planningObj.student_context.completed_courses.join(", ") || "none"}`,
        `  In-progress: ${planningObj.student_context.in_progress_courses.join(", ") || "none"}`,
        `  Constraints: ${planningObj.student_context.constraints.join(", ") || "none"}`,
        ``,
        `Plan strategy: ${planningObj.plan_strategy}`,
      ].join("\n");

      // Phase 2: capture manifest directly — no string parsing
      planningManifest = planningObj.requirements.required_courses;
      isPlannerMajorNotFound = planningObj.plan_strategy?.toLowerCase().includes("major not found") ?? false;
    }
  }

  // ── Build answer brief + assemble context ─────────────────────────────────
  // Rerank all chunks before assembly — never pass raw nearest neighbors to the model
const rerankTopK = query.isFact ? 3 : query.answerMode === "planning" ? 10 : query.answerMode === "comparison" ? 8 : query.answerMode === "ranking" ? 6 : 7;
const rerankedChunks = allChunks.length > rerankTopK ? await rerankChunks(lastMsg, allChunks, rerankTopK) : allChunks;
const entityVerification = verifyExactEntityMatch(lastMsg, intent, query, rerankedChunks);

const trust = makeTrustDecision(
  {
    rawQuery:         lastMsg,
    isFact:           query.isFact,
    answerMode:       query.answerMode,
    domainConfidence: query.domainConfidence,
    exactEntityRequired: entityVerification.required,
    exactEntityMatch: entityVerification.matched,
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
  entityVerificationRequired: entityVerification.required,
  entityVerificationMatched: entityVerification.matched,
  entityVerificationExpected: entityVerification.expected,
  topScore: trust.explanation.top_score,
  chunkCount: rerankedChunks.length,
  top3Chunks,
  retrievalSources,
  ms: Date.now() - requestStartMs,
}));

// ── Abstain gate ──────────────────────────────────────────────────────────
if (trust.decision === "abstain") {
  const abstainText = getAbstainResponse(query, trust.reason);
  await persistChatLog({
    responseText: abstainText,
    responseKind: "abstain",
    responseStatus: "abstained",
    answerMode: query.answerMode,
    domainsTriggered,
    retrievalSources,
    topChunkScore: trust.explanation.top_score > 0 ? trust.explanation.top_score : null,
    chunkCount: rerankedChunks.length,
    abstained: true,
    abstainReason: trust.reason,
    extraMetadata: {
      trustDecision: trust.decision,
      trustConfidence: trust.confidence,
      trustClass: trust.explanation.query_class,
      primaryDomain: trust.explanation.primary_domain,
      entityVerification,
    },
  });
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

const context = assembleContext(rerankedChunks, query.isFact, query.domainConfidence);
const memoryContext = memoryForThisTurn ? formatMemoryForPrompt(memoryForThisTurn) : "";
const answerPack = buildAnswerPack(query, rerankedChunks, intent, sessionState);

  // Collect entity state updates — written once per request after response completes
const stateUpdates = extractEntitiesFromQuery(lastMsg, intent, sessionState);
const topDomainEntry = Object.entries(query.domainConfidence).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0];
if (topDomainEntry) stateUpdates.lastRetrievedDomain = topDomainEntry[0];
// lastResponseExcerpt is added below inside each response path, then a single await write is performed.

  // ── Build prompt + call model ─────────────────────────────────────────────
const trustInstruction = getTrustInstruction(trust);
const isFinancialQuery = (dc["tuition"] ?? 0) > 0.5 || (dc["financial_aid"] ?? 0) > 0.5 ||
  ci.isAboutTuition || ci.isAboutFinancialAid || ci.isAboutCostComparison || ci.isAboutPayment;

// ── Uploaded file context ─────────────────────────────────────────────────
let uploadedFileContext = "";
let uploadedFileBlock: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam | null = null;
let uploadedFileFallbackPrompt = "";

if (uploadedFile) {
  const uploadedFileSupport = await buildUploadedFileSupport(uploadedFile);
  uploadedFileContext = uploadedFileSupport.promptContext;
  uploadedFileBlock = uploadedFileSupport.attachmentBlock;
  uploadedFileFallbackPrompt = uploadedFileSupport.fallbackUserPrompt;
}

const smartFollowUpInstruction = buildSmartFollowUpInstruction(lastMsg, query, sessionState);
const systemPrompt = buildSystemPrompt(
  memoryContext,
  context,
  query.isFact,
  answerPack,
  trustInstruction,
  isFinancialQuery,
  smartFollowUpInstruction
) + uploadedFileContext;
const maxTokens = uploadedFile ? 2000
  : query.answerMode === "planning" ? 2800
  : query.answerMode === "hybrid" ? 1800
  : query.isFact ? 300
  : query.answerMode === "ranking" ? 800
  : query.answerMode === "logistics" ? 400
  : query.answerMode === "recommendation" ? 900
  : query.answerMode === "comparison" ? 900
  : 600; // discovery default

  try {
    // Build multimodal message for the last user turn when an attachment is attached
    const apiMessages: Anthropic.MessageParam[] = messages.map((m: ChatMessage, idx: number) => {
      if (idx === messages.length - 1 && uploadedFileBlock) {
        const fallbackImagePrompt =
          !m.content || /^\[Attached:\s*.+\]$/.test(m.content)
            ? uploadedFileFallbackPrompt
            : m.content;
        const content: Anthropic.ContentBlockParam[] = [
          uploadedFileBlock,
          { type: "text", text: fallbackImagePrompt },
        ];
        return { role: "user" as const, content };
      }
      return { role: m.role as "user" | "assistant", content: m.content };
    });

    const responseHeaders: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Accel-Buffering": "no",
    };
    if (isNew) {
      responseHeaders["Set-Cookie"] = `sparky_session=${sessionId}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    }

    // ── Phase 2: planning validation path ─────────────────────────────────────
    // Planning responses are collected in full before being returned so they can
    // be validated deterministically. Non-planning queries use the streaming path.
    if (query.answerMode === "planning") {
      // Hard-fail if manifest is empty — but only if this is NOT a "major not found" terminal state.
      // When major not found, planningObj.plan_strategy contains "Major not found" and semester_plan is [].
      // That is a valid graceful degradation — let Claude render the "not found" response.
      const scaffoldChunk = allChunks.find(c => c.domain === "major_plan");
      const isMajorNotFound =
        isPlannerMajorNotFound ||
        (scaffoldChunk?.content.includes("NO PLAN DATA FOUND") ?? false);

      if (planningManifest.length === 0 && !isMajorNotFound) {
        throw new Error("Validation failed: empty manifest");
      }

      // If major not found, skip Phase 2 validation entirely and stream the graceful response
      if (isMajorNotFound) {
        const majorNotFoundMsg = buildPlanningRecoveryMessage(planningStudentCtx, "major_not_found");

        const enc = new TextEncoder();
        const fallbackStream = new ReadableStream({
          start(c) { c.enqueue(enc.encode(majorNotFoundMsg)); c.close(); },
        });
        stateUpdates.lastResponseExcerpt = majorNotFoundMsg.slice(0, 400);
        await updateSessionState(sessionId, stateUpdates);
        await persistChatLog({
          responseText: majorNotFoundMsg,
          responseKind: "planning_major_not_found",
          answerMode: query.answerMode,
          domainsTriggered,
          retrievalSources,
          topChunkScore: trust.explanation.top_score > 0 ? trust.explanation.top_score : null,
          chunkCount: rerankedChunks.length,
          extraMetadata: {
            matchedPath: "planning_major_not_found",
          },
        });
        return new Response(fallbackStream, { headers: responseHeaders });
      }

      // Step 1: generate full response (non-streaming — validation requires complete text)
      const firstRes = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: apiMessages,
      });
      let planText = (firstRes.content[0] as any)?.text ?? "";

      // Step 2: validate against manifest
      const v1 = validatePlan(planText, planningManifest);
      if (!v1.valid) {
        console.warn("[validatePlan] Attempt 1 invalid:", {
          missing: v1.missingCourses,
          invalid: v1.invalidCourses,
          placeholders: v1.hasPlaceholders,
        });

        // Step 3: build correction prompt and retry ONCE
        const correctionPrompt = buildCorrectionPrompt(v1);
        const retryRes = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [
            ...apiMessages,
            { role: "assistant" as const, content: planText },
            { role: "user" as const, content: correctionPrompt },
          ],
        });
        const retryText = (retryRes.content[0] as any)?.text ?? "";
        const v2 = validatePlan(retryText, planningManifest);

        if (v2.valid) {
          // Retry passed — use corrected plan
          planText = retryText;
        } else {
          // Step 4: second failure — return retry text with disclaimer
          console.warn("[validatePlan] Attempt 2 still invalid:", {
            missing: v2.missingCourses,
            invalid: v2.invalidCourses,
            placeholders: v2.hasPlaceholders,
          });
          planText = retryText + "\n\n*Please verify this plan against catalog.uic.edu*";
        }
      }

      // Single write: entity state + excerpt together
      stateUpdates.lastResponseExcerpt = planText.slice(0, 400);
      await updateSessionState(sessionId, stateUpdates);
      await persistChatLog({
        responseText: planText,
        responseKind: "planning_response",
        answerMode: query.answerMode,
        domainsTriggered,
        retrievalSources,
        topChunkScore: trust.explanation.top_score > 0 ? trust.explanation.top_score : null,
        chunkCount: rerankedChunks.length,
        extraMetadata: {
          planValidationManifestCount: planningManifest.length,
        },
      });

      // Stream the final (validated or disclaimed) plan text back to the client
      const enc = new TextEncoder();
      const planStream = new ReadableStream({
        start(controller) {
          controller.enqueue(enc.encode(planText));
          controller.close();
        },
      });
      return new Response(planStream, { headers: responseHeaders });
    }

    // ── Non-planning: existing streaming path (unchanged) ─────────────────────
    const stream = client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: apiMessages,
    });

    const encoder = new TextEncoder();
    let accumulatedText = "";
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(event.delta.text));
              accumulatedText += event.delta.text;
            }
          }
        } finally {
          controller.close();
          // Single write: entity state + excerpt together, after stream completes
          stateUpdates.lastResponseExcerpt = accumulatedText ? accumulatedText.slice(0, 400) : undefined;
          await updateSessionState(sessionId, stateUpdates);
          await persistChatLog({
            responseText: accumulatedText,
            responseKind: "model_stream_response",
            answerMode: query.answerMode,
            domainsTriggered,
            retrievalSources,
            topChunkScore: trust.explanation.top_score > 0 ? trust.explanation.top_score : null,
            chunkCount: rerankedChunks.length,
            extraMetadata: {
              trustDecision: trust.decision,
              trustConfidence: trust.confidence,
              trustClass: trust.explanation.query_class,
              primaryDomain: trust.explanation.primary_domain,
              entityVerification,
            },
          });
        }
      },
    });

    return new Response(readable, { headers: responseHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Chat API error:", message);
    await persistChatLog({
      responseText: message,
      responseKind: "error",
      responseStatus: "error",
      answerMode: query.answerMode,
      extraMetadata: {
        matchedPath: "catch",
      },
    }).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
