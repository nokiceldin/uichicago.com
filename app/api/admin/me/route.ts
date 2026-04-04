import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin";

export async function GET() {
  const session = await getCurrentAdminSession();
  return NextResponse.json({ isAdmin: Boolean(session) }, { headers: { "Cache-Control": "no-store" } });
}
