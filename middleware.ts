import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getCookieNameForScope,
  getProtectedScope,
  hasValidAccessCookie,
} from "@/lib/private-access";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const scope = getProtectedScope(pathname);

  if (!scope) {
    return NextResponse.next();
  }

  const cookieValue = request.cookies.get(getCookieNameForScope(scope))?.value;
  const allowed = await hasValidAccessCookie(scope, cookieValue);

  if (allowed) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const unlockUrl = request.nextUrl.clone();
  unlockUrl.pathname = "/unlock";
  unlockUrl.search = "";
  unlockUrl.searchParams.set("next", `${pathname}${search}`);

  return NextResponse.redirect(unlockUrl);
}

export const config = {
  matcher: ["/study/planner/:path*"],
};
