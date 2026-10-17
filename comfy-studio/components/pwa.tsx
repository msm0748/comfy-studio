 'use client';
import {useEffect,useState} from 'react';
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export function Pwa(){
 const [install,setInstall]=useState<InstallEvent|null>(null);const [ios,setIos]=useState(false);const [offline,setOffline]=useState(false);const [dismissed,setDismissed]=useState(false);
 useEffect(()=>{
  if('serviceWorker' in navigator)void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{});
  const standalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone;
  const sync=()=>setOffline(!navigator.onLine);
  const timer=setTimeout(()=>{sync();setIos(!standalone&&/iPad|iPhone|iPod/.test(navigator.userAgent));setDismissed(sessionStorage.getItem('studio-install-dismissed')==='1');},0);
  const before=(event:Event)=>{event.preventDefault();if(!standalone)setInstall(event as InstallEvent);};
  const installed=()=>{setInstall(null);setIos(false);};
  window.addEventListener('online',sync);window.addEventListener('offline',sync);window.addEventListener('beforeinstallprompt',before);window.addEventListener('appinstalled',installed);
  return()=>{clearTimeout(timer);window.removeEventListener('online',sync);window.removeEventListener('offline',sync);window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',installed);};
 },[]);
 return <>{offline&&<div className="pwa-offline" role="status">연결이 끊겼어요. 연결이 복구되면 다시 시도해 주세요.</div>}{!dismissed&&(install||ios)&&<aside className="pwa-install" aria-label="앱 설치">{ios?'Safari 공유 → 홈 화면에 추가로 설치하세요.':'Comfy Studio를 앱으로 사용해 보세요.'}{install&&<button onClick={async()=>{await install.prompt();await install.userChoice;setInstall(null);}}>앱 설치</button>}<button aria-label="설치 안내 닫기" onClick={()=>{setDismissed(true);sessionStorage.setItem('studio-install-dismissed','1');}}>닫기</button></aside>}</>;
}
