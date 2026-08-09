export function isProtectedPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/") ||
    pathname === "/onboarding" || pathname.startsWith("/onboarding/") ||
    pathname === "/account" || pathname.startsWith("/account/") ||
    pathname === "/conversations" || pathname.startsWith("/conversations/");
}
