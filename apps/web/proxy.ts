import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "./src/lib/supabase/middleware";
import { isProtectedPath } from "./src/lib/supabase/protected-routes";
import { getSafeReturnPath } from "./src/lib/supabase/return-path";
import {
  SESSION_POLICY_COOKIE,
  readSessionPolicy,
  touchSessionPolicy,
} from "./src/lib/supabase/session-policy";

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);

  if (!isProtectedPath(request.nextUrl.pathname)) return response;

  const returnPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", getSafeReturnPath(returnPath));
    return NextResponse.redirect(loginUrl);
  }

  const policy = await readSessionPolicy(request.cookies.get(SESSION_POLICY_COOKIE)?.value);
  if (policy.status !== "active") {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", getSafeReturnPath(returnPath));
    const redirectResponse = NextResponse.redirect(loginUrl);
    clearAuthCookies(request, response, redirectResponse);
    return redirectResponse;
  }

  const refreshedPolicy = await touchSessionPolicy(policy.state);
  if (refreshedPolicy) {
    response.cookies.set(SESSION_POLICY_COOKIE, refreshedPolicy, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
  }
  return response;
}

function clearAuthCookies(request: NextRequest, refreshedResponse: NextResponse, redirectResponse: NextResponse) {
  const names = new Set([
    ...request.cookies.getAll().map((cookie) => cookie.name),
    ...refreshedResponse.cookies.getAll().map((cookie) => cookie.name),
  ]);
  for (const name of names) {
    if (name.startsWith("sb-")) {
      redirectResponse.cookies.set(name, "", { path: "/", maxAge: 0, expires: new Date(0) });
    }
  }
  redirectResponse.cookies.set(SESSION_POLICY_COOKIE, "", { path: "/", maxAge: 0, expires: new Date(0) });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
