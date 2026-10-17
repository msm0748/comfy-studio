'use client';
export function LogoutButton() {
  return <button className="logout-button" onClick={async () => { const response = await fetch('/api/auth/logout', { method: 'POST' }); if (response.ok || response.status === 401) window.location.replace('/login'); }}>로그아웃</button>;
}
