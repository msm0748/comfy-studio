'use client';
import { useState, type FormEvent } from 'react';

export function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error); }
      window.location.replace('/');
    } catch (e) { setError(e instanceof Error ? e.message : '연결을 확인하고 다시 시도해 주세요.'); setBusy(false); }
  }
  return <main className="login-page"><div className="login-glow" aria-hidden="true"/><a className="login-brand" href="/login">comfy<span>studio</span><b>.</b></a><section className="login-card"><span className="login-eyebrow">YOUR PRIVATE CREATIVE SPACE</span><div className="login-symbol" aria-hidden="true">✳</div><h1>당신의 상상이<br/><span>시작되는 곳.</span></h1><p>나만의 크리에이티브 스튜디오에 오신 것을 환영합니다.</p><form onSubmit={login}><label htmlFor="studio-password">스튜디오 비밀번호</label><input id="studio-password" type="password" autoComplete="current-password" placeholder="비밀번호를 입력해 주세요" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} disabled={busy}/>{error && <p className="login-error" role="alert">{error}</p>}<button className="login-submit" disabled={busy}>{busy ? '확인 중…' : '스튜디오 입장하기'}<span aria-hidden="true">↗</span></button></form><div className="login-note">PRIVATE ACCESS · SECURE SESSION</div></section><footer className="login-footer">A little prompt. Endless possibilities.</footer></main>;
}
