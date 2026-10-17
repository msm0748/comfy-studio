'use client';
import { useCallback,useEffect,useRef,useState } from 'react';
import type { GenerationInput,JobRecord,ModelId,ModelOption,SizeId } from '@/lib/types';
import { StudioNav } from './studio-nav';
import { GenerationForm } from './generation-form';
import { GenerationResult } from './generation-result';
import { Icon } from './icon';
import { ImageLightbox } from './image-lightbox';
const active=(job:JobRecord|null)=>!!job && ['submitting','queued','running'].includes(job.state);
async function json<T>(url:string,options?:RequestInit):Promise<T> {const response=await fetch(url,{...options,cache:'no-store',signal:options?.signal || AbortSignal.timeout(25000)});const data=await response.json();if(!response.ok)throw new Error(data.error || '요청에 실패했습니다.');return data as T;}
export function Studio() {
  const [models,setModels]=useState<ModelOption[]>([]),[connected,setConnected]=useState<boolean|null>(null);
  const [modelId,setModelId]=useState<ModelId>('z-image'),[sizeId,setSizeId]=useState<SizeId>('square'),[prompt,setPrompt]=useState('');
  const [job,setJob]=useState<JobRecord|null>(null),[result,setResult]=useState<JobRecord|null>(null),[error,setError]=useState('');
  const [submitting,setSubmitting]=useState(false),[elapsed,setElapsed]=useState(0),[expanded,setExpanded]=useState(false);
  const submitLock=useRef(false),promptRef=useRef<HTMLDivElement>(null);
  const busy=submitting || active(job);
  const accept=useCallback((next:JobRecord)=>{setJob(next);if(next.state==='completed'){setResult(next);setError('');localStorage.setItem('comfy-studio-result',next.id);}if(next.state==='failed')setError(next.error || '생성에 실패했습니다.');},[]);
  const refresh=useCallback(async()=>{try{const data=await json<{connected:boolean;models:ModelOption[]}>('/api/models');setModels(data.models);setConnected(data.connected);}catch{setConnected(false);}},[]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{let cancelled=false;const controller=new AbortController();const previous=localStorage.getItem('comfy-studio-result');const current=localStorage.getItem('comfy-studio-job');if(previous)void json<JobRecord>('/api/generations/'+encodeURIComponent(previous),{signal:controller.signal}).then(value=>{if(!cancelled&&value.state==='completed')setResult(value);}).catch(()=>{});if(current)void json<JobRecord>('/api/generations/'+encodeURIComponent(current),{signal:controller.signal}).then(value=>{if(!cancelled)accept(value);}).catch(()=>{if(!cancelled)setError('이전 작업의 상태를 확인하지 못했습니다. 상태 다시 확인을 눌러주세요.');});return()=>{cancelled=true;controller.abort();};},[accept]);
  useEffect(()=>{
    if(!job || !active(job))return;
    let cancelled=false;let timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
    async function poll(){try{const next=await json<JobRecord>('/api/generations/'+job!.id,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});if(cancelled)return;accept(next);if(active(next)){setError('');timer=setTimeout(poll,2000);}}catch{if(!cancelled){setError('연결이 잠시 끊겼어요. 같은 작업의 상태를 다시 확인하고 있습니다.');timer=setTimeout(poll,5000);}}}
    timer=setTimeout(poll,2000);return()=>{cancelled=true;clearTimeout(timer);controller.abort();};
  },[job?.id,active(job),accept]);
  useEffect(()=>{if(!busy||!job)return;const tick=()=>setElapsed(Math.max(0,Math.floor((Date.now()-Date.parse(job.createdAt))/1000)));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[busy,job?.id,job?.createdAt]);
  async function submit(input:GenerationInput){if(submitLock.current||busy)return;submitLock.current=true;setSubmitting(true);setError('');setElapsed(0);const id=crypto.randomUUID();localStorage.setItem('comfy-studio-job',id);try{accept(await json<JobRecord>('/api/generations',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify(input)}));}catch(cause){setError(cause instanceof Error?cause.message:'요청에 실패했습니다.');}finally{setSubmitting(false);submitLock.current=false;}}
  async function reconnect(){void refresh();const id=localStorage.getItem('comfy-studio-job');if(id)try{accept(await json<JobRecord>('/api/generations/'+encodeURIComponent(id)));}catch(cause){setError(cause instanceof Error?cause.message:'상태를 확인하지 못했습니다.');}}
  function chooseIdea(value:string){setPrompt(value);promptRef.current?.querySelector('textarea')?.focus({preventScroll:true});if(window.innerWidth<800)promptRef.current?.scrollIntoView({behavior:'smooth',block:'start'});}
  return <><StudioNav connected={connected}/><div className="studio-shell"><aside className="tool-rail" aria-label="현재 작업 공간"><span className="rail-active" title="이미지 스튜디오"><Icon name="image" size={21}/></span><span className="rail-line"/><span className="rail-label">CREATE</span><span className="rail-bottom">CS</span></aside><main className="studio-main"><div className="page-heading"><div><div className="heading-eyebrow"><span/>YOUR PERSONAL CREATIVE SPACE</div><h1>상상을, 이미지로<span>.</span></h1><p>당신의 아이디어에 딱 맞는 한 장을 만들어보세요.</p></div><span className="workspace-badge"><Icon name="sparkles" size={15}/>IMAGE STUDIO<span>01</span></span></div><div className="workspace"><div ref={promptRef}><GenerationForm models={models} modelId={modelId} sizeId={sizeId} prompt={prompt} busy={busy} connected={connected} onModel={value=>{setModelId(value);setSizeId('square');}} onSize={setSizeId} onPrompt={setPrompt} onSubmit={submit} onRefresh={refresh}/></div><GenerationResult job={job} result={result} elapsed={elapsed} error={error} onIdea={chooseIdea} onExpand={()=>setExpanded(true)} onReconnect={reconnect} busy={busy}/></div><footer className="studio-footer"><span>LESS SETUP. MORE IMAGINATION.</span><span>나만의 크리에이티브 스튜디오 <span className="footer-dot">✦</span></span></footer></main></div>{expanded&&result&&<ImageLightbox result={result} onClose={()=>setExpanded(false)}/>}</>;
}


