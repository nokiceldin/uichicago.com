import { NextResponse } from "next/server";
import {
  createAccessToken,
  extractSafeNextPath,
  getCookieNameForScope,
  getScopeForNextPath,
  isValidPasswordForScope,
} from "@/lib/private-access";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { password?: unknown; next?: unknown } | null;
    const password = typeof body?.password === "string" ? body.password : "";
    const requestedNext = typeof body?.next === "string" ? body.next : "";
    const safeNext = extractSafeNextPath(requestedNext);
    const scope = safeNext ? getScopeForNextPath(safeNext) : null;

    if (!scope) {
      return NextResponse.json({ error: "Invalid protected destination." }, { status: 400 });
    }

    const valid = await isValidPasswordForScope(scope, password);
    if (!valid) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }

    const token = await createAccessToken(scope);
    const response = NextResponse.json({ ok: true, next: safeNext });

    response.cookies.set({
      name: getCookieNameForScope(scope),
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Failed to unlock access." }, { status: 500 });
  }
}
