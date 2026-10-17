import { NextResponse } from 'next/server';
import { sameOrigin } from '../../../../lib/api';
import { SESSION_COOKIE } from '../../../../lib/auth';
export async function POST(request: Request) {
  try { sameOrigin(request); } catch { return NextResponse.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 }); }
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'strict', secure: request.headers.get('x-forwarded-proto') === 'https', path: '/', maxAge: 0 });
  return response;
}
