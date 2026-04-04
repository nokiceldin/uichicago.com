import { getCurrentSession } from "@/lib/auth/session";

function parseAdminEmails() {
  const raw =
    process.env.SPARKY_ADMIN_EMAILS ??
    process.env.ADMIN_EMAILS ??
    process.env.ADMIN_EMAIL ??
    "";

  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;

  const adminEmails = parseAdminEmails();
  if (adminEmails.length === 0) {
    return process.env.NODE_ENV !== "production";
  }

  return adminEmails.includes(email.trim().toLowerCase());
}

export async function getCurrentAdminSession() {
  const session = await getCurrentSession();
  if (!session?.user?.email) return null;
  if (!isAdminEmail(session.user.email)) return null;
  return session;
}
