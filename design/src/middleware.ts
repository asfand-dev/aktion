import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionEdge } from "@/lib/session-edge";

export const config = {
  matcher: [
    "/projects/:path*",
    "/editor/:path*",
    "/preview/:path*",
    "/login",
    "/register",
  ],
};

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionEdge(token) : null;

  const { pathname, search } = req.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (isAuthPage) {
    if (user) {
      return NextResponse.redirect(new URL("/projects", req.url));
    }
    return NextResponse.next();
  }

  if (!user) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}
