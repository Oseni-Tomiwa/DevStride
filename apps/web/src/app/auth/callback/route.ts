import { NextResponse } from "next/server";

import { createClient } from "../../../lib/supabase/server";
import { getSafeReturnPath } from "../../../lib/supabase/return-path";
import { SESSION_POLICY_COOKIE, createSessionPolicyCookie } from "../../../lib/supabase/session-policy";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const destination = getSafeReturnPath(next);

  if (!code) {
    return redirectWithNoStore(new URL("/login?error=confirmation", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectWithNoStore(new URL("/login?error=confirmation", request.url));
  }

  const response = redirectWithNoStore(new URL(destination, request.url));
  const policy = await createSessionPolicyCookie();
  if (!policy) return redirectWithNoStore(new URL("/login?error=session", request.url));
  response.cookies.set(SESSION_POLICY_COOKIE, policy, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}

function redirectWithNoStore(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
