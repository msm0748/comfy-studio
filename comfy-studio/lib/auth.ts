import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'comfy-studio-session';
export const SESSION_SECONDS = 8 * 60 * 60;
export function loginURL(headers: Headers) {
  const host = headers.get('host') ?? '';
  if (host === 'ai.koharu-market.com') return 'https://ai.koharu-market.com/login';
  if (/^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(host)) return `http://${host}/login`;
  return null;
}
type AuthConfig = { password: string; secret: string };
export function getAuthConfig(env: Record<string, string | undefined> = process.env): AuthConfig | null {
  const password = env.STUDIO_PASSWORD;
  const secret = env.STUDIO_SESSION_SECRET;
  return password && password.length >= 8 && secret && secret.length >= 32 ? { password, secret } : null;
}
function digest(value: string, key: string) { return createHmac('sha256', key).update(value).digest(); }
export function checkPassword(input: string, config: AuthConfig) {
  return timingSafeEqual(digest(input, config.secret), digest(config.password, config.secret));
}
function signature(payload: string, config: AuthConfig) {
  return digest(payload, digest(config.password, config.secret).toString('hex'));
}
export function createSession(config: AuthConfig, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_SECONDS * 1000, nonce: randomBytes(16).toString('hex') })).toString('base64url');
  return `${payload}.${signature(payload, config).toString('base64url')}`;
}
export function verifySession(token: string | undefined, config: AuthConfig, now = Date.now()) {
  if (!token || token.length > 1024) return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return false;
  try {
    const actual = Buffer.from(parts[1], 'base64url');
    const expected = signature(parts[0], config);
    if (actual.length !== expected.length || actual.toString('base64url') !== parts[1] || !timingSafeEqual(actual, expected)) return false;
    const { exp } = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    return typeof exp === 'number' && Number.isFinite(exp) && exp > now && exp <= now + SESSION_SECONDS * 1000;
  } catch { return false; }
}
export function authDecision(path: string, authenticated: boolean, configured: boolean) {
  if (path === '/login' || path === '/api/auth/login') return 'allow';
  if (configured && authenticated) return 'allow';
  return path.startsWith('/api/') ? 'unauthorized' : 'login';
}
export class LoginLimiter {
  private attempts = new Map<string, { count: number; until: number }>();
  allowed(key: string, now = Date.now()) {
    const entry = this.attempts.get(key) ?? (this.attempts.size >= 10000 ? this.attempts.get('overflow') : undefined);
    return !entry || entry.until <= now || entry.count < 5;
  }
  failure(key: string, now = Date.now()) {
    for (const [k, entry] of this.attempts) if (entry.until <= now) this.attempts.delete(k);
    // A bounded map prevents untrusted IP headers from exhausting process memory.
    if (this.attempts.size >= 10000 && !this.attempts.has(key)) key = 'overflow';
    const old = this.attempts.get(key);
    this.attempts.set(key, { count: (old?.count ?? 0) + 1, until: old?.until ?? now + 15 * 60 * 1000 });
  }
  success(key: string) { this.attempts.delete(key); }
}
