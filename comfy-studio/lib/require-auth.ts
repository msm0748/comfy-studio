import { cookies } from 'next/headers';
import { getAuthConfig, SESSION_COOKIE, verifySession } from './auth';
import { ServiceError } from './jobs';

// Check at the data boundary as well as in Proxy.
export async function requireAuth() {
  const config = getAuthConfig();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!config || !verifySession(token, config)) throw new ServiceError('로그인이 필요합니다.', 401);
}
