type ProtectedScope = "chat" | "study";

type ScopeConfig = {
  cookieName: string;
  password: string;
};

const ACCESS_VERSION = "uichicago-private-v1";

const SCOPE_CONFIG: Record<ProtectedScope, ScopeConfig> = {
  chat: {
    cookieName: "uic_private_chat_access",
    password: "uicsparky2026",
  },
  study: {
    cookieName: "uic_private_study_access",
    password: "mypage2026",
  },
};

function normalizePathname(pathname: string) {
  if (!pathname.startsWith("/")) return `/${pathname}`;
  return pathname;
}

export function getProtectedScope(pathname: string): ProtectedScope | null {
  const normalized = normalizePathname(pathname);

  if (normalized === "/chat" || normalized.startsWith("/chat/") || normalized === "/api/chat" || normalized.startsWith("/api/chat/")) {
    return "chat";
  }

  if (normalized === "/study" || normalized.startsWith("/study/") || normalized === "/api/study" || normalized.startsWith("/api/study/")) {
    return "study";
  }

  return null;
}

export function isProtectedPath(pathname: string) {
  return getProtectedScope(pathname) !== null;
}

export function getCookieNameForScope(scope: ProtectedScope) {
  return SCOPE_CONFIG[scope].cookieName;
}

export function getScopeForNextPath(nextPath: string): ProtectedScope | null {
  const safePath = extractSafeNextPath(nextPath);
  return safePath ? getProtectedScope(safePath) : null;
}

export function extractSafeNextPath(nextPath: string | null | undefined) {
  if (!nextPath) return null;
  if (!nextPath.startsWith("/")) return null;
  if (nextPath.startsWith("//")) return null;
  return nextPath;
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createAccessToken(scope: ProtectedScope) {
  const config = SCOPE_CONFIG[scope];
  return sha256Hex(`${ACCESS_VERSION}:${scope}:${config.password}`);
}

export async function isValidPasswordForScope(scope: ProtectedScope, password: string) {
  return password === SCOPE_CONFIG[scope].password;
}

export async function hasValidAccessCookie(scope: ProtectedScope, cookieValue: string | undefined) {
  if (!cookieValue) return false;
  const expected = await createAccessToken(scope);
  return cookieValue === expected;
}
