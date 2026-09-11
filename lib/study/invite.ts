/** Accept the visible invite code or a copied invite URL. */
export function parseStudyInvite(value: string): string {
  const input = value.trim();
  if (!input) return "";
  let code = input;
  if (input.includes("?")) {
    try {
      code = new URL(input, "https://uichicago.com").searchParams.get("join") || "";
    } catch {
      return "";
    }
  }
  return /^[a-z0-9-]+$/i.test(code) ? code.toUpperCase() : "";
}

export function studyInvitePath(code: string): string {
  return `/study?screen=groups&join=${encodeURIComponent(code)}`;
}
