export function isProtectedPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/") ||
    pathname === "/onboarding" || pathname.startsWith("/onboarding/") ||
    pathname === "/profile" || pathname.startsWith("/profile/") ||
    pathname === "/account" || pathname.startsWith("/account/") ||
    pathname === "/conversations" || pathname.startsWith("/conversations/") ||
    pathname === "/progress" || pathname.startsWith("/progress/") ||
    pathname === "/goals" || pathname.startsWith("/goals/") ||
    pathname === "/memories" || pathname.startsWith("/memories/");
}
