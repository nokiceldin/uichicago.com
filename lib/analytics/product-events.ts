export const PRODUCT_EVENT_NAMES = {
  homepageView: "homepage_view",
  professorSearch: "professor_search",
  professorView: "professor_view",
  courseSearch: "course_search",
  courseView: "course_view",
  favoriteProfessor: "favorite_professor",
  chatbotQuestion: "chatbot_question",
  shareClick: "share_click",
  registrationHubView: "registration_hub_view",
  returningUser: "returning_user",
} as const;

export type ProductEventName = typeof PRODUCT_EVENT_NAMES[keyof typeof PRODUCT_EVENT_NAMES];

export type ProductEventProperties = {
  homepage_view: { path: "/" };
  professor_search: {
    normalized_query: string;
    department: string | null;
    min_rating: number;
    min_reviews: number;
    sort: string;
    saved_only: boolean;
    result_count: number;
  };
  professor_view: { professor_slug: string };
  course_search: {
    normalized_query: string;
    department: string | null;
    gen_ed: boolean;
    gen_ed_category: string | null;
    major: string | null;
    major_category: string | null;
    saved_only: boolean;
    sort: string;
    result_count: number;
  };
  course_view: { subject: string; course_number: string; course_code: string };
  favorite_professor: {
    professor_slug: string;
    department: string | null;
    is_authenticated: boolean;
  };
  chatbot_question: {
    question_length: number;
    conversation_message_count: number;
    has_attachment: boolean;
    attachment_type: string | null;
    topic: string;
  };
  share_click: {
    surface: "study_workspace";
    object: "study_set";
    method: "open" | "copy_link" | "x" | "whatsapp" | "email" | "native";
  };
  registration_hub_view: { surface: "chat_topic" };
  returning_user: { visit_type: "returning" };
};

export type ProductEvent = {
  [Name in ProductEventName]: { name: Name; properties: ProductEventProperties[Name] }
}[ProductEventName];

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function classifyProductView(pathname: string): ProductEvent | null {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (normalizedPath === "/") {
    return { name: PRODUCT_EVENT_NAMES.homepageView, properties: { path: "/" } };
  }

  const professorMatch = normalizedPath.match(/^\/professors\/([^/]+)$/);
  if (professorMatch) {
    return {
      name: PRODUCT_EVENT_NAMES.professorView,
      properties: { professor_slug: decodePathSegment(professorMatch[1]) },
    };
  }

  const courseMatch = normalizedPath.match(/^\/courses\/([^/]+)\/([^/]+)$/);
  if (courseMatch) {
    const subject = decodePathSegment(courseMatch[1]).trim().toUpperCase();
    const courseNumber = decodePathSegment(courseMatch[2]).trim().toUpperCase();
    return {
      name: PRODUCT_EVENT_NAMES.courseView,
      properties: {
        subject,
        course_number: courseNumber,
        course_code: `${subject} ${courseNumber}`,
      },
    };
  }

  return null;
}

export function normalizeSearchQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function searchEventKeyAfterInput(previousEventKey: string | null, query: string) {
  return normalizeSearchQuery(query) ? previousEventKey : null;
}

export function buildProfessorSearchEvent(input: {
  query: string;
  department: string;
  minRating: number;
  minReviews: number;
  sort: string;
  savedOnly: boolean;
  resultCount: number;
}): ProductEvent | null {
  const normalizedQuery = normalizeSearchQuery(input.query);
  if (!normalizedQuery) return null;
  return {
    name: PRODUCT_EVENT_NAMES.professorSearch,
    properties: {
      normalized_query: normalizedQuery,
      department: input.department === "All" ? null : input.department,
      min_rating: input.minRating,
      min_reviews: input.minReviews,
      sort: input.sort,
      saved_only: input.savedOnly,
      result_count: Math.max(0, input.resultCount),
    },
  };
}

export function buildCourseSearchEvent(input: {
  query: string;
  department: string;
  genEd: boolean;
  genEdCategory: string;
  major: string;
  majorCategory: string;
  savedOnly: boolean;
  sort: string;
  resultCount: number;
}): ProductEvent | null {
  const normalizedQuery = normalizeSearchQuery(input.query);
  if (!normalizedQuery) return null;
  return {
    name: PRODUCT_EVENT_NAMES.courseSearch,
    properties: {
      normalized_query: normalizedQuery,
      department: input.department || null,
      gen_ed: input.genEd,
      gen_ed_category: input.genEdCategory || null,
      major: input.major || null,
      major_category: input.majorCategory || null,
      saved_only: input.savedOnly,
      sort: input.sort,
      result_count: Math.max(0, input.resultCount),
    },
  };
}

export function decideReturningVisit(input: { hasVisited: boolean; sessionMarked: boolean }) {
  if (!input.hasVisited) {
    return { captureReturningUser: false, markVisited: true, markSession: true };
  }
  if (!input.sessionMarked) {
    return { captureReturningUser: true, markVisited: false, markSession: true };
  }
  return { captureReturningUser: false, markVisited: false, markSession: false };
}

export function productEventKey(event: ProductEvent) {
  return `${event.name}:${JSON.stringify(event.properties)}`;
}
