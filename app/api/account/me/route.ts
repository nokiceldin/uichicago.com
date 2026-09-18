import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentSession, requireCurrentStudyUser } from "@/lib/auth/session";
import { resolveAvatarUrl } from "@/lib/site-settings";
import { parseStoredPreferences } from "@/lib/study/profile";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [session, studyUser] = await Promise.all([
      getCurrentSession(),
      requireCurrentStudyUser(),
    ]);
    const preferences = parseStoredPreferences(studyUser.studyPreferences);

    return NextResponse.json(
      {
        user: {
          id: session?.user?.id ?? null,
          avatarUrl: resolveAvatarUrl(preferences.settings.avatar, studyUser.image),
        },
        isAdmin: isAdminEmail(session?.user?.email),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[GET /api/account/me]", error);
    return NextResponse.json({ error: "Failed to load account." }, { status: 500 });
  }
}
