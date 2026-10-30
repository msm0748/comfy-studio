import { NextResponse, type NextRequest } from 'next/server';
import { authDecision, getAuthConfig, loginURL, SESSION_COOKIE, verifySession } from './lib/auth';

export function proxy(request: NextRequest) {
  const auth = getAuthConfig();
  const decision = authDecision(request.nextUrl.pathname, !!auth && verifySession(request.cookies.get(SESSION_COOKIE)?.value, auth), !!auth);
  if (decision === 'allow') return NextResponse.next();
  if (decision === 'unauthorized') return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const destination = loginURL(request.headers);
  if (!destination) return new NextResponse('Invalid host', { status: 400 });
  const response = NextResponse.redirect(destination);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
export const config = { matcher: ['/((?!_next/static|favicon.ico|api/swaps/sources).*)'] };
