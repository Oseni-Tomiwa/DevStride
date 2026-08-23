import { NextResponse } from "next/server";

import { createClient } from "../../../lib/supabase/server";
import { SESSION_POLICY_COOKIE, createSessionPolicyCookie } from "../../../lib/supabase/session-policy";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 7 * 24 * 60 * 60,
};

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const value = await createSessionPolicyCookie();
  if (!value) return NextResponse.json({ error: "Session policy is unavailable" }, { status: 503 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_POLICY_COOKIE, value, cookieOptions);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_POLICY_COOKIE, "", { ...cookieOptions, maxAge: 0, expires: new Date(0) });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
