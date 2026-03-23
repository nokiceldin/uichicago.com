import Anthropic from "@anthropic-ai/sdk";
import { majorRequirements } from "@/lib/majorRequirements";

const client = new Anthropic();

// All valid major keys for the classifier to pick from
const MAJOR_KEYS = majorRequirements.map((m) => m.key);

export type ClassifiedIntent = {
  // Answer mode — semantic classification takes priority over regex
  answerMode: "planning" | "ranking" | "comparison" | "recommendation" | "logistics" | "discovery" | "hybrid" | null;

  // Course signals
  courseCode: { subject: string; number: string } | null;
  subjectCode: string | null;
  isAboutCourses: boolean;
  isAboutGenEd: boolean;
  wantsEasiest: boolean;
  wantsHardest: boolean;

  // Professor signals
  isAboutProfessors: boolean;
  profNameHint: string | null;
  wantsProfRanking: boolean;

  // Major signals
  majorKey: string | null;
  isAboutMajor: boolean;
  isAboutRequirementType: boolean;
  deptName: string | null;

  // Campus signals
  isAboutTuition: boolean;
  isAboutFinancialAid: boolean;
  isAboutResidency: boolean;
  isAboutPayment: boolean;
  isAboutCostComparison: boolean;
  isAboutDebt: boolean;
  isAboutHousing: boolean;
  isAboutMealPlan: boolean;
  isAboutDining: boolean;
  isAboutOffCampus: boolean;
  isAboutLLC: boolean;
  isAboutStudentLife: boolean;
  isAboutAthletics: boolean;
  isAboutCampusMap: boolean;
  isAboutBuildings: boolean;
  isAboutTransportation: boolean;
  isAboutHealth: boolean;
  isAboutAcademicPolicies: boolean;
  isAboutCalendar: boolean;
  isAboutRecreation: boolean;
  isAboutSafety: boolean;
};

const SYSTEM_PROMPT = `You are an intent classifier for Sparky, a UIC (University of Illinois Chicago) AI assistant.

Given a student's message, extract structured intent signals as JSON. Be generous — if something is plausible, mark it true.

Respond ONLY with a valid JSON object. No explanation, no markdown, no backticks.

JSON schema:
{
  "answerMode": one of "planning"|"ranking"|"comparison"|"recommendation"|"logistics"|"discovery"|"hybrid" — classify the student's intent: planning=degree/semester plan, ranking=easiest/best/top list, comparison=A vs B, recommendation=should I / suggest for me, logistics=where/when/how/contact/deadline, discovery=general info, hybrid=multiple modes,
  "courseCode": {"subject": "CS", "number": "211"} or null,
  "subjectCode": "CS" or null (department code if mentioned without course number),
  "isAboutCourses": boolean,
  "isAboutGenEd": boolean,
  "wantsEasiest": boolean,
  "wantsHardest": boolean,
  "isAboutProfessors": boolean,
  "profNameHint": "smith" or null (last name only, lowercase, if a specific professor is mentioned),
  "wantsProfRanking": boolean,
  "majorKey": one of ${JSON.stringify(MAJOR_KEYS)} or null,
  "isAboutMajor": boolean,
  "isAboutRequirementType": boolean (prereqs, core vs elective, etc),
  "deptName": full department name or null (e.g. "Computer Science", "Mathematics"),
  "isAboutTuition": boolean,
  "isAboutFinancialAid": boolean,
  "isAboutResidency": boolean,
  "isAboutPayment": boolean,
  "isAboutCostComparison": boolean,
  "isAboutDebt": boolean,
  "isAboutHousing": boolean,
  "isAboutMealPlan": boolean,
  "isAboutDining": boolean,
  "isAboutOffCampus": boolean,
  "isAboutLLC": boolean,
  "isAboutStudentLife": boolean,
  "isAboutAthletics": boolean,
  "isAboutCampusMap": boolean,
  "isAboutBuildings": boolean,
  "isAboutTransportation": boolean,
  "isAboutHealth": boolean,
  "isAboutAcademicPolicies": boolean,
  "isAboutCalendar": boolean,
  "isAboutRecreation": boolean,
  "isAboutSafety": boolean
}

Examples:
"who's the easiest grader for intro to programming?" → answerMode:"ranking", isAboutProfessors:true, isAboutCourses:true, wantsEasiest:true, deptName:"Computer Science"
"im pre-med what classes should i take" → answerMode:"recommendation", isAboutCourses:true, isAboutMajor:true, majorKey:"biology"
"does ARC have a gym?" → answerMode:"logistics", isAboutHousing:true, isAboutRecreation:true
"how do i get free tuition" → answerMode:"discovery", isAboutTuition:true, isAboutFinancialAid:true
"is reckinger a good professor" → answerMode:"discovery", isAboutProfessors:true, profNameHint:"reckinger", wantsProfRanking:true
"easiest way to fulfill natural world gen ed" → answerMode:"ranking", isAboutGenEd:true, isAboutCourses:true, wantsEasiest:true
"make me a 4 year plan for CS" → answerMode:"planning", isAboutMajor:true, majorKey:"computer-science"
"which is better ARC or JST?" → answerMode:"comparison", isAboutHousing:true
"should I take CS 251 or CS 301 first?" → answerMode:"recommendation", isAboutCourses:true`;

export async function classifyIntent(
  message: string,
  conversationHistory: { role: string; content: string }[],
  memory?: { major?: string; year?: string; interests?: string[] } | null
): Promise<ClassifiedIntent | null> {
  try {
    // Build context from last few messages so follow-ups work
    const context = conversationHistory
      .slice(-4)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

      const memoryHint = memory && Object.keys(memory).length > 0
  ? `\nStudent context: ${memory.major ? `${memory.year ?? ""} ${memory.major} major` : ""} ${memory.interests?.length ? `interested in ${memory.interests.join(", ")}` : ""}`
  : "";

const userPrompt = context
  ? `Conversation so far:\n${context}\n\nLatest message to classify: "${message}"`
  : `Message to classify: "${message}"`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001", // Fast + cheap for classification
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    

    const text = (response.content[0] as { type: string; text?: string }).text ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    // Resolve majorKey back to the full major object
    const majorObj = parsed.majorKey
      ? majorRequirements.find((m) => m.key === parsed.majorKey) ?? null
      : null;

    return {
      ...parsed,
      major: majorObj, // keep compat with existing data.ts which uses intent.major
    } as ClassifiedIntent;
  } catch (err) {
    console.error("Intent classification failed, falling back to regex:", err);
    return null;
  }
}