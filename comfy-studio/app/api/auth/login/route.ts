import { NextResponse } from 'next/server';
import { checkPassword, createSession, getAuthConfig, LoginLimiter, SESSION_COOKIE, SESSION_SECONDS } from '../../../../lib/auth';
import { sameOrigin } from '../../../../lib/api';

const limiter = new LoginLimiter();
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try { sameOrigin(request); } catch { return NextResponse.json({ error: '허용되지 않은 요청입니다.' }, { status: 403, headers }); }
  const auth = getAuthConfig();
  if (!auth) return NextResponse.json({ error: '서버의 로그인 환경변수 설정을 완료해 주세요.' }, { status: 503, headers });
  const key = request.headers.get('cf-connecting-ip') || 'local';
  if (!limiter.allowed(key)) return NextResponse.json({ error: '시도가 너무 많습니다. 15분 후 다시 시도해 주세요.' }, { status: 429, headers: { ...headers, 'Retry-After': '900' } });
  let password: unknown;
  try {
    const body = await request.text();
    if (body.length > 2048) throw new Error('body too large');
    password = JSON.parse(body).password;
  } catch { return NextResponse.json({ error: '올바른 비밀번호를 입력해 주세요.' }, { status: 400, headers }); }
  // Recheck after reading the body; this synchronous reservation closes the concurrency race.
  if (!limiter.allowed(key)) return NextResponse.json({ error: '시도가 너무 많습니다. 15분 후 다시 시도해 주세요.' }, { status: 429, headers: { ...headers, 'Retry-After': '900' } });
  limiter.failure(key);
  if (typeof password !== 'string' || password.length > 256 || !checkPassword(password, auth)) {
    return NextResponse.json({ error: '비밀번호를 확인해 주세요.' }, { status: 401, headers });
  }
  limiter.success(key);
  const response = NextResponse.json({ ok: true }, { headers });
  response.cookies.set(SESSION_COOKIE, createSession(auth), { httpOnly: true, sameSite: 'strict', secure: request.headers.get('x-forwarded-proto') === 'https' || new URL(request.url).protocol === 'https:', path: '/', maxAge: SESSION_SECONDS });
  return response;
}
